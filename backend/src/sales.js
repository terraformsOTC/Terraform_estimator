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

const OPENSEA_SALES_URL = 'https://api.opensea.io/api/v2/events/collection/terraforms';

// Paginate OpenSea sale events. Returns normalized records sorted newest first.
// Accepts fetchWithRetry (from server.js) as the HTTP wrapper so we reuse its
// 429/5xx backoff + 10s timeout behavior.
async function fetchOpenSeaSales({ apiKey, fetchWithRetry, maxPages = 3, limit = 50 }) {
  const sales = [];
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
      const symbol = (payment.symbol || '').toUpperCase();
      if (!rawQty) continue;
      const salePrice = Number(rawQty) / Math.pow(10, decimals);
      if (!Number.isFinite(salePrice) || salePrice <= 0) continue;

      const closingDate = ev.closing_date ?? ev.event_timestamp ?? null;
      const eventId = ev.order_hash || ev.transaction || ev.event_timestamp + '-' + tokenId;

      sales.push({
        eventId,
        tokenId,
        salePrice,
        currency: symbol || 'UNKNOWN',
        closingDate,
        seller: ev.seller || null,
        winner: ev.winner_account?.address || ev.buyer || null,
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
  limit = 50,
}) {
  const now = Date.now();
  const allSales = await fetchOpenSeaSales({ apiKey, fetchWithRetry, maxPages: 3, limit });

  // WETH trades as 1 ETH — safe to merge with ETH sales for pricing purposes.
  const ETH_LIKE = new Set(['ETH', 'WETH']);
  const pricedSales = allSales.filter(s => ETH_LIKE.has(s.currency));
  const skippedNonEth = allSales.length - pricedSales.length;

  const { price: floor, isLive: floorIsLive } = await getFloorPrice();

  // Cap the trait fan-out. 50 is enough for a homepage-style feed and keeps
  // cold-path latency comparable to /undervalued.
  const candidates = pricedSales.slice(0, Math.min(limit, 50));

  const results = [];
  const BATCH_SIZE = 8;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(s => getParcelTraits(s.tokenId)));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status !== 'fulfilled') continue;
      const traits = r.value;
      const pricing = estimatePrice(traits, floor);
      const sale = batch[j];
      const signedError = pricing.estimatedValue > 0
        ? (sale.salePrice - pricing.estimatedValue) / pricing.estimatedValue
        : null;
      results.push({
        ...sale,
        traits,
        pricing,
        signedError,
        pricingModelVersion: PRICING_MODEL_VERSION,
        floorAtSale: floor,
      });
    }
  }

  return {
    sales: results,
    floor,
    floorIsLive,
    totalSalesScanned: allSales.length,
    skippedNonEth,
    fetchedAt: now,
  };
}

module.exports = { fetchOpenSeaSales, computeRecentSales };
