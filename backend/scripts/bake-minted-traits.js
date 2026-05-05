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
// We bake only the raw attribute-derived fields (zone/biome/level/chroma/mode
// /mysteryValue/isS0). Lookup-derived fields (specialType, isOneOfOne,
// isGodmode, isLith0like, isGm) are applied at query time so changes to
// special-tokens.json / one-of-one-ids.json take effect without re-baking.
//
// Skipped (only needed for /estimate, not bargains):
//   - tokenHTML (seed)
//   - tokenSupplementalData (x/y)

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const TOTAL_SUPPLY = 9911;
const BATCH_SIZE = 8;
const DELAY_MS = 50;
const FLUSH_EVERY = 50;
const OUT_PATH = path.join(__dirname, '..', 'src', 'minted-traits.json');

const ABI = ['function tokenURI(uint256 tokenId) view returns (string)'];

function extractAttrs(uri) {
  if (!uri.startsWith('data:application/json;base64,')) return null;
  const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  return json.attributes || [];
}

function buildTraitRecord(tokenId, attrs) {
  const findVal = (name) => attrs.find(a => a.trait_type === name)?.value;
  const zoneVal = findVal('Zone');
  const levelVal = findVal('Level');
  const biomeVal = findVal('Biome');
  const chromaVal = findVal('Chroma');
  const modeVal = findVal('Mode');
  const tsVal = findVal('Timestamp');
  const mysteryRaw = findVal('???');
  return {
    tokenId,
    zone: zoneVal || null,
    level: levelVal != null ? parseInt(levelVal, 10) : null,
    biome: biomeVal != null ? parseInt(biomeVal, 10) : null,
    chroma: chromaVal || 'Flow',
    mode: modeVal || 'Terrain',
    mysteryValue: mysteryRaw != null ? Number(mysteryRaw) : null,
    isS0: String(tsVal || '').includes('[S0]'),
  };
}

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

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(TERRAFORMS_ADDRESS, ABI, provider);

  const existing = loadExisting();
  const startCount = Object.keys(existing).length;
  console.log(`[bake] Loaded ${startCount} existing records from ${OUT_PATH}`);

  const todo = [];
  for (let id = 1; id <= TOTAL_SUPPLY; id++) {
    if (!existing[id]) todo.push(id);
  }
  console.log(`[bake] ${todo.length} tokens remaining to fetch`);
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
      batch.map(async (tokenId) => {
        const uri = await contract.tokenURI(tokenId);
        const attrs = extractAttrs(uri);
        if (!attrs) throw new Error('Unexpected tokenURI format');
        return buildTraitRecord(tokenId, attrs);
      })
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
