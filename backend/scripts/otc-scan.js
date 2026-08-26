// otc-scan.js — Scan every Terraforms ERC-721 transfer in a window and flag the
// ones that look like private / OTC sales rather than marketplace fills.
//
// Why this exists: the weekly report is built from marketplace sales, so any
// parcel that changes hands by direct transfer (a negotiated deal settled
// wallet-to-wallet) never shows up. This finds those. The hard part is that a
// bare transfer is usually NOT a sale — it's self-custody (hot wallet -> cold
// storage) or NFT-backed lending collateral — so a transfer only gets reported
// as a likely sale when there is payment evidence between the two parties.
//
// Usage:
//   node --env-file=.env scripts/otc-scan.js [days]     # from backend/, default 7
//
// Note on the RPC: Alchemy's free tier caps eth_getLogs at a 10-block range,
// which would need ~5000 calls for a week. alchemy_getAssetTransfers takes the
// whole window in one call, so that is the source of truth here.

const CONTRACT = '0x4e1f41613c9084fdb9e34e11fae9412427480e56';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = `0x${'0'.repeat(40)}`;

// Contracts a transfer can be routed through. Anything here is explained and is
// never an OTC candidate. Unknown routers get auto-probed (see identify()) and
// should be added when they turn up, otherwise they read as false positives.
const KNOWN = {
  // marketplaces
  '0x0000000000000068f116a894984e2db1123eb395': { name: 'Seaport 1.6', kind: 'marketplace' },
  '0x00000000000000adc04c56bf30ac9d3c0baf6f4b': { name: 'Seaport 1.5', kind: 'marketplace' },
  '0x00000000000001ad428e4906ae43d8f9852d0dd6': { name: 'Seaport 1.4', kind: 'marketplace' },
  '0x00000000006c3852cbef3e08e8df289169ede581': { name: 'Seaport 1.1', kind: 'marketplace' },
  '0x000000000000ad05ccc4f10045630fb830b95127': { name: 'Blur', kind: 'marketplace' },
  '0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5': { name: 'Blur 2.0', kind: 'marketplace' },
  '0x0000000000e655fae4d56241588680f86e3b2377': { name: 'LooksRare v2', kind: 'marketplace' },
  '0x59728544b08ab483533076417fbd7bea3d3fe8f7': { name: 'LooksRare', kind: 'marketplace' },
  '0x74312363e45dcaba76c59ec49a7aa8a65a67eed3': { name: 'X2Y2', kind: 'marketplace' },
  '0x178a86d36d89c7fdebea90b739605da7b131ff6a': { name: 'Reservoir Router v6', kind: 'marketplace' },
  // NFT-backed lending — collateral moves, NOT sales. The WETH leg is loan
  // principal, so reading it as a price would invent a sale that never happened.
  // A Gondi refinance through the position migrator moves 4-6 WETH in the same
  // tx as the parcel; that is a loan being rolled, not a 5 ETH trade.
  '0xf41b389e0c1950dc0b16c9498eae77131cc08a56': { name: 'Gondi (multi-source loan)', kind: 'lending' },
  '0xf46a58cada29ff34cf62f72357d2b37815506feb': { name: 'Gondi (purchase bundler)', kind: 'lending' },
  '0xdcd85fee491de4b1fc11cbc0ba0e78537732f5b8': { name: 'Gondi (position migrator)', kind: 'lending' },
  '0xf65b99ce6dc5f6c556172bcc0ff27d3665a7d9a8': { name: 'Gondi (loan v3.0)', kind: 'lending' },
  '0x478f6f994c6fb3cf3e444a489b3ad9edb8ccae16': { name: 'Gondi (loan v2)', kind: 'lending' },
  '0xca5a494ca20483e21ec1e41fe1d9461da77595bd': { name: 'Gondi (loan v1)', kind: 'lending' },
  '0xcea7eea12c6fc82d0318704b9d35a4192c2d260a': { name: 'Gondi (purchase bundler v3.0)', kind: 'lending' },
  '0x3b59bffe109e0f33f20887343759a98b48ecdf5f': { name: 'Gondi (purchase bundler v2)', kind: 'lending' },
  '0x2995ae7233fa89b314b5a707465b57a582f440f0': { name: 'Gondi (liquidation v3)', kind: 'lending' },
  '0x97d34635b605c2f1630d6b4c6c5d222b8a2ca47d': { name: 'Gondi (liquidation v2)', kind: 'lending' },
  '0x237e4421c742d843fdd96d22294d338507e17091': { name: 'Gondi (liquidation v1)', kind: 'lending' },
  '0x4ecc15ded6e2eb38cce6b0bd0bb0e417813f8f09': { name: 'Gondi (marketplace manager v3)', kind: 'lending' },
  '0x823de2c44369e94cac3da789ad4b6493e27e4bfe': { name: 'Gondi (user vaults v3)', kind: 'lending' },
  '0x14a6dcebb2bb73aae1b199ccaada75247b81976d': { name: 'Gondi (user vaults v2)', kind: 'lending' },
  // NFTfi — the other lender active on Terraforms. Identified from the NFTfi
  // Obligation Receipt (0x48ed998e...) minted inside these txs; neither loan
  // contract answers name().
  '0xb6adec2acc851d30d5fb64f3137234bcdcbbad0d': { name: 'NFTfi (loan)', kind: 'lending' },
  '0x4bc5fa56f2931e7a37417fa55dda71e4b7c2f2a3': { name: 'NFTfi (loan, refinance)', kind: 'lending' },
  '0x2ae3e46290ade43593eabd15642ebd67157f5351': { name: 'NFTfi (collateral escrow)', kind: 'lending' },
  // Routes a real wallet-to-wallet transfer can take. These stay candidates —
  // a negotiated deal settles through exactly these paths.
  [CONTRACT]: { name: 'Terraforms (direct transferFrom)', kind: 'direct' },
  '0x0000000000c2d145a2526bd8c716263bfebe1a72': { name: 'batch transfer helper', kind: 'direct' },
  // ERC-4337 EntryPoint: a smart account batching calls, same blind spot as
  // EIP-7702 — the real venue is only visible in the receipt logs.
  '0x0000000071727de22e5e9d8baf0edac6f37da032': { name: 'ERC-4337 EntryPoint', kind: 'direct' },
};

