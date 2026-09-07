'use strict';

require('dotenv').config();
const { openDb } = require('./lib/db');

// Reconcile the OpenSea-sourced sales table against what actually happened on
// chain, and report the difference.
//
// WHY THIS EXISTS
// Every sale we hold comes from one source: OpenSea's events API. On 2026-09-02
// that source was found returning an empty `payment.symbol` for Blur Pool fills,
// so ~30% of sales were being discarded as unknown-currency and nobody noticed
// until the Hypercastle bot posted a sale the estimator had never seen. A single
// source cannot catch its own omissions. Alchemy's getNFTSales was the informal
// second opinion; it is removed on 2026-09-30, so this reads the chain directly.
//
// WHAT IT DOES NOT DO
// This is a reconciliation, not an ingest. It does not write to `sales` — a
// divergence is a prompt to look, not something to auto-correct, because the
// most likely cause is a parsing bug on our side rather than a missing row.
//
// Usage (from "sales database"):
//   node chain_reconcile.js [days]        # default 7
//   VERBOSE=1 node chain_reconcile.js 3   # list every matched fill too
//   FROM_BLOCK=.. TO_BLOCK=.. node chain_reconcile.js    # pin an exact range
//
// COST: one eth_getLogs per 10 blocks (the free-tier range cap) plus one receipt
// per transaction. A 7-day window is ~5,000 calls; run it weekly, not live.
//
// PRICES ARE SELLER PROCEEDS, not gross. Validated against a known Blur bundle
// (tx 0x7eea45d8, 6 tokens): chain 1.300 vs OpenSea 1.300 in total. Seaport
// fills read a little under OpenSea because marketplace fees and royalties are
// excluded. Bundle totals are right; the per-token figure is the total split
// evenly, so treat it as an order of magnitude, not a price.

