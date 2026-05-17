// append-floor-history.js — Append current Terraforms floor price (Alchemy NFT API)
// to backend/src/floor-history.json. Invoked by .githooks/pre-push so every push
// to main carries a fresh floor sample. Render redeploys on push, so the deployed
// API always reads the latest history at boot.
//
// Usage:
//   node --env-file=backend/.env backend/scripts/append-floor-history.js
//
// Exits 0 on success, 1 on hard failure. Soft failures (Alchemy unreachable,
// quota exceeded) log a warning and exit 0 so a failed network call doesn't
// block the user's push.

const fs = require('fs');
const path = require('path');

const CONTRACT = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const HISTORY_PATH = path.join(__dirname, '..', 'src', 'floor-history.json');

// Skip a write if the most recent entry is younger than this. Time-only
// dedupe — Alchemy returns slightly different floor values across calls
// (e.g. 0.31212 vs 0.3121025), so an exact-equality check on floor never
// triggered when the hook fired twice in quick succession from re-pushes.
const MIN_GAP_SECONDS = 60;

async function main() {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    console.warn('[floor-history] ALCHEMY_API_KEY not set — skipping append.');
    return;
  }

  let floor;
  try {
    const res = await fetch(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${apiKey}/getFloorPrice?contractAddress=${CONTRACT}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
    const data = await res.json();
    floor = data?.openSea?.floorPrice ?? data?.looksRare?.floorPrice;
    if (typeof floor !== 'number' || floor <= 0) throw new Error('Unexpected response shape');
  } catch (err) {
    console.warn(`[floor-history] Floor fetch failed: ${err.message} — skipping append.`);
    return;
  }

  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    if (!Array.isArray(history)) throw new Error('floor-history.json is not an array');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[floor-history] Failed to read existing history: ${err.message}`);
      process.exit(1);
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const last = history[history.length - 1];
  if (last && nowSeconds - last.ts < MIN_GAP_SECONDS) {
    console.log(`[floor-history] Skipping (last sample ${nowSeconds - last.ts}s ago, current floor ${floor}).`);
    return;
  }

  history.push({ ts: nowSeconds, floor });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 0).replace(/},{/g, '},\n{') + '\n');
  console.log(`[floor-history] Appended floor ${floor} ETH at ${new Date(nowSeconds * 1000).toISOString()} (${history.length} total).`);
}

main().catch(err => {
  console.error('[floor-history] Fatal:', err);
  process.exit(1);
});