const byKind = (kind) =>
  new Set(Object.entries(KNOWN).filter(([, v]) => v.kind === kind).map(([k]) => k));

// Counterparties that make a transfer lending regardless of how it was routed.
const LENDING = byKind('lending');
// Checked against receipt logs, not just tx.to: an EIP-7702 account batching a
// bulk offer-accept calls Seaport from inside its own tx, so tx.to is the user's
// own wallet and the fill is invisible unless we look at what the tx emitted.
const MARKETPLACES = byKind('marketplace');

// Payment under half the floor is not a parcel price — it is a gas top-up or a
// partial, which points at self-custody rather than a sale. Resolved from the
// live floor in main(); this is the fallback if the estimator is unreachable.
let minPriceEth = 0.15;

let RPC;

async function rpc(method, params, attempt = 0) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return rpc(method, params, attempt + 1);
    }
    throw new Error(`${method}: ${json?.error?.message || res.status}`);
  }
  return json.result;
}

const int = (h) => (typeof h === 'string' ? parseInt(h, 16) : h);
const eth = (wei) => Number(BigInt(wei)) / 1e18;

async function blockTs(n) {
  return int((await rpc('eth_getBlockByNumber', [`0x${n.toString(16)}`, false])).timestamp);
}

// First block at or after targetTs.
async function blockAt(targetTs, lo, hi) {
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await blockTs(mid)) < targetTs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

async function transfers(from, to) {
  const out = [];
  let pageKey;
  do {
    const params = {
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
      contractAddresses: [CONTRACT],
      category: ['erc721'],
      maxCount: '0x3e8',
      order: 'asc',
    };
    if (pageKey) params.pageKey = pageKey;
    const r = await rpc('alchemy_getAssetTransfers', [params]);
    out.push(...r.transfers);
    pageKey = r.pageKey;
  } while (pageKey);
  return out;
}

