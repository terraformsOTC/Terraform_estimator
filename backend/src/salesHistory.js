// Every Terraforms sale since mint, filterable, for the /sales-history feed.
//
// The sales DB lives on the maintainer's machine. ops/daily-refit.sh exports it
// nightly (sales database/export_sales_history.js) to sales-history.json, with the
// daily floor index beside it, and commits both. This module loads the export,
// prices each sale with today's model at the floor in force when it sold, and
// merges in live OpenSea sales newer than the export.
//
// Pricing a past sale:
//   - the live listing floor from floor-history.json when a reading exists within
//     72h before the sale (calibrated, exactly as a live estimate is);
//   - otherwise the model's own floor index for that day, which is what the fit
//     was trained against, so no calibration is applied;
//   - the collection-wide bid standing then (bidAt, recorded since 2026-09-23)
//     as the offer floor, so the estimate is the one the site was showing.
// The reference and the over/under figure come from decideBasis, the same rule
// the live feed uses: ask side only, or the floor for a plain parcel under it.
//
// Traits are each parcel's traits TODAY. Mode and chroma can change after a
// sale (a parcel terraformed since), so a filter on them is a filter on what the
// parcel is now.

const { estimatePrice } = require('./pricingModel');
const { estimateHedonic, applyOfferFloor } = require('./hedonicModel');
const { decideBasis, bidAt } = require('./sales');

const MAX_LIVE_FLOOR_AGE_S = 72 * 3600;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Mirrors FILTER_ATTRS in frontend/src/components/ParcelFilters.js — the panel's
// values must mean the same thing here, or a chip would match nothing.
const FILTER_ATTRS = {
  mode:   { get: (t) => t.mode || 'Terrain', parse: String },
  chroma: { get: (t) => t.chroma || 'Flow', parse: String },
  level:  { get: (t) => (Number.isInteger(t.level) && t.level > 0 ? t.level : null), parse: Number },
  zone:   { get: (t) => t.zone || null, parse: String },
  biome:  { get: (t) => (Number.isInteger(t.biome) && t.biome >= 0 ? t.biome : null), parse: Number },
};
const ATTR_KEYS = Object.keys(FILTER_ATTRS);
// Sale size in ETH: ?min=1 keeps sales of at least 1 ETH, ?max=5 at most 5. A
// bundle order's legs carry the order's total, as the page shows them.
const SIZE_PARAMS = { min: 'minPrice', max: 'maxPrice' };

/** Parse ?zone=Alto,Holo&biome=0&min=1 into { zone: Set, biome: Set, minPrice: 1, ... }. */
function parseFilters(query = {}) {
  const filters = {};
  for (const key of ATTR_KEYS) {
    const raw = query[key];
    if (raw == null || raw === '') continue;
    const values = (Array.isArray(raw) ? raw : String(raw).split(','))
      .map((v) => String(v).trim()).filter(Boolean).slice(0, 100)
      .map(FILTER_ATTRS[key].parse)
      .filter((v) => (typeof v === 'number' ? Number.isFinite(v) : true));
    if (values.length) filters[key] = new Set(values);
  }
  for (const [param, key] of Object.entries(SIZE_PARAMS)) {
    const raw = query[param];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) filters[key] = n;
  }
  return filters;
}

/** OR within an attribute, AND across attributes — the wallet panel's rule. */
function matches(sale, filters, skipKey = null) {
  if (filters.minPrice != null && !(sale.salePrice >= filters.minPrice)) return false;
  if (filters.maxPrice != null && !(sale.salePrice <= filters.maxPrice)) return false;
  const t = sale.traits;
  if (!t) return ATTR_KEYS.every((k) => k === skipKey || !filters[k]);
  for (const key of ATTR_KEYS) {
    if (key === skipKey) continue;
    const selected = filters[key];
    if (!selected) continue;
    if (!selected.has(FILTER_ATTRS[key].get(t))) return false;
  }
  return true;
}

/**
 * Value counts per attribute, each over the sales matching every OTHER active
 * filter — so picking Alto shows how the Alto sales split by biome, while the
 * zone list still offers every zone that sold.
 */