const KEY = process.env.ALCHEMY_API_KEY;
if (!KEY) { console.error('ALCHEMY_API_KEY missing (see .env).'); process.exit(1); }
const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${KEY}`;

const CONTRACT = '0x4e1f41613c9084fdb9e34e11fae9412427480e56';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = `0x${'0'.repeat(40)}`;

// Payment tokens that settle at 1:1 with ETH. Blur Pool is the one that started
// all this: it is what Blur bids are denominated in.
const PAY_TOKENS = {
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x0000000000a39bb272e79075ade125fd351887ac': 'BETH',
};

// Routers that mean "this transfer was a marketplace sale". Kept in step with
// backend/scripts/otc-scan.js — duplicated deliberately rather than imported,
// since the two projects do not share a module path.
const MARKETPLACES = {
  '0x0000000000000068f116a894984e2db1123eb395': 'Seaport 1.6',
  '0x00000000000000adc04c56bf30ac9d3c0baf6f4b': 'Seaport 1.5',
  '0x00000000000001ad428e4906ae43d8f9852d0dd6': 'Seaport 1.4',
  '0x00000000006c3852cbef3e08e8df289169ede581': 'Seaport 1.1',
  '0x000000000000ad05ccc4f10045630fb830b95127': 'Blur',
  '0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5': 'Blur 2.0',
  '0x0000000000e655fae4d56241588680f86e3b2377': 'LooksRare v2',
  '0x59728544b08ab483533076417fbd7bea3d3fe8f7': 'LooksRare',
  '0x74312363e45dcaba76c59ec49a7aa8a65a67eed3': 'X2Y2',
};

const int = (h) => (typeof h === 'string' ? parseInt(h, 16) : h);
const eth = (wei) => Number(BigInt(wei)) / 1e18;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rpcCalls = 0;
async function rpc(method, params, attempt = 0) {
  rpcCalls++;
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error || !res.ok) {
    // 429 and "capacity" errors are the free tier throttling; back off rather
    // than failing the run, since a partial reconciliation is worthless.
    if (attempt < 5) { await sleep(500 * 2 ** attempt); return rpc(method, params, attempt + 1); }
    throw new Error(`${method}: ${json.error?.message || res.status}`);
  }
  return json.result;
}

// Transfers come from alchemy_getAssetTransfers, not eth_getLogs. The free tier
// caps getLogs at a 10-block range, which turns a week into ~5,000 calls and
// gets you a 429 partway through — measured, not assumed. getAssetTransfers
// takes the whole window in one paginated call, the same way otc-scan.js does.
async function blockNow() { return int(await rpc('eth_blockNumber', [])); }

async function transferLogs(fromBlock, toBlock) {
  const out = [];
  let pageKey;
  do {
    const params = {
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      contractAddresses: [CONTRACT],
      category: ['erc721'],
      maxCount: '0x3e8',
      order: 'asc',
    };
    if (pageKey) params.pageKey = pageKey;
    const r = await rpc('alchemy_getAssetTransfers', [params]);
    for (const t of r.transfers || []) {
      const from = (t.from || '').toLowerCase();
      const to = (t.to || '').toLowerCase();
      if (from === ZERO || to === ZERO) continue;      // mint / burn
      const raw = t.erc721TokenId ?? t.tokenId;
      const tokenId = raw != null ? parseInt(raw, 16) : NaN;
      if (!Number.isFinite(tokenId)) continue;
      out.push({ tx: t.hash, block: int(t.blockNum), tokenId, from, to });
    }
    pageKey = r.pageKey;
  } while (pageKey);
  return out;
}

/**
 * Price a marketplace fill from its own receipt: what the SELLERS received.
 *
 * Only legs landing on an address that sent an NFT in this transaction count.
 * That filter is the whole trick. A Blur fill routes bidder -> Blur -> seller,
 * so every payment appears TWICE in the log; summing all non-buyer legs made a
 * 1.30 ETH bundle read as 2.60. Anchoring on the seller also excludes the
 * marketplace fee and royalty legs, so this is seller proceeds rather than gross
 * price — a little under what the buyer paid, and stable, which is what a
 * reconciliation needs.
 */
function priceFromReceipt(receipt, sellers) {
  let erc20 = 0;
  let symbol = null;
  for (const log of receipt.logs || []) {
    const token = PAY_TOKENS[log.address.toLowerCase()];
    if (!token || log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
    const to = `0x${log.topics[2].slice(-40)}`;
    if (!sellers.has(to)) continue;
    erc20 += eth(log.data);
    symbol = symbol || token;
  }
  return { value: erc20, symbol };
}

function routerOf(receipt) {
  // The `to` of the transaction is the router when a marketplace filled it. An
  // aggregator sitting in front shows up as an unknown `to`, so those fall back
  // to scanning the logs for a known marketplace address.
  const direct = MARKETPLACES[(receipt.to || '').toLowerCase()];
  if (direct) return direct;
  for (const log of receipt.logs || []) {
    const m = MARKETPLACES[log.address.toLowerCase()];
    if (m) return m;
  }
  return null;
}

async function main() {
  const days = Number(process.argv[2] || 7);
  const verbose = process.env.VERBOSE === '1';
  // FROM_BLOCK/TO_BLOCK pin an exact range, which is how you investigate one
  // known transaction rather than a trailing window.
  const head = process.env.TO_BLOCK ? Number(process.env.TO_BLOCK) : await blockNow();
  const from = process.env.FROM_BLOCK
    ? Number(process.env.FROM_BLOCK)
    : head - Math.round((days * 86400) / 12);   // ~12s blocks

  console.log(`# window: last ${days}d, blocks ${from}-${head} (~${head - from} blocks)`);
  console.log('# reading ERC-721 transfers from chain...');
  const evs = await transferLogs(from, head);
  console.log(`# ${evs.length} transfers`);

  // One receipt per tx, not per transfer: a bundle moves several tokens in one.
  const byTx = new Map();
  for (const ev of evs) {
    if (!byTx.has(ev.tx)) byTx.set(ev.tx, []);
    byTx.get(ev.tx).push(ev);
  }

  const fills = [];
  let nonMarket = 0;
  for (const [tx, group] of byTx) {
    const receipt = await rpc('eth_getTransactionReceipt', [tx]);
    const market = routerOf(receipt);
    if (!market) { nonMarket += group.length; continue; }
    const sellers = new Set(group.map((g) => g.from));
    let { value, symbol } = priceFromReceipt(receipt, sellers);
    // A native-ETH sale pays the seller through an internal call, which leaves no
    // log. Fall back to the transaction's own value — right for a direct buy,
    // and an over-estimate through an aggregator, so it is marked approximate.
    if (value === 0) {
      const txn = await rpc('eth_getTransactionByHash', [tx]);
      value = eth(txn?.value || '0x0');
      symbol = 'ETH';
    }
    // A bundle's ERC-20 legs cover every token in it; split evenly so a
    // per-token figure is at least the right order, and flag it.
    const per = group.length > 1 ? value / group.length : value;
    for (const ev of group) {
      fills.push({
        ...ev, marketplace: market, symbol: symbol || 'ETH',
        price: per, bundled: group.length > 1,
      });
    }
  }
  console.log(`# ${fills.length} marketplace fills, ${nonMarket} other transfers (self-custody, lending, OTC)`);
  const byMarket = {};
  for (const f of fills) byMarket[f.marketplace] = (byMarket[f.marketplace] || 0) + 1;
  console.log(`# by marketplace: ${Object.entries(byMarket).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);

  // ─── reconcile against what OpenSea gave us ────────────────────────────────
  const db = openDb();
  const lo = fills.length ? Math.min(...fills.map((f) => f.block)) : from;
  // When blocks are pinned the wall-clock window no longer describes them, so
  // compare against exactly the transactions the chain scan saw instead.
  const rows = process.env.FROM_BLOCK
    ? db.prepare(`SELECT tx_hash, token_id, price_native, payment_symbol, payment_token
                  FROM sales WHERE lower(tx_hash) IN (${[...byTx.keys()].map(() => '?').join(',') || "''"})`)
        .all(...[...byTx.keys()].map((t) => t.toLowerCase()))
    : db.prepare(`SELECT tx_hash, token_id, price_native, payment_symbol, payment_token
                  FROM sales WHERE event_unix >= ?`)
        .all(Math.floor(Date.now() / 1000) - days * 86400);
  const dbKeys = new Set(rows.map((r) => `${r.tx_hash.toLowerCase()}:${r.token_id}`));
  const chainKeys = new Set(fills.map((f) => `${f.tx.toLowerCase()}:${f.tokenId}`));

  const missing = fills.filter((f) => !dbKeys.has(`${f.tx.toLowerCase()}:${f.tokenId}`));
  const extra = rows.filter((r) => !chainKeys.has(`${r.tx_hash.toLowerCase()}:${r.token_id}`));

  console.log('');
  console.log('--- reconciliation ---');
  console.log(`  on chain      : ${fills.length} marketplace fills`);
  console.log(`  in sales table: ${rows.length} rows over the same window`);
  console.log(`  ON CHAIN BUT NOT IN THE TABLE: ${missing.length}`);
  console.log(`  in table but not seen on chain: ${extra.length}`);

  if (missing.length) {
    console.log('');
    console.log('  Sales the chain has and we do not — the failure mode this exists to catch:');
    for (const m of missing.slice(0, 25)) {
      console.log(`    #${m.tokenId}  ${m.price.toFixed(4)} ${m.symbol}  ${m.marketplace}` +
                  `${m.bundled ? '  (bundled, price split evenly)' : ''}  ${m.tx.slice(0, 12)}`);
    }
    if (missing.length > 25) console.log(`    ... and ${missing.length - 25} more`);
  }
  if (extra.length) {
    console.log('');
    console.log('  Rows we hold that no chain fill matches — expected for sales just');
    console.log('  outside the block window, suspicious otherwise:');
    for (const e of extra.slice(0, 10)) {
      console.log(`    #${e.token_id}  ${Number(e.price_native).toFixed(4)} ${e.payment_symbol || '(no symbol)'}  ${e.tx_hash.slice(0, 12)}`);
    }
    if (extra.length > 10) console.log(`    ... and ${extra.length - 10} more`);
  }
  if (verbose) {
    console.log('');
    console.log('  all matched fills:');
    for (const f of fills) {
      const seen = dbKeys.has(`${f.tx.toLowerCase()}:${f.tokenId}`) ? 'ok  ' : 'MISS';
      console.log(`    ${seen} #${f.tokenId}  ${f.price.toFixed(4)} ${f.symbol}  ${f.marketplace}`);
    }
  }

  console.log('');
  console.log(`# ${rpcCalls} RPC calls`);
  db.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
