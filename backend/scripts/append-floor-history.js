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

// The best collection-wide WETH bid: what a holder could sell into right now,
// without waiting for a buyer.
//
// Recorded alongside the floor because the pricing model currently has no bid-side
// anchor with any history. The fitted multiples are relative to a 12th-percentile
// index of transacted prices over a trailing fortnight, which lags the market by up
// to two weeks. A standing bid does not lag at all — but testing whether it is the
// better anchor needs a bid at each PAST sale, and nothing has ever recorded one.
// So start now: every day this is skipped is a day that cannot be backfilled.
//
// Soft: a missing bid records as null rather than dropping the floor sample.
async function fetchTopCollectionBid() {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.opensea.io/api/v2/offers/collection/terraforms', {
      headers: { 'X-API-KEY': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`OpenSea offers HTTP ${res.status}`);
    const { offers = [] } = await res.json();

    let best = 0;
    for (const o of offers) {
      if (o.status !== 'ACTIVE') continue;
      if (o.price?.currency !== 'WETH') continue;
      const c = o.criteria || {};
      if (c.traits || c.numeric_traits) continue;                       // trait-scoped
      if (c.encoded_token_ids && c.encoded_token_ids !== '*') continue;  // token-scoped
      // itemType 4 is the ERC-721 criteria item; startAmount is how many parcels
      // the offer wants, which is what the WETH total is spread across.
      const nft = o.protocol_data?.parameters?.consideration?.find(x => x.itemType === 4);
      const qty = nft ? Number(nft.startAmount) : 1;
      if (!(qty > 0)) continue;
      const perItem = (Number(o.price.value) / 1e18) / qty;
      if (Number.isFinite(perItem)) best = Math.max(best, perItem);
    }
    return best > 0 ? best : null;
  } catch (err) {
    console.warn(`[floor-history] Top bid lookup failed: ${err.message} — recording floor only.`);
    return null;
  }
}

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

  // `bid` is additive: every existing sample lacks it, and readers must treat a
  // missing value as unknown rather than zero.
  const bid = await fetchTopCollectionBid();
  history.push(bid != null ? { ts: nowSeconds, floor, bid } : { ts: nowSeconds, floor });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 0).replace(/},{/g, '},\n{') + '\n');
  console.log(`[floor-history] Appended floor ${floor} ETH at ${new Date(nowSeconds * 1000).toISOString()} (${history.length} total).`);
}

main().catch(err => {
  console.error('[floor-history] Fatal:', err);
  process.exit(1);
});