function facets(sales, filters) {
  const out = {};
  for (const key of ATTR_KEYS) {
    const counts = {};
    for (const s of sales) {
      if (!s.traits || !matches(s, filters, key)) continue;
      const v = FILTER_ATTRS[key].get(s.traits);
      if (v == null) continue;
      counts[v] = (counts[v] || 0) + 1;
    }
    out[key] = counts;
  }
  return out;
}

/**
 * Totals over the whole filtered set, not just the page. A bundle order's legs
 * each carry the order total, so they count once toward volume and not at all
 * toward the over/under averages.
 */
function summarize(sales) {
  let volume = 0;
  const bundleTx = new Set();
  const vs = { floor: [], estimate: [] };
  for (const s of sales) {
    if (s.kind === 'bundle') {
      if (!bundleTx.has(s.txHash)) { bundleTx.add(s.txHash); volume += s.salePrice; }
      continue;
    }
    volume += s.salePrice;
    if (typeof s.vsReference === 'number' && vs[s.basis]) vs[s.basis].push(s.vsReference);
  }
  const stat = (xs) => {
    if (!xs.length) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const m = sorted.length >> 1;
    return {
      n: xs.length,
      mean: xs.reduce((a, b) => a + b, 0) / xs.length,
      median: sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2,
    };
  };
  return {
    count: sales.length,
    volume: Math.round(volume * 1000) / 1000,
    vsFloor: stat(vs.floor),
    vsEstimate: stat(vs.estimate),
    first: sales.length ? sales[sales.length - 1].closingDate : null,
    last: sales.length ? sales[0].closingDate : null,
  };
}

// Each leg of a bundle order names the other parcels in it, so a row can say
// what it sold together with: the price on every leg is the order's total.
function linkBundles(sales) {
  const byTx = new Map();
  for (const s of sales) {
    if (s.kind !== 'bundle' || !s.txHash) continue;
    if (!byTx.has(s.txHash)) byTx.set(s.txHash, []);
    byTx.get(s.txHash).push(s.tokenId);
  }
  for (const s of sales) {
    if (s.kind === 'bundle' && byTx.has(s.txHash)) {
      s.bundleWith = byTx.get(s.txHash).filter((id) => id !== s.tokenId).sort((a, b) => a - b);
    }
  }
}

// export_sales_history.js's rule, for live sales newer than the export.
const BUNDLE_MIN_FLOOR_MULTIPLE = 1.5;

/**
 * @param history      parsed sales-history.json, or null
 * @param floorIndex   parsed floor-index.json, or null
 * @param getSnapshotTraits  (tokenId) -> traits | null
 * @param floorHistory () -> the live [{ts, floor}] history, sorted
 */
