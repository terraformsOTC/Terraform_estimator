#!/usr/bin/env node
// build_dream_history.js — the moment each parcel left Terrain, read from the chain.
//
// WHY: the sales DB knows each parcel's mode today (token_meta), not at the sale. A
// parcel that sold in Terrain and was daydreamed later read as a Daydream sale at a
// Terrain price, which taught the model that Daydream keeps more of a parcel's value
// than it does (James, 2026-10-21: daydreaming a Terrain parcel destroys most of its
// biome's value). Terrain is one-way: a dreamed parcel moves between Daydream and
// Terraform but never back. So one moment per parcel decides every sale's mode — its
// first Daydreaming or Terraformed event — and views.sql reads it (parcel_dreams).
//
// Reads Daydreaming(uint256) and Terraformed(uint256,address) logs from the
// Terraforms contract (tokenId in the first data word; parcelStore.js decodes the
// same events live), from deployment on the first run and from the last block
// scanned after that. History needs an archive RPC: publicnode refuses historical
// getLogs, so the default is Pocket, which ArtGod's gap repair was qualified on
// (2026-10-19: it errors on unseen blocks rather than answering []). DREAM_RPC_URL
// overrides it.
//
// Checks itself before writing: every non-origin parcel in Daydream or Terraform in
// today's snapshot (backend/src/minted-traits.json) must have an event, and no
// Terrain parcel may have one older than two days. Otherwise nothing is written, so
// an RPC that skipped a range can't pass silently.
//
//   node build_dream_history.js            # incremental (first run: from deployment)
//   node build_dream_history.js --full     # rescan from deployment

const path = require('path');
const Database = require('better-sqlite3');

const HERE = __dirname;
const DB_PATH = path.join(HERE, process.env.DB_PATH || 'terraforms_sales.db');
const SNAPSHOT = path.join(HERE, '..', 'backend', 'src', 'minted-traits.json');
const RPC = process.env.DREAM_RPC_URL || 'https://eth.api.pocket.network';
const TERRAFORMS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const DEPLOY_BLOCK = 13823015;
const TOPICS = {
  '0x41469549673f9fcac40591db4dfa9089e9ed2b430b749c4eb6586195721b8c1d': 'Daydreaming', // Daydreaming(uint256)
  '0x45be0e1ab4f13227fa0c4e2419af72c74f30c385b00c34497e68550f3b40dedb': 'Terraformed', // Terraformed(uint256,address)
};
const CONFIRMATIONS = 32;          // stay clear of reorgs: scan to head - 32
const MAX_SPAN = 40000;            // Pocket's backends cap getLogs at 50k-100k blocks
const MIN_SPAN = 1000;
const PACE_MS = 250;               // ~4 requests/s; ArtGod shares this endpoint
const RECENT_S = 2 * 86400;        // a Terrain parcel may have dreamed since the snapshot

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(body, attempt = 1) {
  try {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const json = await res.json();
    if (!Array.isArray(json) && json.error) {
      const err = new Error(json.error.message || JSON.stringify(json.error));
      err.rpc = json.error;
      throw err;
    }
    return json;
  } catch (err) {
    const tooWide = /range|limit|too many|exceed/i.test(err.message);
    if (tooWide || attempt >= 5) throw err;
    await sleep(1000 * attempt);
    return rpc(body, attempt + 1);
  }
}

const call = async (method, params) => (await rpc({ jsonrpc: '2.0', id: 1, method, params })).result;
const hex = (n) => '0x' + n.toString(16);

