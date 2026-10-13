// bake-minted-traits.js — Snapshot all 9911 minted Terraforms parcels' raw
// trait attributes into backend/src/minted-traits.json. Used by /undervalued
// to skip ~9911 RPC trait fetches on cold compute.
//
// Usage:
//   node --env-file=../.env scripts/bake-minted-traits.js
//
// Resumable: re-reads existing JSON and only fetches missing tokenIds.
// Writes incrementally every 50 tokens so progress isn't lost on Ctrl-C.
//
// Pass --force to re-fetch every token instead of only the missing ones. The
// resumable default cannot refresh a record that already exists, so a plain
// run is a no-op once the file is complete — and chroma/mode/level/??? all
// change on-chain when a parcel is upgraded or terraformed. --force is the
// only way to clear that staleness:
//   node --env-file=.env scripts/bake-minted-traits.js --force
//
// We bake raw attribute-derived fields (zone/biome/level/chroma/mode/
// mysteryValue) plus, from the Antenna contract, whether the antenna is on
// (getAntennaStatus) and when it was first modified (antennaFirstTs — seconds
// since epoch, 0 if never). The per-token read is in trait-record.js.
// Lookup-derived fields (specialType, isOneOfOne, isGodmode, isLith0like,
// isGm, isS0) are applied at query time so window/curation changes take
// effect without re-baking.
//
// Skipped (only needed for /estimate, not bargains):
//   - tokenHTML (seed)
//   - tokenSupplementalData (x/y)

const fs = require('fs');
const path = require('path');
const { makeContracts, fetchTraitRecord } = require('./trait-record');

const TOTAL_SUPPLY = 9911;
const BATCH_SIZE = 8;
const DELAY_MS = 50;
const FLUSH_EVERY = 50;
const OUT_PATH = path.join(__dirname, '..', 'src', 'minted-traits.json');

function loadExisting() {
  if (!fs.existsSync(OUT_PATH)) return {};
  try {
    const raw = fs.readFileSync(OUT_PATH, 'utf8');
    const arr = JSON.parse(raw);
    const map = {};
    for (const r of arr) map[r.tokenId] = r;
    return map;
  } catch (err) {
    console.warn(`[bake] Could not parse existing ${OUT_PATH}: ${err.message} — starting fresh`);
    return {};
  }
}

function flush(map) {
  const arr = Object.values(map).sort((a, b) => a.tokenId - b.tokenId);
  fs.writeFileSync(OUT_PATH, JSON.stringify(arr) + '\n');
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL not set — run with --env-file=../.env');

  const contracts = makeContracts(rpcUrl);

  const force = process.argv.includes('--force') || process.argv.includes('-f');

  const existing = loadExisting();
  const startCount = Object.keys(existing).length;
  console.log(`[bake] Loaded ${startCount} existing records from ${OUT_PATH}`);

  // Re-fetch if record is missing OR was baked before antennaFirstTs was added.
  // Under --force, re-fetch everything: an existing record is exactly what goes
  // stale when a parcel is terraformed, so skipping it defeats the refresh.
  const todo = [];
  for (let id = 1; id <= TOTAL_SUPPLY; id++) {
    const r = existing[id];
    if (force || !r || r.antennaOn == null || r.antennaFirstTs == null) todo.push(id);
  }
  console.log(force
    ? `[bake] --force: re-fetching all ${todo.length} tokens`
    : `[bake] ${todo.length} tokens remaining to fetch`);
  if (todo.length === 0) {
    console.log('[bake] Nothing to do.');
    return;
  }

  let done = 0;
  let failed = 0;
  const startedAt = Date.now();
  let sinceLastFlush = 0;

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((tokenId) => fetchTraitRecord(tokenId, contracts))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        existing[batch[j]] = r.value;
        done++;
      } else {
        failed++;
        console.warn(`[bake] #${batch[j]} failed: ${r.reason?.message || r.reason}`);
      }
    }

    sinceLastFlush += batch.length;
    if (sinceLastFlush >= FLUSH_EVERY) {
      flush(existing);
      sinceLastFlush = 0;
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / elapsed;
      const remaining = todo.length - done - failed;
      const eta = rate > 0 ? Math.round(remaining / rate) : '?';
      console.log(`[bake] ${done}/${todo.length} (failed: ${failed}) — ${rate.toFixed(1)}/s — ETA ${eta}s`);
    }

    if (DELAY_MS) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  flush(existing);
  const total = Object.keys(existing).length;
  console.log(`[bake] Done. Total records: ${total} (added ${total - startCount}, failed ${failed})`);
  if (failed > 0) {
    console.log('[bake] Re-run the script to retry failed tokens.');
  }
}

main().catch(err => {
  console.error('[bake] Fatal:', err);
  process.exit(1);
});