// An unlabelled router silently becomes a false OTC hit, so probe anything new:
// contracts usually answer name(), which is how Gondi was identified.
async function identify(addr) {
  const code = await rpc('eth_getCode', [addr, 'latest']);
  if (!code || code === '0x') return { type: 'EOA' };
  // 23 bytes starting 0xef0100 is an EIP-7702 delegation — still a user wallet.
  if (code.startsWith('0xef0100') && code.length === 48) return { type: 'EOA (EIP-7702 smart account)' };
  let name = null;
  try {
    const r = await rpc('eth_call', [{ to: addr, data: '0x06fdde03' }, 'latest']);
    if (r && r !== '0x') {
      const bytes = Buffer.from(r.slice(2), 'hex');
      const len = Number(BigInt(`0x${bytes.subarray(32, 64).toString('hex')}`));
      name = bytes.subarray(64, 64 + len).toString('utf8').replace(/\0/g, '') || null;
    }
  } catch { /* not every contract exposes name() */ }
  return { type: 'CONTRACT', name };
}

// Lifetime ETH flow between the two wallets, which is the best same-entity test
// we have. One wallet repeatedly paying the other in parcel-sized amounts reads
// as a standing OTC relationship; balanced two-way flow reads as one person
// shuffling funds between their own wallets.
async function linkage(a, b) {
  const dir = async (from, to) => {
    try {
      const r = await rpc('alchemy_getAssetTransfers', [{
        fromBlock: '0x0', toBlock: 'latest', category: ['external'],
        excludeZeroValue: true, fromAddress: from, toAddress: to, maxCount: '0x64',
      }]);
      const t = r.transfers || [];
      return { n: t.length, total: t.reduce((s, x) => s + Number(x.value || 0), 0) };
    } catch {
      return { n: 0, total: 0 };
    }
  };
  return { buyerToSeller: await dir(b, a), sellerToBuyer: await dir(a, b) };
}

// Payment moving from the parcel's recipient to its sender is what separates a
// sale from a custody move. Checked in the same tx and in a +/-1 day window.
async function paymentEvidence(ev, windowLo, receipt) {
  const found = [];
  const lo = Math.max(windowLo, ev.block - 7200);
  const hi = ev.block + 7200;

  for (const log of receipt?.logs || []) {
    if (
      log.address.toLowerCase() === WETH &&
      log.topics.length === 3 &&
      log.topics[0] === TRANSFER_TOPIC &&
      `0x${log.topics[2].slice(-40)}` === ev.from
    ) {
      const value = eth(log.data);
      found.push({ value, text: `${value.toFixed(4)} WETH paid to the sender in the same tx` });
    }
  }

  // An atomic deal settles through an escrow, so the ETH reaching the seller
  // comes from the contract rather than from the buyer's address. Look for any
  // internal ETH landing on the seller inside this very tx.
  try {
    const sameTx = (await rpc('alchemy_getAssetTransfers', [{
      fromBlock: `0x${ev.block.toString(16)}`,
      toBlock: `0x${ev.block.toString(16)}`,
      category: ['internal'],
      excludeZeroValue: true,
      maxCount: '0x64',
      toAddress: ev.from,
    }])).transfers || [];
    for (const h of sameTx) {
      if (h.hash !== ev.tx) continue;
      const value = Number(h.value || 0);
      found.push({ value, text: `${value.toFixed(4)} ETH paid to the sender in the same tx (via ${h.from})` });
    }
  } catch { /* internal category unavailable */ }

  for (const [categories, label] of [[['external', 'internal'], 'ETH'], [['erc20'], 'WETH']]) {
    let hits = [];
    try {
      hits = (await rpc('alchemy_getAssetTransfers', [{
        fromBlock: `0x${lo.toString(16)}`,
        toBlock: `0x${hi.toString(16)}`,
        category: categories,
        excludeZeroValue: true,
        maxCount: '0x32',
        fromAddress: ev.to,
        toAddress: ev.from,
      }])).transfers || [];
    } catch { /* category unsupported on this tier */ }
    for (const h of hits) {
      if (label === 'WETH' && (h.rawContract?.address || '').toLowerCase() !== WETH) continue;
      const mins = Math.round(((int(h.blockNum) - ev.block) * 12) / 60);
      const value = Number(h.value);
      found.push({
        value,
        text: `${value.toFixed(4)} ${label} sent recipient -> sender (${mins >= 0 ? '+' : ''}${mins} min)`,
      });
    }
  }
  return found;
}