async function scan(from, to) {
  const logs = [];
  let span = MAX_SPAN, streak = 0, requests = 0, lastReport = Date.now();
  const t0 = Date.now();
  for (let start = from; start <= to;) {
    const end = Math.min(start + span - 1, to);
    let batch;
    requests++;
    try {
      batch = await call('eth_getLogs', [{ address: TERRAFORMS, topics: [Object.keys(TOPICS)], fromBlock: hex(start), toBlock: hex(end) }]);
    } catch (err) {
      // Pocket balances over backends with different caps: narrow on a refusal,
      // widen again after a run of answers.
      if (/range|limit|too many|exceed/i.test(err.message) && span > MIN_SPAN) { span = Math.max(MIN_SPAN, span >> 1); streak = 0; continue; }
      throw err;
    }
    if (!Array.isArray(batch)) throw new Error(`getLogs ${start}-${end}: no result`);
    logs.push(...batch);
    start = end + 1;
    if (++streak >= 3 && span < MAX_SPAN) { span = Math.min(MAX_SPAN, span * 2); streak = 0; }
    if (Date.now() - lastReport > 30000) {
      lastReport = Date.now();
      const done = (start - from) / (to - from + 1);
      console.log(`[dreams] ${(done * 100).toFixed(0)}% (block ${start}), ${logs.length} events, ${requests} requests, span ${span}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await sleep(PACE_MS);
  }
  return logs;
}

async function timestamps(blocks) {
  const out = new Map();
  for (let i = 0; i < blocks.length; i += 50) {
    const chunk = blocks.slice(i, i + 50);
    const res = await rpc(chunk.map((b, j) => ({ jsonrpc: '2.0', id: j, method: 'eth_getBlockByNumber', params: [hex(b), false] })));
    for (const r of res) {
      if (!r.result) throw new Error(`block ${chunk[r.id]}: ${JSON.stringify(r.error)}`);
      out.set(chunk[r.id], parseInt(r.result.timestamp, 16));
    }
    await sleep(PACE_MS);
  }
  return out;
}

async function main() {
  const full = process.argv.includes('--full');
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS parcel_dreams (
      token_id          INTEGER PRIMARY KEY,
      first_dream_unix  INTEGER NOT NULL,   -- block time of the parcel's first Daydreaming/Terraformed event
      first_dream_block INTEGER NOT NULL,
      first_event       TEXT    NOT NULL,   -- 'Daydreaming' | 'Terraformed'
      tx_hash           TEXT
    );
    CREATE TABLE IF NOT EXISTS chain_scan_state (name TEXT PRIMARY KEY, last_block INTEGER NOT NULL, updated_at TEXT);
  `);
  const state = db.prepare("SELECT last_block FROM chain_scan_state WHERE name = 'dreams'").get();
  const from = full || !state ? DEPLOY_BLOCK : state.last_block + 1;
  const head = parseInt(await call('eth_blockNumber', []), 16);
  const to = head - CONFIRMATIONS;
  if (from > to) { console.log(`[dreams] up to date at block ${state.last_block}`); return; }

  const t0 = Date.now();
  const logs = await scan(from, to);
  // The first event per parcel in this range (block, then log order).
  const first = new Map();
  for (const l of logs) {
    const event = TOPICS[l.topics?.[0]];
    if (!event || !l.data || l.data.length < 66) continue;
    const id = Number(BigInt(l.data.slice(0, 66)));
    if (!(id >= 1 && id <= 9911)) continue;
    const block = parseInt(l.blockNumber, 16), index = parseInt(l.logIndex, 16);
    const prev = first.get(id);
    if (!prev || block < prev.block || (block === prev.block && index < prev.index)) {
      first.set(id, { block, index, event, tx: l.transactionHash, ts: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : null });
    }
  }
  const missingTs = [...new Set([...first.values()].filter((f) => f.ts == null).map((f) => f.block))];
  if (missingTs.length) {
    const ts = await timestamps(missingTs);
    for (const f of first.values()) if (f.ts == null) f.ts = ts.get(f.block);
  }

  // Check against today's snapshot before writing anything.
  const known = full ? new Map() : new Map(db.prepare('SELECT token_id, first_dream_unix FROM parcel_dreams').all().map((r) => [r.token_id, r.first_dream_unix]));
  const merged = new Map(known);
  for (const [id, f] of first) if (!merged.has(id)) merged.set(id, f.ts);
  const snapshot = require(SNAPSHOT);
  const now = Math.floor(Date.now() / 1000);
  const missing = [], early = [];
  for (const p of snapshot) {
    const origin = String(p.mode).startsWith('Origin');
    if (origin) continue;
    const dreamed = merged.get(p.tokenId);
    if ((p.mode === 'Daydream' || p.mode === 'Terraform') && dreamed == null) missing.push(p.tokenId);
    if (p.mode === 'Terrain' && dreamed != null && dreamed < now - RECENT_S) early.push(p.tokenId);
  }
  if (missing.length || early.length) {
    console.error(`[dreams] NOT written: ${missing.length} dreamed parcels without an event (${missing.slice(0, 10).map((i) => '#' + i).join(' ')}), `
      + `${early.length} Terrain parcels with one (${early.slice(0, 10).map((i) => '#' + i).join(' ')}). The RPC may have skipped blocks.`);
    process.exit(1);
  }

  const insert = db.prepare(`INSERT ${full ? 'OR REPLACE' : 'OR IGNORE'} INTO parcel_dreams (token_id, first_dream_unix, first_dream_block, first_event, tx_hash) VALUES (?, ?, ?, ?, ?)`);
  const added = db.transaction(() => {
    if (full) db.exec('DELETE FROM parcel_dreams');
    let n = 0;
    for (const [id, f] of first) n += insert.run(id, f.ts, f.block, f.event, f.tx).changes;
    db.prepare("INSERT OR REPLACE INTO chain_scan_state (name, last_block, updated_at) VALUES ('dreams', ?, ?)").run(to, new Date().toISOString());
    return n;
  })();
  const total = db.prepare('SELECT count(*) n FROM parcel_dreams').get().n;
  console.log(`[dreams] blocks ${from}-${to}: ${logs.length} events, ${added} parcels newly dreamed; ${total} in all `
    + `(${((Date.now() - t0) / 1000).toFixed(0)}s, ${RPC.replace(/^https?:\/\//, '')})`);
}

main().catch((err) => { console.error(`[dreams] failed: ${err.message}`); process.exit(1); });
