// OpenSea recent sales — live feed.
// Fetches completed sale events from the OpenSea v2 events API, filters to
// ETH/WETH (1:1), attaches our current estimate for each token, and returns
// the signed error between sale price and estimate so the /sales page can
// surface systematic over/under-estimates.
//
// No persistence in this module — results are computed on demand and cached
// upstream in server.js. Each returned record carries pricingModelVersion
// and floorAtSale so a future writer can insert the same shape into a DB.

const { estimatePrice, PRICING_MODEL_VERSION } = require('./pricingModel');
const { estimateHedonic, applyOfferFloor, HEDONIC_MODEL_VERSION } = require('./hedonicModel');

// A parcel counts as premium — worth measuring against its own estimate rather
// than against the floor — when the model prices it more than this far above the
// floor at the time of sale. 5% is wide enough to absorb model noise on an
// ordinary parcel, narrow enough to catch anything genuinely carrying a trait
// premium.
const PREMIUM_OVER_FLOOR = 0.05;

// What a sale is measured against depends on BOTH where it cleared and whether
// the parcel is worth more than a floor parcel. Three cases:
//
//   1. Below floor, plain parcel  -> vs FLOOR.
//      Nothing about its traits explains a sale under the cheapest thing on the
//      market. It cleared at a discount and the discount is the fact.
//      #2427 (0.180 into a 0.204 floor) reads -11.8%.
//
//   2. Below floor, premium parcel -> vs ESTIMATE.
//      The floor is the wrong yardstick for a parcel the model prices well above
//      it: #2299 is worth ~0.32 and sold at 0.203, a 36% discount to its value,
//      not the 0.6% the floor comparison implies.
//
//   3. At or above floor -> vs ESTIMATE.
//      The parcel is being bought for what it is, so the question is whether it
//      beat what its traits are worth. "+268% over floor" on #295 is arithmetic,
//      not information.
//
// ONE estimate does both jobs — it decides whether the parcel is premium AND it
// is the number the percentage is measured against. That is not a stylistic
// choice, it is what makes a below-floor sale mathematically incapable of
// showing a premium:
//
//     premium  =>  estimate > floor * 1.05 > floor > salePrice  =>  vs < 0
//
// Judging premium on one number and measuring against another broke exactly
// that. #884 sold at 0.200 under a 0.204 floor; it was called premium on its
// ask-side estimate (0.216, over the 0.2144 line) and then measured against its
// bid-side estimate (0.188), reading +6.4% — a below-floor sale displaying a
// premium. It is -2.0% against the floor. Any future change here must keep the
// test and the reference on the same number; the invariant is covered by a test.
//
// That one estimate is ALWAYS the ask side, whichever side the sale settled on.
// What a parcel is worth is the price it would clear at if listed. Sellers do
// dump valuable parcels indiscriminately into WETH bids, and those fills are
// real, but they say what a seller was willing to accept that day rather than
// what the parcel is worth — scoring them against the bid-side estimate bakes
// that same distortion into the yardstick and the discount disappears. Anchored
// to the ask side, a valuable parcel dumped into a bid shows the full discount,
// which is the point of the column.
//
// ETH, WETH and BETH are the same money and are never valued differently
// anywhere in the pipeline. sideV2 still records which side of the book was hit
// (an offer cannot be denominated in native ETH) and signedErrorV2 still scores
// the model side-matched, because "was the model right" is a different question
// from "what did this parcel go for against its worth".
//
// modelOn rather than on: applyOfferFloor lifts the estimate toward the standing
// collection-wide WETH bid, which is bid-side information. `on` already equals
// modelOn wherever that floor did not fire.
function decideBasis({ salePrice, saleFloor, estimate }) {
  const isPremium = saleFloor > 0 && estimate > 0
    ? estimate > saleFloor * (1 + PREMIUM_OVER_FLOOR)
    : false;
  const belowFloor = saleFloor > 0 && salePrice < saleFloor;

  let basis = null, reference = null, vsReference = null;
  if (belowFloor && !isPremium) {
    basis = 'floor';
    reference = saleFloor;
  } else if (estimate > 0) {
    basis = 'estimate';
    reference = estimate;
  } else if (saleFloor > 0) {
    // At or above floor but unpriceable. Falling back to the floor beats
    // reporting nothing, and the basis tag says which was used.
    basis = 'floor';
    reference = saleFloor;
  }
  if (reference > 0) vsReference = (salePrice - reference) / reference;
  return { basis, reference, vsReference, isPremium };
}

const OPENSEA_SALES_URL = 'https://api.opensea.io/api/v2/events/collection/terraforms';

// Payment tokens that are 1:1 with ETH, keyed by contract address so a missing
// or empty `payment.symbol` still resolves. Anything not listed here is genuinely
// non-ETH and is counted in skippedNonEth rather than priced.
const CURRENCY_BY_ADDRESS = new Map([
  ['0x0000000000000000000000000000000000000000', 'ETH'],
  ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'WETH'],
  // Blur Pool ETH. Deposited ETH used for Blur bidding; withdrawable 1:1.
  ['0x0000000000a39bb272e79075ade125fd351887ac', 'BETH'],
]);