async function main() {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    console.error('[otc-scan] ALCHEMY_API_KEY not set.');
    process.exit(1);
  }
  RPC = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

  const days = Number(process.argv[2] || 7);

  // Anchor the "is this payment big enough to be a price?" test to the floor.
  try {
    const r = await fetch('https://terraform-estimator.onrender.com/api/weekly-report-data');
    const floor = (await r.json())?.market?.floor_eth;
    if (floor > 0) minPriceEth = floor * 0.5;
  } catch { /* keep the fallback */ }
  console.log(`# payment must be >= ${minPriceEth.toFixed(4)} ETH to read as a price`);

  const latest = int(await rpc('eth_blockNumber', []));
  const nowTs = await blockTs(latest);
  const start = await blockAt(nowTs - days * 86400, latest - Math.ceil((days * 86400) / 11) - 20000, latest);
  const iso = (ts) => new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`# window ${iso(await blockTs(start))} -> ${iso(nowTs)} UTC (blocks ${start}-${latest})`);

  const raw = await transfers(start, latest);
  console.log(`# ${raw.length} ERC-721 transfers\n`);

  const events = raw.map((t) => ({
    block: int(t.blockNum),
    tx: t.hash,
    token: int(t.erc721TokenId),
    from: (t.from || ZERO).toLowerCase(),
    to: (t.to || ZERO).toLowerCase(),
  }));

  const txCache = new Map();
  const rcCache = new Map();
  const tsCache = new Map();
  const perTx = new Map();
  for (const e of events) perTx.set(e.tx, (perTx.get(e.tx) || 0) + 1);
  for (const e of events) {
    if (!txCache.has(e.tx)) {
      txCache.set(e.tx, await rpc('eth_getTransactionByHash', [e.tx]));
      rcCache.set(e.tx, await rpc('eth_getTransactionReceipt', [e.tx]));
    }
    if (!tsCache.has(e.block)) tsCache.set(e.block, await blockTs(e.block));
    const tx = txCache.get(e.tx);
    e.txTo = (tx.to || '').toLowerCase();
    e.txFrom = (tx.from || '').toLowerCase();
    e.txValue = eth(tx.value || '0x0');
    e.ts = tsCache.get(e.block);
    e.batch = perTx.get(e.tx);
    // Did any marketplace emit an event in this tx, however it was entered?
    e.filledOn = null;
    for (const log of rcCache.get(e.tx)?.logs || []) {
      const addr = log.address.toLowerCase();
      if (MARKETPLACES.has(addr)) {
        e.filledOn = KNOWN[addr].name;
        break;
      }
    }
  }

  // Label every router we saw, probing the ones we don't know.
  const routers = new Map();
  for (const e of events) {
    if (routers.has(e.txTo)) continue;
    routers.set(e.txTo, KNOWN[e.txTo] || { name: null, kind: 'unknown', probe: await identify(e.txTo) });
  }

  const groups = { marketplace: [], lending: [], candidate: [], mint: [] };
  for (const e of events) {
    const r = routers.get(e.txTo);
    e.venue = r.name || r.probe?.name || e.txTo;
    // Counterparty wins over route: a parcel entering or leaving a loan escrow
    // is collateral however it was routed.
    if (e.from === ZERO || e.to === ZERO) groups.mint.push(e);
    else if (r.kind === 'lending' || LENDING.has(e.from) || LENDING.has(e.to)) groups.lending.push(e);
    else if (r.kind === 'marketplace') groups.marketplace.push(e);
    else if (e.filledOn) {
      e.venue = `${e.filledOn} (batched via ${r.kind === 'direct' ? r.name : e.txTo})`;
      groups.marketplace.push(e);
    } else groups.candidate.push(e);
  }

  const tally = (arr) => {
    const m = new Map();
    for (const e of arr) m.set(e.venue, (m.get(e.venue) || 0) + 1);
    return [...m].map(([k, v]) => `${k} x${v}`).join(', ');
  };
  console.log(`# marketplace fills : ${groups.marketplace.length}  (${tally(groups.marketplace) || '-'})`);
  console.log(`# lending movements : ${groups.lending.length}  (${tally(groups.lending) || '-'})`);
  console.log(`# mints / burns     : ${groups.mint.length}`);
  console.log(`# OTC candidates    : ${groups.candidate.length}\n`);

  if (groups.lending.length) {
    const protocol = (e) => (e.venue.startsWith('NFTfi') ? 'NFTfi' : e.venue.startsWith('Gondi') ? 'Gondi' : e.venue);
    const parcels = new Set(groups.lending.map((e) => e.token));
    const opened = groups.lending.filter((e) => LENDING.has(e.to));
    const closed = groups.lending.filter((e) => LENDING.has(e.from));
    const levered = groups.lending.filter((e) => /purchase bundler/.test(e.venue));
    const byProtocol = new Map();
    for (const e of groups.lending) {
      const k = protocol(e);
      if (!byProtocol.has(k)) byProtocol.set(k, new Set());
      byProtocol.get(k).add(e.token);
    }
    console.log('--- lending market activity ---');
    console.log(`  ${parcels.size} parcels touched lending: `
      + [...byProtocol].map(([k, v]) => `${k} ${v.size}`).join(', '));
    console.log(`  ${opened.length} moves into escrow (loan opened/rolled), ${closed.length} out (repaid/liquidated)`);
    if (levered.length) {
      const ids = [...new Set(levered.map((e) => e.token))];
      console.log(`  leveraged purchase via bundler: ${ids.map((i) => `#${i}`).join(', ')}`);
    }
    console.log(`  parcels: ${[...parcels].sort((a, b) => a - b).map((i) => `#${i}`).join(', ')}\n`);
  }

  if (!groups.candidate.length) {
    console.log('No unexplained transfers — every movement routed through a known marketplace or lender.');
  }

  for (const e of groups.candidate.sort((a, b) => b.ts - a.ts)) {
    const evidence = await paymentEvidence(e, start, rcCache.get(e.tx));
    const fromId = await identify(e.from);
    const toId = await identify(e.to);
    const priced = evidence.filter((x) => x.value >= minPriceEth);
    const dust = evidence.filter((x) => x.value < minPriceEth);
    const bothWallets = fromId.type.startsWith('EOA') && toId.type.startsWith('EOA');

    let verdict;
    if (priced.length && bothWallets) verdict = 'LIKELY PRIVATE SALE';
    else if (priced.length) verdict = 'payment found, but a contract is involved — inspect';
    else if (e.batch >= 3) verdict = `probably self-custody (${e.batch} parcels in one tx)`;
    else if (dust.length) verdict = 'probably self-custody (only a gas-sized transfer found)';
    else verdict = 'unexplained, no payment found';

    console.log(`#${e.token}  ${new Date(e.ts * 1000).toUTCString().slice(0, 22)}  [${verdict}]`);
    console.log(`   ${e.from} (${fromId.type}${fromId.name ? `: ${fromId.name}` : ''})`);
    console.log(`   -> ${e.to} (${toId.type}${toId.name ? `: ${toId.name}` : ''})`);
    console.log(`   tx ${e.tx}`);
    console.log(`   routed via ${e.venue}${routers.get(e.txTo).kind === 'unknown' ? '  <-- UNKNOWN, identify and add to KNOWN' : ''}`);
    for (const x of priced) console.log(`   + ${x.text}`);
    for (const x of dust) console.log(`   - ${x.text} — below ${minPriceEth.toFixed(4)} ETH, reads as gas`);

    const { buyerToSeller: b2s, sellerToBuyer: s2b } = await linkage(e.from, e.to);
    if (b2s.n || s2b.n) {
      console.log(`   ~ wallet history: recipient paid sender ${b2s.n}x (${b2s.total.toFixed(2)} ETH), `
        + `sender paid recipient ${s2b.n}x (${s2b.total.toFixed(2)} ETH)`);
      if (b2s.n >= 3 && b2s.n > s2b.n * 2) console.log('   ~ one-directional repeat payments — reads as a standing OTC relationship');
      else if (s2b.n && b2s.n && Math.max(b2s.n, s2b.n) <= 2 * Math.min(b2s.n, s2b.n)) console.log('   ~ balanced two-way flow — the two wallets may be the same person');
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(`[otc-scan] ${err.message}`);
  process.exit(1);
});