function createSalesHistory({ history, floorIndex, getSnapshotTraits, floorHistory }) {
  const days = floorIndex?.days || {};
  const dayKeys = Object.keys(days).sort();

  // Token-level facts, shared by every sale of the parcel.
  const tokenCache = new Map();
  function tokenFacts(tokenId) {
    if (tokenCache.has(tokenId)) return tokenCache.get(tokenId);
    const traits = getSnapshotTraits(tokenId);
    let pricing = null;
    if (traits) {
      // Badge tiers only; they come from trait tables, not from the floor.
      const v1 = estimatePrice(traits, 1);
      pricing = { zoneCategory: v1.zoneCategory ?? null, biomeCategory: v1.biomeCategory ?? null };
    }
    const facts = { traits, pricing };
    tokenCache.set(tokenId, facts);
    return facts;
  }

  function indexFloor(unix) {
    const day = new Date(unix * 1000).toISOString().slice(0, 10);
    if (days[day] > 0) return days[day];
    // Nearest earlier day (the index has a row for every day with sales).
    let lo = 0, hi = dayKeys.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dayKeys[mid] <= day) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found === -1 ? null : days[dayKeys[found]];
  }

  function liveFloor(unix) {
    const h = floorHistory ? floorHistory() : [];
    let lo = 0, hi = h.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (h[mid].ts <= unix) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (found === -1 || unix - h[found].ts > MAX_LIVE_FLOOR_AGE_S) return null;
    return h[found].floor;
  }

  function priceSale(sale) {
    const { traits, pricing } = tokenFacts(sale.tokenId);
    sale.traits = traits;
    sale.pricing = pricing;
    if (!traits) return sale;
    const live = liveFloor(sale.closingDate);
    const floor = live ?? indexFloor(sale.closingDate);
    sale.floorAtSale = floor;
    sale.floorAtSaleSource = live != null ? 'history' : (floor != null ? 'index' : null);
    if (!(floor > 0)) return sale;
    try {
      const est = applyOfferFloor(
        estimateHedonic(traits, floor, { floorBasis: live != null ? 'live' : 'index' }),
        bidAt(floorHistory ? floorHistory() : [], sale.closingDate));
      sale.estimate = est.on;
      if (sale.kind !== 'bundle') {
        const { basis, reference, vsReference } = decideBasis({
          salePrice: sale.salePrice, saleFloor: floor, estimate: est.on,
        });
        sale.basis = basis; sale.reference = reference; sale.vsReference = vsReference;
      }
    } catch { /* unpriceable: left without an estimate */ }
    return sale;
  }

  // Built on first use, newest first.
  let historyRows = null;
  let historyKeys = null;
  function historySales() {
    if (historyRows) return historyRows;
    const rows = history?.rows || [];
    const addrs = history?.addresses || [];
    const currencies = history?.currencies || ['ETH', 'WETH', 'BETH'];
    const kinds = history?.kinds || ['single', 'sweep', 'bundle'];
    historyRows = new Array(rows.length);
    historyKeys = new Set();
    for (let i = 0; i < rows.length; i++) {
      const [unix, tokenId, price, cur, legs, kind, buyer, seller, tx] = rows[i];
      historyKeys.add(`${tx}:${tokenId}`);
      historyRows[rows.length - 1 - i] = priceSale({
        eventId: `${tx}:${tokenId}`,
        txHash: tx,
        tokenId,
        salePrice: price,
        currency: currencies[cur] || 'ETH',
        closingDate: unix,
        seller: addrs[seller] || null,
        winner: addrs[buyer] || null,
        legs,
        kind: kinds[kind] || 'single',
        basis: null, reference: null, vsReference: null, estimate: null,
        source: 'history',
      });
    }
    linkBundles(historyRows);
    return historyRows;
  }

  // Live sales come one row per leg, each marked single. Group them by transaction
  // as the export does: several legs at one price from one seller to one buyer, at
  // least 1.5x the day's floor, are one bundle order repeating its total; any other
  // multi-parcel transaction is a sweep of separately priced orders.
  function classifyLive(sales) {
    const byTx = new Map();
    for (const s of sales) {
      if (!s.txHash) continue;
      if (!byTx.has(s.txHash)) byTx.set(s.txHash, []);
      byTx.get(s.txHash).push(s);
    }
    for (const legs of byTx.values()) {
      const tokens = new Set(legs.map((s) => s.tokenId));
      if (tokens.size < 2) continue;
      const oneOrder = new Set(legs.map((s) => s.salePrice)).size === 1
        && new Set(legs.map((s) => s.seller)).size === 1
        && new Set(legs.map((s) => s.winner)).size === 1;
      const floor = indexFloor(legs[0].closingDate);
      const bundle = oneOrder && floor > 0 && legs[0].salePrice >= BUNDLE_MIN_FLOOR_MULTIPLE * floor;
      for (const s of legs) {
        s.legs = tokens.size;
        s.kind = bundle ? 'bundle' : 'sweep';
        // A leg's price is the order total, not what that parcel sold for.
        if (bundle) { s.basis = null; s.reference = null; s.vsReference = null; }
      }
    }
    linkBundles(sales);
    return sales;
  }

  // Live sales newer than the export, reshaped to the history row.
  function fromLive(s) {
    const v2 = s.pricingV2;
    return {
      eventId: s.txHash ? `${s.txHash}:${s.tokenId}` : s.eventId,
      txHash: s.txHash || null,
      tokenId: s.tokenId,
      salePrice: s.salePrice,
      currency: s.currency,
      closingDate: s.closingDate,
      seller: s.seller,
      winner: s.winner,
      legs: 1,
      kind: 'single',
      traits: s.traits,
      pricing: s.pricing ? { zoneCategory: s.pricing.zoneCategory ?? null, biomeCategory: s.pricing.biomeCategory ?? null } : null,
      estimate: v2 ? v2.on : null,
      basis: s.basis, reference: s.reference, vsReference: s.vsReference,
      floorAtSale: s.floorAtSale, floorAtSaleSource: s.floorAtSaleSource,
      source: 'live',
    };
  }

  let merged = { liveAt: undefined, sales: null, liveAdded: 0 };
  function allSales(live) {
    const base = historySales();
    const liveAt = live?.fetchedAt ?? null;
    if (merged.sales && merged.liveAt === liveAt) return merged;
    const newest = base.length ? base[0].closingDate : 0;
    const extra = (live?.sales || [])
      .filter((s) => ETH_LIKE.has(s.currency) && !(s.txHash && historyKeys.has(`${s.txHash}:${s.tokenId}`)))
      // Anything at or before the export's newest sale is already in it or was
      // dropped from it on purpose (a self-trade, say); only newer sales merge.
      .filter((s) => s.closingDate > newest)
      .map(fromLive)
      // Legs of one transaction stay together (the page boxes a bundle's rows).
      .sort((a, b) => b.closingDate - a.closingDate || String(a.txHash).localeCompare(String(b.txHash)) || a.tokenId - b.tokenId);
    classifyLive(extra);
    merged = { liveAt, sales: extra.length ? [...extra, ...base] : base, liveAdded: extra.length };
    return merged;
  }

  /**
   * One page of sales matching the query, newest first, with facet counts and
   * totals for the whole filtered set.
   */
  function query(params = {}, live = null) {
    const filters = parseFilters(params);
    const { sales: all, liveAdded } = allSales(live);
    const filtered = Object.keys(filters).length ? all.filter((s) => matches(s, filters)) : all;
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.min(Math.max(parseInt(params.offset, 10) || 0, 0), filtered.length);
    return {
      sales: filtered.slice(offset, offset + limit),
      total: filtered.length,
      offset,
      limit,
      filters: Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v instanceof Set ? [...v] : v])),
      facets: facets(all, filters),
      summary: summarize(filtered),
      historyExportedAt: history?.exportedAt ?? null,
      historySales: historySales().length,
      liveSalesAdded: liveAdded,
    };
  }

  /**
   * Sale count and volume over trailing windows and per calendar year (UTC),
   * for /stats. Bundle orders count their total once, as in summarize().
   */
  function volumes(live = null, nowSec = Math.floor(Date.now() / 1000)) {
    const { sales: all } = allSales(live);
    const pick = (xs) => { const { count, volume } = summarize(xs); return { count, volume }; };
    const windows = VOLUME_WINDOWS.map(({ key, seconds }) => ({
      key,
      ...pick(seconds == null ? all : all.filter((s) => s.closingDate > nowSec - seconds)),
    }));
    const byYear = new Map();
    for (const s of all) {
      const year = new Date(s.closingDate * 1000).getUTCFullYear();
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(s);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b).map((year) => ({ year, ...pick(byYear.get(year)) }));
    return {
      windows,
      years,
      first: all.length ? all[all.length - 1].closingDate : null,
      historyExportedAt: history?.exportedAt ?? null,
    };
  }

  return { query, volumes, size: () => historySales().length };
}

const VOLUME_WINDOWS = [
  { key: '24h', seconds: 86_400 },
  { key: '7d', seconds: 7 * 86_400 },
  { key: '30d', seconds: 30 * 86_400 },
  { key: '90d', seconds: 90 * 86_400 },
  { key: '1y', seconds: 365 * 86_400 },
  { key: 'all', seconds: null },
];

const ETH_LIKE = new Set(['ETH', 'WETH', 'BETH']);

module.exports = { createSalesHistory, parseFilters, matches, facets, summarize, FILTER_ATTRS };