// OpenSea returns closing_date / event_timestamp as either a Unix integer
// (seconds) or an ISO 8601 string depending on endpoint version. Normalise
// to an integer (Unix seconds) so sort arithmetic and formatRelative work.
function toUnixSeconds(val) {
  if (val == null) return null;
  const n = Number(val);
  if (Number.isFinite(n)) return n;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

// Paginate OpenSea sale events. Returns normalized records sorted newest first.
// Accepts fetchWithRetry (from server.js) as the HTTP wrapper so we reuse its
// 429/5xx backoff + 10s timeout behavior.
async function fetchOpenSeaSales({ apiKey, fetchWithRetry, maxPages = 3, limit = 50 }) {
  const sales = [];
  const seen = new Set();
  let next = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(OPENSEA_SALES_URL);
    url.searchParams.set('event_type', 'sale');
    url.searchParams.set('limit', String(limit));
    if (next) url.searchParams.set('next', next);

    const res = await fetchWithRetry(url.toString(), {
      headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`OpenSea events API error: HTTP ${res.status}`);
    const data = await res.json();

    for (const ev of data.asset_events || []) {
      // Defensive: skip events that don't look like a single-token sale.
      // Response-shape assumptions are documented here because we haven't been
      // able to live-verify against the terraforms slug — if any of these land
      // null on real responses, adjust field names in this block only.
      if (ev.event_type && ev.event_type !== 'sale') continue;

      const identifier = ev.nft?.identifier ?? ev.asset?.identifier;
      const tokenId = identifier != null ? parseInt(identifier, 10) : NaN;
      if (!Number.isFinite(tokenId) || tokenId < 1 || tokenId > 9911) continue;

      const payment = ev.payment || {};
      const rawQty = payment.quantity;
      const decimals = payment.decimals ?? 18;
      // OpenSea returns an EMPTY symbol for some ERC-20 payments, so the currency
      // has to be resolved by token address too. Blur Pool ETH is the one that
      // bites: Blur bids settle in it, it is 1:1 with ETH, and it arrives as
      // symbol "" — which fell through to UNKNOWN and was dropped as non-ETH.
      // That silently discarded 15 of 50 events on a single page, and the same
      // path feeds /api/weekly-report-data, so weekly volume was undercounted.
      const symbol = (payment.symbol || '').toUpperCase()
        || CURRENCY_BY_ADDRESS.get((payment.token_address || '').toLowerCase())
        || '';
      if (!rawQty) continue;
      const salePrice = Number(rawQty) / Math.pow(10, decimals);
      if (!Number.isFinite(salePrice) || salePrice <= 0) continue;

      const closingDate = toUnixSeconds(ev.closing_date ?? ev.event_timestamp ?? null);
      const eventId = ev.order_hash || ev.transaction || ev.event_timestamp + '-' + tokenId;

      // A router's internal leg is not a sale. Gondi's purchase bundler
      // (0xf46a58ca…) produces two events for one loan-exit sale: the real one to
      // the bidder, and a second in the same transaction where the bundler "sells"
      // to itself at ~99% of the price. Counted, every such sale appeared twice on
      // the feed and in the weekly report's count and volume. The sales DB drops
      // the same legs (views.sql, buyer <> seller).
      const seller = ev.seller || null;
      const winner = ev.winner_account?.address || ev.buyer || null;
      if (seller && winner && seller.toLowerCase() === winner.toLowerCase()) continue;
      // One sale per (transaction, token), as in the DB's primary key.
      const dedupeKey = ev.transaction ? `${ev.transaction}:${tokenId}` : null;
      if (dedupeKey && seen.has(dedupeKey)) continue;
      if (dedupeKey) seen.add(dedupeKey);

      sales.push({
        eventId,
        tokenId,
        salePrice,
        currency: symbol || 'UNKNOWN',
        closingDate,
        seller,
        winner,
      });
    }

    next = data.next;
    if (!next) break;
  }

  // Newest first — OpenSea returns newest first by default, but be explicit.
  sales.sort((a, b) => (b.closingDate || 0) - (a.closingDate || 0));
  return sales;
}

// Main entry point used by GET /sales. Fetches recent sales, filters to
// ETH/WETH (priced 1:1 against ETH), and attaches our estimate per sale.
async function computeRecentSales({
  apiKey,
  fetchWithRetry,
  getParcelTraits,
  getFloorPrice,
  floorAt,
  resolveEns,
  topOffer,
  limit = 50,
}) {
  const now = Date.now();
  const allSales = await fetchOpenSeaSales({ apiKey, fetchWithRetry, maxPages: 3, limit });

  // WETH trades as 1 ETH — safe to merge with ETH sales for pricing purposes.
  const ETH_LIKE = new Set(['ETH', 'WETH', 'BETH']);
  const pricedSales = allSales.filter(s => ETH_LIKE.has(s.currency));
  const skippedNonEth = allSales.length - pricedSales.length;

  const { price: currentFloor, isLive: floorIsLive } = await getFloorPrice();
  // Fails open exactly as currentTopOffer does: no offer means no floor applied,
  // which is the pre-existing behaviour rather than a broken feed.
  const offer = typeof topOffer === 'function' ? topOffer() : topOffer;

  // Cap the trait fan-out. 50 is enough for a homepage-style feed and keeps
  // cold-path latency comparable to /undervalued.
  const candidates = pricedSales.slice(0, Math.min(limit, 50));

  const results = [];
  const BATCH_SIZE = 8;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    // The feed shows neither seed nor x/y, and each costs its own RPC call.
    const settled = await Promise.allSettled(
      batch.map(s => getParcelTraits(s.tokenId, { includeSeed: false, includeCoords: false })));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status !== 'fulfilled') continue;
      const traits = r.value;
      const sale = batch[j];
      // Anchor estimate to floor at time of sale when history is available.
      // Falls back to current floor when ts predates history or floorAt is missing.
      const historicalFloor = floorAt ? floorAt(sale.closingDate) : null;
      const saleFloor = historicalFloor ?? currentFloor;
      const pricing = estimatePrice(traits, saleFloor);
      const signedError = pricing.estimatedValue > 0
        ? (sale.salePrice - pricing.estimatedValue) / pricing.estimatedValue
        : null;

      // Shadow scorecard. Each sale is a settled fact, so scoring both models
      // against it is what turns "v2 is at parity on a 2024 holdout" into live
      // evidence for or against a cutover. Compare against the sub-model matching
      // how the sale actually settled: a WETH fill is an accepted bid (money sword
      // OFF), native ETH is a taken listing (ON). Same rule as views.sql.
      let pricingV2 = null, signedErrorV2 = null, sideV2 = null;
      try {
        // The standing collection-wide bid is a floor under any bid-side value:
        // a seller can always hit it instead of accepting less. Every other
        // pricing surface applies it via safeHedonic, and omitting it here was
        // scoring bid-side sales against an estimate no seller would ever have
        // settled for — #2427 sold at 0.180 into a 0.177 offer and read as
        // +9.1% over a 0.165 estimate, when it barely cleared the bid.
        //
        // Approximation, and a deliberate one: this is the offer standing NOW,
        // not at the time of sale, which we do not record. The feed covers ~2
        // weeks and the floor moves slowly over that span, so the error is small
        // and always in the direction of scoring a bid-side sale less
        // generously. If the feed ever lengthens, this wants an offer history
        // alongside floor-history.json.
        pricingV2 = applyOfferFloor(estimateHedonic(traits, saleFloor), offer);
        // BETH sits with WETH, not with ETH: Blur Pool is the bidding currency,
        // so a fill denominated in it is an accepted offer, not a taken listing.
        sideV2 = (sale.currency === 'WETH' || sale.currency === 'BETH') ? 'off' : 'on';
        const v2Value = pricingV2[sideV2];
        if (v2Value > 0) signedErrorV2 = (sale.salePrice - v2Value) / v2Value;
      } catch (err) {
        console.warn(`[hedonic] sales scoring failed for ${sale.tokenId}: ${err.message}`);
      }

      const { basis, reference, vsReference, isPremium } = decideBasis({
        salePrice: sale.salePrice,
        saleFloor,
        // What a parcel is worth is the price it would clear at if listed. See
        // the note on decideBasis for why the bid side is never used here.
        // modelOn is the ask estimate before applyOfferFloor; `on` already is
        // that when the offer floor did not fire.
        estimate: pricingV2
          ? (pricingV2.modelOn ?? pricingV2.on)
          : (pricing.estimatedValue > 0 ? pricing.estimatedValue : null),
      });

      results.push({
        ...sale,
        traits,
        pricing,
        basis,
        reference,
        vsReference,
        isPremium,
        signedError,
        pricingV2,
        signedErrorV2,
        sideV2,
        pricingModelVersion: PRICING_MODEL_VERSION,
        hedonicModelVersion: HEDONIC_MODEL_VERSION,
        floorAtSale: saleFloor,
        floorAtSaleSource: historicalFloor != null ? 'history' : 'current',
      });
    }
  }

  // Reverse-resolve ENS for the buyer/seller of each displayed sale (one batched
  // call across all unique addresses). Falls back silently to raw addresses if
  // no resolver was injected or a lookup fails.
  if (resolveEns) {
    const ensMap = await resolveEns(results.flatMap(r => [r.seller, r.winner]));
    for (const r of results) {
      r.sellerEns = r.seller ? (ensMap[r.seller.toLowerCase()] || null) : null;
      r.winnerEns = r.winner ? (ensMap[r.winner.toLowerCase()] || null) : null;
    }
  }

  return {
    sales: results,
    floor: currentFloor,
    floorIsLive,
    totalSalesScanned: allSales.length,
    skippedNonEth,
    fetchedAt: now,
  };
}

module.exports = {
  decideBasis,
  PREMIUM_OVER_FLOOR, fetchOpenSeaSales, computeRecentSales };
