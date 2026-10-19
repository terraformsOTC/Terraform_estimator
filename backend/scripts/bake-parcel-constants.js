// bake-parcel-constants.js — Snapshot the per-parcel values that never change
// after mint into backend/src/parcel-constants.json, so /estimate stops paying
// two RPC round trips per parcel for them:
//   - seed  — `const SEED=N` in tokenHTML (~50KB of HTML per read)
//   - x, y  — tokenSupplementalData's xCoordinate / yCoordinate (raw call; the
//             struct ABI is unusable, see getParcelTraits in server.js)
//
// Both derive from the parcel's placement and the collection seed, which are
// fixed at mint; nothing on-chain rewrites them. Mode, chroma, level and antenna
// do change, which is why they are NOT here (see minted-traits.json and the
// parcel store in server.js).
//
// Output shape: { "<tokenId>": [seed, x, y], ... } — 9,911 entries, ~200KB.
//
// Usage:
//   node --env-file=.env scripts/bake-parcel-constants.js
// Resumable: re-reads the existing file and only fetches missing tokenIds.
// Writes every 100 tokens so progress survives Ctrl-C.

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const TOTAL_SUPPLY = 9911;
const BATCH_SIZE = 6;
const FLUSH_EVERY = 100;
const OUT_PATH = path.join(__dirname, '..', 'src', 'parcel-constants.json');

function loadExisting() {
  if (!fs.existsSync(OUT_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[bake] Could not parse ${OUT_PATH}: ${err.message} — starting fresh`);
    return {};
  }
}

function flush(map) {
  const sorted = {};
  for (const id of Object.keys(map).map(Number).sort((a, b) => a - b)) sorted[id] = map[id];
  fs.writeFileSync(OUT_PATH, JSON.stringify(sorted) + '\n');
}

async function readConstants(id, provider, contract, selector) {
  const html = await contract.tokenHTML(id);
  const m = html.match(/\bSEED\s*=\s*(\d+)/);
  if (!m) throw new Error('no SEED in tokenHTML');
  const arg = ethers.zeroPadValue(ethers.toBeHex(id), 32);
  const raw = await provider.call({ to: TERRAFORMS_ADDRESS, data: selector + arg.slice(2) });
  if (!raw || raw.length < 322) throw new Error('short tokenSupplementalData');
  const x = Number(BigInt('0x' + raw.slice(194, 258)));
  const y = Number(BigInt('0x' + raw.slice(258, 322)));
  return [parseInt(m[1], 10), x, y];
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL not set');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(TERRAFORMS_ADDRESS, ['function tokenHTML(uint256) view returns (string)'], provider);
  const selector = ethers.id('tokenSupplementalData(uint256)').slice(0, 10);

  const map = loadExisting();
  const todo = [];
  for (let id = 1; id <= TOTAL_SUPPLY; id++) if (!map[id]) todo.push(id);
  console.log(`[bake] ${Object.keys(map).length} cached, ${todo.length} to fetch`);

  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async id => {
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          map[id] = await readConstants(id, provider, contract, selector);
          return;
        } catch (err) {
          if (attempt === 4) console.warn(`[bake] #${id} failed: ${err.message}`);
          else await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }));
    done += batch.length;
    if (done % FLUSH_EVERY < BATCH_SIZE) {
      flush(map);
      console.log(`[bake] ${done}/${todo.length}`);
    }
  }
  flush(map);
  const missing = [];
  for (let id = 1; id <= TOTAL_SUPPLY; id++) if (!map[id]) missing.push(id);
  console.log(`[bake] done: ${Object.keys(map).length}/${TOTAL_SUPPLY}${missing.length ? `, missing ${missing.join(',')}` : ''}`);
  if (missing.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
