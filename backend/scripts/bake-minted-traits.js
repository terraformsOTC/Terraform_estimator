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
// We bake raw attribute-derived fields (zone/biome/level/chroma/mode/
// mysteryValue/antennaOn) plus the antenna activation timestamp from the
// Antenna contract (antennaFirstTs — seconds since epoch, 0 if never modified).
// Lookup-derived fields (specialType, isOneOfOne, isGodmode, isLith0like,
// isGm, isS0) are applied at query time so window/curation changes take
// effect without re-baking.
//
// Skipped (only needed for /estimate, not bargains):
//   - tokenHTML (seed)
//   - tokenSupplementalData (x/y)

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const ANTENNA_ADDRESS    = '0x331512A28A4cF80221aF949B5d43041fF0FC7f01';
const TOTAL_SUPPLY = 9911;
const BATCH_SIZE = 8;
const DELAY_MS = 50;
const FLUSH_EVERY = 50;
const OUT_PATH = path.join(__dirname, '..', 'src', 'minted-traits.json');

const TERRAFORMS_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
];
const ANTENNA_ABI = [
  'function getFirstAntennaModification(uint256 tokenId) view returns (tuple(uint8 modification, address satellite, uint256 timestamp))',
];

function extractAttrs(uri) {
  if (!uri.startsWith('data:application/json;base64,')) return null;
  const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  return json.attributes || [];
}

function buildTraitRecord(tokenId, attrs, antennaFirstTs) {
  const findVal = (name) => attrs.find(a => a.trait_type === name)?.value;
  const zoneVal = findVal('Zone');
  const levelVal = findVal('Level');
  const biomeVal = findVal('Biome');
  const chromaVal = findVal('Chroma');
  const modeVal = findVal('Mode');
  const antennaVal = findVal('Antenna');
  const mysteryRaw = findVal('???');
  return {
    tokenId,
    zone: zoneVal || null,
    level: levelVal != null ? parseInt(levelVal, 10) : null,
    biome: biomeVal != null ? parseInt(biomeVal, 10) : null,
    chroma: chromaVal || 'Flow',
    mode: modeVal || 'Terrain',
    mysteryValue: mysteryRaw != null ? Number(mysteryRaw) : null,
    antennaOn: antennaVal === 'On',
    antennaFirstTs,
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
  const terraforms = new ethers.Contract(TERRAFORMS_ADDRESS, TERRAFORMS_ABI, provider);
  const antenna    = new ethers.Contract(ANTENNA_ADDRESS,    ANTENNA_ABI,    provider);

  const existing = loadExisting();
  const startCount = Object.keys(existing).length;
  console.log(`[bake] Loaded ${startCount} existing records from ${OUT_PATH}`);

  // Re-fetch if record is missing OR was baked before antennaFirstTs was added.
  const todo = [];
  for (let id = 1; id <= TOTAL_SUPPLY; id++) {
    const r = existing[id];
    if (!r || r.antennaOn == null || r.antennaFirstTs == null) todo.push(id);
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
        const uri = await terraforms.tokenURI(tokenId);
        const attrs = extractAttrs(uri);
        if (!attrs) throw new Error('Unexpected tokenURI format');
        // Only query the antenna contract when the tokenURI says Antenna is On —
        // calling getFirstAntennaModification on a never-modified parcel reverts.
        const antennaVal = attrs.find(a => a.trait_type === 'Antenna')?.value;
        let antennaFirstTs = 0;
        if (antennaVal === 'On') {
          try {
            const rec = await antenna.getFirstAntennaModification(tokenId);
            antennaFirstTs = Number(rec[2]);
          } catch (err) {
            // Reverts with "No antenna modifications" — leave at 0.
          }
        }
        return buildTraitRecord(tokenId, attrs, antennaFirstTs);
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
