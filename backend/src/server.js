const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const { estimatePrice, detectSets, FLOOR_PRICE_ETH } = require('./pricingModel');

const app = express();

// ─── PROXY TRUST ───────────────────────────────────────────────────────────────
// Render (and most PaaS hosts) sit behind a reverse proxy. Without this,
// req.ip resolves to the proxy's IP — rate limiters would bucket all clients
// together instead of by real client IP.
app.set('trust proxy', 1);

// ─── SECURITY HEADERS ──────────────────────────────────────────────────────────
// contentSecurityPolicy disabled — this server only serves JSON and SVG, not HTML pages
app.use(helmet({
  contentSecurityPolicy: false,
  // Allow cross-origin <img> loading — frontend (different origin) fetches SVGs from this API
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Hardcoded production origins + optional extras via ALLOWED_ORIGINS env var
const ALLOWED_ORIGINS = [
  'https://terraformestimator.xyz',
  'https://www.terraformestimator.xyz',
  'https://terraform-estimator.vercel.app',
  'http://localhost:3000',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
];

app.use(cors({
  origin: (origin, callback) => {
    // No-origin requests (curl, Postman, server-side fetches) are allowed through
    // intentionally — this is a public read-only API with no auth, so there's
    // nothing to protect from direct access. CORS only gates browser cross-origin
    // requests; it does not prevent API scraping.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
}));

app.use(express.json({ limit: '1kb' }));

// ─── RATE LIMITING ─────────────────────────────────────────────────────────────
// Standard: 200 req/min
const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

// Wallet limiter: 20 req/min (each /wallet call triggers many RPC calls)
const walletLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many wallet requests — please wait a moment.' },
});

// Undervalued limiter: 5 req/min (triggers OpenSea API + many RPC calls on cold cache)
const undervaluedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment.' },
});

app.use('/estimate',    standardLimiter);
app.use('/image',       standardLimiter);
app.use('/wallet',      walletLimiter);
app.use('/floor',       standardLimiter);
app.use('/undervalued', undervaluedLimiter);
app.use('/sales',       undervaluedLimiter);

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) throw new Error('[startup] RPC_URL environment variable is required — set it in backend/.env');

const TERRAFORMS_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function tokenHTML(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
];

// Separate Antenna contract (V2 upgrade). Reverts when called on a tokenId
// that has never had its antenna modified, so guard with antennaOn first.
const ANTENNA_ADDRESS = '0x331512A28A4cF80221aF949B5d43041fF0FC7f01';
const ANTENNA_ABI = [
  'function getFirstAntennaModification(uint256 tokenId) view returns (tuple(uint8 modification, address satellite, uint256 timestamp))',
];

let provider, contract, antennaContract;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    contract = new ethers.Contract(TERRAFORMS_ADDRESS, TERRAFORMS_ABI, provider);
    antennaContract = new ethers.Contract(ANTENNA_ADDRESS, ANTENNA_ABI, provider);
  }
  return { provider, contract, antennaContract };
}

// ─── tokenURI LRU CACHE ─────────────────────────────────────────────────────
// Terraforms tokenURIs are immutable on-chain — safe to cache indefinitely.
// Caching here benefits both /image and /estimate (via getParcelTraits).
// Max 500 entries (~24MB worst-case); oldest entry evicted when full.
const TOKEN_URI_CACHE_MAX = 500;
const TOKEN_HTML_CACHE_MAX = 500;
const tokenUriCache = new Map();    // Map<tokenId, uri> — insertion order = LRU order
const tokenHtmlCache = new Map();   // Map<tokenId, html> — same LRU pattern for tokenHTML
const tokenUriInFlight = new Map(); // Map<tokenId, Promise> — dedup concurrent cold-cache fetches
const tokenHtmlInFlight = new Map();

const RPC_TIMEOUT_MS = 15_000; // 15s timeout for contract calls

function withTimeout(promise, ms = RPC_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('RPC call timed out')), ms)),
  ]);
}

async function getCachedTokenURI(tokenId) {
  const key = Number(tokenId);
  if (tokenUriCache.has(key)) {
    const uri = tokenUriCache.get(key);
    tokenUriCache.delete(key);
    tokenUriCache.set(key, uri);
    return uri;
  }
  if (tokenUriInFlight.has(key)) return tokenUriInFlight.get(key);
  const { contract } = getProvider();
  const p = withTimeout(contract.tokenURI(tokenId))
    .then(uri => {
      if (tokenUriCache.size >= TOKEN_URI_CACHE_MAX) {
        tokenUriCache.delete(tokenUriCache.keys().next().value);
      }
      tokenUriCache.set(key, uri);
      return uri;
    })
    .finally(() => tokenUriInFlight.delete(key));
  tokenUriInFlight.set(key, p);
  return p;
}

async function getCachedTokenHTML(tokenId) {
  const key = Number(tokenId);
  if (tokenHtmlCache.has(key)) {
    const html = tokenHtmlCache.get(key);
    tokenHtmlCache.delete(key);
    tokenHtmlCache.set(key, html);
    return html;
  }
  if (tokenHtmlInFlight.has(key)) return tokenHtmlInFlight.get(key);
  const { contract } = getProvider();
  const p = withTimeout(contract.tokenHTML(tokenId))
    .then(html => {
      if (tokenHtmlCache.size >= TOKEN_HTML_CACHE_MAX) {
        tokenHtmlCache.delete(tokenHtmlCache.keys().next().value);
      }
      tokenHtmlCache.set(key, html);
      return html;
    })
    .finally(() => tokenHtmlInFlight.delete(key));
  tokenHtmlInFlight.set(key, p);
  return p;
}

// Detect special type from metadata attributes
function detectSpecialType(attributes) {
  if (!attributes) return null;

  const chroma = attributes.find(a => a.trait_type === 'Chroma')?.value;
  if (chroma === 'Plague') return 'Plague';

  const resource = attributes.find(a => a.trait_type === 'Resource')?.value || '';
  if (resource.includes('X-Seed') || resource === 'X Seed') return 'X-Seed';
  if (resource.includes('Y-Seed') || resource === 'Y Seed') return 'Y-Seed';
  if (resource.includes('Lith0')) return 'Lith0';

  const edition = attributes.find(a => a.trait_type === 'Edition')?.value || '';
  if (edition === '1 of 1' || edition === '1of1') return '1of1';

  return null;
}

// ─── SPECIAL TOKEN LOOKUP ─────────────────────────────────────────────────────
// Authoritative source for X-Seed, Y-Seed, Lith0, Spine, and 1of1.
// Plague is detected on-chain via Chroma; Origin Daydream via Mode.
// Source: community-verified list provided Mar 2025.
const SPECIAL_TOKEN_LOOKUP = require('./special-tokens.json');


// ─── ONE-OF-ONE SET ───────────────────────────────────────────────────────────
// 1186 tokens with a confirmed-unique zone/biome combination across all 9911 minted parcels.
// Methodology: full on-chain tokenURI scan of all tokens (Mar 2026) — NOT Alchemy metadata
// (Alchemy returns empty attributes for all Terraforms tokens and cannot be used for this).
// ─── GODMODE SET ─────────────────────────────────────────────────────────────
// X-Seed + Origin Daydream — the rarest combination (3 tokens).
// These remain specialType='X-Seed' in the lookup but get a 45x pricing override
// and show an additional Godmode badge alongside the X-Seed and Origin Daydream badges.
const GODMODE_IDS = new Set([83, 124, 1955]);

// ─── GM SET ───────────────────────────────────────────────────────────────────
// Terrain / Biome 71 parcels with a low ??? value that print a clean "gm" in the heightmap.
// Source: community-verified list provided Mar 2026.
const GM_IDS = new Set([1369, 1800, 4632, 6997, 7297]);

// ─── LITH0-LIKE SET ───────────────────────────────────────────────────────────
// Biome 0 parcels whose zone/chroma combination produces an opening frame that is a
// flat, single block of colour — visually indistinguishable from genuine Lith0 parcels.
// Tiered pricing premiums applied in pricingModel.js (1.5x or 2x per token).
// Source: community-verified list provided Mar 2026.
const LITH0LIKE_IDS = new Set([3124, 3218, 6005, 6512, 9427]);

// Includes both pure 1of1s AND Spine/Lith0/X-Seed/Y-Seed tokens that are also 1of1.
// To re-verify, run: node backend/verify_1of1.js (script in git history, commit 8848717).
// Used to set isOneOfOne on trait responses independently of specialType.
const ONE_OF_ONE_IDS = new Set(require('./one-of-one-ids.json'));

// ??? value thresholds — full collection scan of 9911 tokens (Mar 2026)
// 8864 tokens have ??? trait (1047 have none).
// Distribution: min=815, p5=19918, p25=32332, p50=41052, p75=48163, p95=52953, max=53994
// low ???  : value < 20000  →  449 tokens  (5.1%)
// high ??? : value > 50000  →  1574 tokens (17.8%)
//
// Both thresholds are manually determined based on parcel animations — they mark the
// points at which the liquid flood level visually reads as distinctly low or high.
// The Mesa badge uses a separate threshold (< 30000 in pricingModel.js / shared.js)
// for the same reason: it was set independently based on how the terrain renders.
const MYSTERY_P5  = 20000;
const MYSTERY_P95 = 50000;

function mysteryOutlierFlag(value) {
  if (value == null) return null;
  if (value > MYSTERY_P95) return 'high';
  if (value < MYSTERY_P5)  return 'low';
  return null;
}

// ─── MINTED TRAITS SNAPSHOT ───────────────────────────────────────────────────
// Pre-baked attribute-derived traits for all 9911 minted parcels.
// Source: backend/scripts/bake-minted-traits.js (one-shot scan, committed to repo).
// Used by /undervalued to skip ~9911 RPC trait fetches on cold compute.
//
// We store only attribute-derived fields. Lookup-derived fields (specialType,
// isOneOfOne, isGodmode, isLith0like, isGm) are applied at query time so
// changes to special-tokens.json / one-of-one-ids.json take effect immediately.
let MINTED_TRAITS_SNAPSHOT = null;
try {
  const snapshot = require('./minted-traits.json');
  MINTED_TRAITS_SNAPSHOT = new Map(snapshot.map(r => [r.tokenId, r]));
  console.log(`[snapshot] Loaded minted traits for ${MINTED_TRAITS_SNAPSHOT.size} tokens`);
} catch {
  console.warn('[snapshot] minted-traits.json not found — /undervalued will fall back to RPC for every token');
}

// S0 (Season 0) window — parcels whose antenna was first turned on inside the
// V2 contract launch window AND currently have the Antenna trait on.
// Source: getFirstAntennaModification(tokenId).timestamp on the Antenna
// contract (0x331512...7f01). Stored as antennaFirstTs (unix seconds, 0 if
// never modified).
const S0_ANTENNA_TS_MIN = 1703376000; // 2023-12-24 00:00:00 UTC
const S0_ANTENNA_TS_MAX = 1705190399; // 2024-01-13 23:59:59 UTC

function computeIsS0(antennaOn, antennaFirstTs) {
  if (!antennaOn || !antennaFirstTs) return false;
  return antennaFirstTs >= S0_ANTENNA_TS_MIN && antennaFirstTs <= S0_ANTENNA_TS_MAX;
}

// Augment a snapshot record with lookup-derived fields. Returns a full trait
// object matching getParcelTraits' shape (minus seed/x/y, which are not used
// by /undervalued). Returns null if the tokenId isn't in the snapshot.
function getSnapshotTraits(tokenId) {
  if (!MINTED_TRAITS_SNAPSHOT) return null;
  const id = Number(tokenId);
  const rec = MINTED_TRAITS_SNAPSHOT.get(id);
  if (!rec) return null;

  const plagueFromChroma = rec.chroma === 'Plague' ? 'Plague' : null;
  const specialType = SPECIAL_TOKEN_LOOKUP[id] || plagueFromChroma || null;

  return {
    tokenId: id,
    zone: rec.zone,
    level: rec.level,
    biome: rec.biome,
    chroma: rec.chroma,
    mode: rec.mode,
    specialType,
    isOneOfOne: ONE_OF_ONE_IDS.has(id),
    isGodmode: GODMODE_IDS.has(id),
    isS0: computeIsS0(rec.antennaOn, rec.antennaFirstTs),
    isLith0like: LITH0LIKE_IDS.has(id),
    isGm: GM_IDS.has(id),
    mysteryValue: rec.mysteryValue,
    mysteryOutlier: mysteryOutlierFlag(rec.mysteryValue),
    seed: null,
    x: null,
    y: null,
  };
}

// ─── FLOOR PRICE HISTORY ──────────────────────────────────────────────────────
// Time-series of floor samples written by .githooks/pre-push (one entry per
// push to main). Used by /sales to anchor each sale's estimate to the floor
// in effect at the time of sale, rather than the current floor.
//
// Format: [{ ts: <unix seconds>, floor: <ETH> }] sorted ascending by ts.
let FLOOR_HISTORY = [];
try {
  FLOOR_HISTORY = require('./floor-history.json');
  if (!Array.isArray(FLOOR_HISTORY)) FLOOR_HISTORY = [];
  // Defensive sort — the hook writes in chronological order but a manual
  // edit could leave the file unsorted, which would break floorAt's bsearch.
  FLOOR_HISTORY = FLOOR_HISTORY.filter(e => typeof e?.ts === 'number' && typeof e?.floor === 'number')
    .sort((a, b) => a.ts - b.ts);
  console.log(`[floor-history] Loaded ${FLOOR_HISTORY.length} floor samples`);
} catch {
  console.warn('[floor-history] floor-history.json not found — /sales will use current floor for all sales');
}

// Resolve the floor price at a given Unix-seconds timestamp using nearest-prior
// matching against FLOOR_HISTORY. Returns null if no prior sample exists; caller
// should fall back to the current live floor in that case.
function floorAt(tsSeconds) {
  if (!Number.isFinite(tsSeconds) || FLOOR_HISTORY.length === 0) return null;
  // Binary search for the largest entry with ts <= tsSeconds.
  let lo = 0, hi = FLOOR_HISTORY.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (FLOOR_HISTORY[mid].ts <= tsSeconds) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found === -1 ? null : FLOOR_HISTORY[found].floor;
}

// ─── LIVE FLOOR PRICE (Alchemy NFT API) ────────────────────────────────────────
const FLOOR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let floorCache = { price: FLOOR_PRICE_ETH, fetchedAt: 0, isLive: false };

async function getFloorPrice() {
  const now = Date.now();
  if (floorCache.isLive && (now - floorCache.fetchedAt) < FLOOR_CACHE_TTL_MS) {
    return floorCache;
  }
  try {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) throw new Error('ALCHEMY_API_KEY not set');
    const res = await fetch(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${apiKey}/getFloorPrice?contractAddress=0x4E1f41613c9084FdB9E34E11fAE9412427480e56`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
    const data = await res.json();
    // Use OpenSea floor as primary source; fall back to looksRare if OpenSea unavailable
    const floor = data?.openSea?.floorPrice ?? data?.looksRare?.floorPrice;
    if (typeof floor !== 'number' || floor <= 0) throw new Error('Unexpected response shape');
    floorCache = { price: floor, fetchedAt: now, isLive: true };
    console.log(`[floor] Live floor updated: ${floor} ETH`);
  } catch (err) {
    console.warn(`[floor] Fetch failed (${err.message}), using fallback ${FLOOR_PRICE_ETH} ETH`);
    // Preserve stale live cache if we have one; otherwise use hardcoded fallback
    if (!floorCache.isLive) {
      floorCache = { price: FLOOR_PRICE_ETH, fetchedAt: now, isLive: false };
    }
  }
  return floorCache;
}

// ─── OPENSEA LISTINGS + UNDERVALUED ───────────────────────────────────────────
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
const UNDERVALUED_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let undervaluedCache = { data: null, fetchedAt: 0 };

// Fetch a single URL with exponential backoff on 429 / 5xx responses.
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) throw new Error(`OpenSea API error: HTTP ${res.status}`);
      const delay = Math.min(1000 * 2 ** attempt, 8_000);
      console.warn(`[opensea] HTTP ${res.status} on attempt ${attempt + 1}, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return res;
  }
}

// Fetch active listings from OpenSea for the Terraforms collection.
// Returns array of { tokenId, listedPrice, listedAt } sorted cheapest first.
// Paginates until cursor is exhausted, capped at SAFETY_MAX_PAGES.
// Pass maxPages to limit depth (e.g. computeUndervalued uses maxPages=2).
async function fetchOpenSeaListings(maxPages = Infinity) {
  const SAFETY_MAX_PAGES = 50;
  const listings = [];
  let next = null;

  for (let page = 0; page < maxPages && page < SAFETY_MAX_PAGES; page++) {
    const url = new URL('https://api.opensea.io/api/v2/listings/collection/terraforms/all');
    url.searchParams.set('limit', '100');
    if (next) url.searchParams.set('next', next);

    const res = await fetchWithRetry(url.toString(), {
      headers: { 'X-API-KEY': OPENSEA_API_KEY, 'accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`OpenSea API error: HTTP ${res.status}`);
    const data = await res.json();

    for (const listing of data.listings || []) {
      const offer = listing.protocol_data?.parameters?.offer?.[0];
      const tokenId = offer ? parseInt(offer.identifierOrCriteria, 10) : null;
      const priceVal = listing.price?.current?.value;
      const decimals = listing.price?.current?.decimals ?? 18;
      // Only minted parcels (1–9911); skip bundles and non-ETH listings
      if (!tokenId || !priceVal || tokenId < 1 || tokenId > 9911) continue;
      const listedPrice = Number(priceVal) / Math.pow(10, decimals);
      const listedAt = parseInt(listing.protocol_data?.parameters?.startTime, 10) || null;
      listings.push({ tokenId, listedPrice, listedAt });
    }

    next = data.next;
    if (!next) break;
  }

  listings.sort((a, b) => a.listedPrice - b.listedPrice);
  // Deduplicate by tokenId — keep cheapest listing per token
  const seen = new Set();
  return listings.filter(l => seen.has(l.tokenId) ? false : seen.add(l.tokenId));
}

async function computeUndervalued() {
  const now = Date.now();
  const allListings = await fetchOpenSeaListings(2);
  const { price: floor, isLive: floorIsLive } = await getFloorPrice();

  // Resolve traits from the baked snapshot first; fall back to RPC for any tokenIds
  // not in the snapshot (handles edge cases like out-of-range tokens or post-bake mints).
  const fromSnapshot = [];
  const needRpc = [];
  for (const l of allListings) {
    const traits = getSnapshotTraits(l.tokenId);
    if (traits) fromSnapshot.push({ traits, listing: l });
    else needRpc.push(l);
  }

  const results = [];
  const score = (traits, listedPrice) => {
    const pricing = estimatePrice(traits, floor);
    const discount = (pricing.estimatedValue - listedPrice) / pricing.estimatedValue;
    if (discount >= 0.01) {
      results.push({ tokenId: traits.tokenId, traits, pricing, listedPrice, discount });
    }
  };

  for (const { traits, listing } of fromSnapshot) score(traits, listing.listedPrice);

  if (needRpc.length > 0) {
    console.log(`[undervalued] ${fromSnapshot.length} from snapshot, ${needRpc.length} via RPC fallback`);
    const BATCH_SIZE = 8;
    for (let i = 0; i < needRpc.length; i += BATCH_SIZE) {
      const batch = needRpc.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(batch.map(l => getParcelTraits(l.tokenId)));
      for (let j = 0; j < settled.length; j++) {
        if (settled[j].status === 'fulfilled') score(settled[j].value, batch[j].listedPrice);
      }
    }
  }

  results.sort((a, b) => b.discount - a.discount);
  const responseData = {
    parcels: results.slice(0, 25),
    floor,
    floorIsLive,
    totalListingsScanned: allListings.length,
    fetchedAt: now,
  };
  undervaluedCache = { data: responseData, fetchedAt: now };
  return responseData;
}

// In-flight guard: collapses concurrent cold-cache requests into a single computation.
// Without this, simultaneous requests would each kick off the full 20–40s pipeline.
let undervaluedInFlight = null;
let undervaluedFailedAt = 0;
const UNDERVALUED_BACKOFF_MS = 60_000;

// Kick off a background refresh if one isn't already running. Caller does not await.
function triggerUndervaluedRefresh() {
  if (undervaluedInFlight) return;
  if (!OPENSEA_API_KEY) return;
  if (Date.now() - undervaluedFailedAt < UNDERVALUED_BACKOFF_MS) return;
  undervaluedInFlight = computeUndervalued()
    .catch(err => {
      undervaluedFailedAt = Date.now();
      console.error('[undervalued] background refresh failed:', err.message);
    })
    .finally(() => { undervaluedInFlight = null; });
}

// GET /undervalued
// Stale-while-revalidate: if cached data exists, return it immediately.
// If the cache is stale, kick off a background refresh — the next request
// after it completes will get fresh data. Only blocks on a truly cold cache.
app.get('/undervalued', async (req, res) => {
  try {
    const now = Date.now();
    const hasCache = !!undervaluedCache.data;
    const isStale = hasCache && (now - undervaluedCache.fetchedAt) >= UNDERVALUED_CACHE_TTL_MS;

    if (hasCache) {
      if (isStale) triggerUndervaluedRefresh();
      return res.json(undervaluedCache.data);
    }

    if (!OPENSEA_API_KEY) {
      return res.status(503).json({ error: 'OpenSea API key not configured on server.' });
    }

    if (!undervaluedInFlight && (now - undervaluedFailedAt) < UNDERVALUED_BACKOFF_MS) {
      return res.status(503).json({ error: 'Undervalued data temporarily unavailable. Try again shortly.' });
    }

    if (!undervaluedInFlight) {
      undervaluedInFlight = computeUndervalued().finally(() => { undervaluedInFlight = null; });
    }
    const responseData = await undervaluedInFlight;
    res.json(responseData);
  } catch (err) {
    undervaluedFailedAt = Date.now();
    console.error('[undervalued]', err.message);
    res.status(500).json({ error: 'Failed to fetch undervalued parcels.' });
  }
});

// ─── ALL LISTINGS ─────────────────────────────────────────────────────────────
// Fetches every active listing (paginate until exhausted), scores each against
// the pricing model, and returns the full dataset so the frontend can sort/filter.
const LISTINGS_CACHE_TTL_MS = 30 * 60 * 1000;
let listingsCache = { data: null, fetchedAt: 0 };
let listingsInFlight = null;
let listingsFailedAt = 0;
const LISTINGS_BACKOFF_MS = 60_000;

async function computeAllListings() {
  const now = Date.now();
  const allListings = await fetchOpenSeaListings(); // paginate until cursor exhausted
  const { price: floor, isLive: floorIsLive } = await getFloorPrice();

  const fromSnapshot = [];
  const needRpc = [];
  for (const l of allListings) {
    const traits = getSnapshotTraits(l.tokenId);
    if (traits) fromSnapshot.push({ traits, listing: l });
    else needRpc.push(l);
  }

  const results = [];
  const score = (traits, listing) => {
    const pricing = estimatePrice(traits, floor);
    const discount = (pricing.estimatedValue - listing.listedPrice) / pricing.estimatedValue;
    results.push({ tokenId: traits.tokenId, traits, pricing, listedPrice: listing.listedPrice, listedAt: listing.listedAt, discount });
  };

  for (const { traits, listing } of fromSnapshot) score(traits, listing);

  if (needRpc.length > 0) {
    console.log(`[listings] ${fromSnapshot.length} from snapshot, ${needRpc.length} via RPC fallback`);
    const BATCH_SIZE = 8;
    for (let i = 0; i < needRpc.length; i += BATCH_SIZE) {
      const batch = needRpc.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(batch.map(l => getParcelTraits(l.tokenId)));
      for (let j = 0; j < settled.length; j++) {
        if (settled[j].status === 'fulfilled') score(settled[j].value, batch[j]);
      }
    }
  }

  return { parcels: results, floor, floorIsLive, totalListings: allListings.length, fetchedAt: now };
}

function triggerListingsRefresh() {
  if (listingsInFlight) return;
  if (!OPENSEA_API_KEY) return;
  if (Date.now() - listingsFailedAt < LISTINGS_BACKOFF_MS) return;
  listingsInFlight = computeAllListings()
    .then(data => { listingsCache = { data, fetchedAt: Date.now() }; return data; })
    .catch(err => { listingsFailedAt = Date.now(); console.error('[listings] background refresh failed:', err.message); })
    .finally(() => { listingsInFlight = null; });
}

app.use('/listings', undervaluedLimiter);

// GET /listings
// Returns all active OpenSea listings scored against the pricing model.
// Stale-while-revalidate: serves cached data immediately if available; refreshes in background when stale.
app.get('/listings', async (req, res) => {
  try {
    const now = Date.now();
    const hasCache = !!listingsCache.data;
    const isStale = hasCache && (now - listingsCache.fetchedAt) >= LISTINGS_CACHE_TTL_MS;

    if (hasCache) {
      if (isStale) triggerListingsRefresh();
      return res.json(listingsCache.data);
    }

    if (!OPENSEA_API_KEY) {
      return res.status(503).json({ error: 'OpenSea API key not configured on server.' });
    }

    if (!listingsInFlight && (now - listingsFailedAt) < LISTINGS_BACKOFF_MS) {
      return res.status(503).json({ error: 'Listings data temporarily unavailable. Try again shortly.' });
    }

    if (!listingsInFlight) {
      listingsInFlight = computeAllListings()
        .then(data => { listingsCache = { data, fetchedAt: Date.now() }; return data; })
        .finally(() => { listingsInFlight = null; });
    }
    const responseData = await listingsInFlight;
    res.json(responseData);
  } catch (err) {
    listingsFailedAt = Date.now();
    console.error('[listings]', err.message);
    res.status(500).json({ error: 'Failed to fetch listings.' });
  }
});

// ─── OPENSEA RECENT SALES ─────────────────────────────────────────────────────
// Live "sales vs. estimate" feed. Mirrors the caching + in-flight guard pattern
// used by /undervalued above — cold-path fans out to RPC for traits on every
// scanned sale, so without the guard a burst of requests would multiply load.
const { computeRecentSales } = require('./sales');
const SALES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes, matches /undervalued
const SALES_BACKOFF_MS = 60_000;
let salesCache = { data: null, fetchedAt: 0 };
let salesInFlight = null;
let salesFailedAt = 0;

// GET /sales
// Returns up to 50 of the most recent OpenSea sales for the Terraforms
// collection, each stamped with our current estimate + signed error
// ((sale - estimate) / estimate). Non-ETH/WETH sales are counted but not
// priced (surfaced as `skippedNonEth`).
app.get('/sales', async (req, res) => {
  try {
    const now = Date.now();
    if (salesCache.data && (now - salesCache.fetchedAt) < SALES_CACHE_TTL_MS) {
      return res.json(salesCache.data);
    }

    if (!OPENSEA_API_KEY) {
      return res.status(503).json({ error: 'OpenSea API key not configured on server.' });
    }

    if (!salesInFlight && (now - salesFailedAt) < SALES_BACKOFF_MS) {
      return res.status(503).json({ error: 'Sales data temporarily unavailable. Try again shortly.' });
    }

    if (!salesInFlight) {
      salesInFlight = computeRecentSales({
        apiKey: OPENSEA_API_KEY,
        fetchWithRetry,
        getParcelTraits,
        getFloorPrice,
        floorAt,
        limit: 50,
      })
        .then(data => {
          salesCache = { data, fetchedAt: Date.now() };
          return data;
        })
        .finally(() => { salesInFlight = null; });
    }
    const responseData = await salesInFlight;
    res.json(responseData);
  } catch (err) {
    salesFailedAt = Date.now();
    console.error('[sales]', err.message);
    res.status(500).json({ error: 'Failed to fetch recent sales.' });
  }
});

// Parse all traits from tokenURI metadata
// Zone and Level are read from tokenURI attributes (trait_type "Zone" / "Level").
// tokenSupplementalData has a struct ABI mismatch and is not used.
async function getParcelTraits(tokenId) {
  try {
    const uri = await getCachedTokenURI(tokenId);

    let zone = null, level = null, biome = null, chroma = null, mode = null,
        specialType = null, isOneOfOne = false, isGodmode = false, isS0 = false,
        isLith0like = false, isGm = false, mysteryValue = null, seed = null,
        x = null, y = null;

    if (uri.startsWith('data:application/json;base64,')) {
      const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
      const attrs = json.attributes || [];

      // Extract seed from tokenHTML (on-chain HTML animation contains `const SEED=X;`)
      // The SVG from tokenURI is static and has no SEED — tokenHTML is the correct source.
      try {
        const html = await getCachedTokenHTML(tokenId);
        const m = html.match(/\bSEED\s*=\s*(\d+)/);
        if (m) seed = parseInt(m[1], 10);
      } catch (err) {
        console.warn(`[traits] Token ${tokenId}: tokenHTML failed (${err.message}) — seed will be null`);
      }

      // Extract X/Y coordinates from tokenSupplementalData via raw call.
      // The function returns a struct memory, which ABI-encodes as:
      //   [0x20 outer pointer (32 bytes) | slot0 (32) | level (32) | xCoordinate (32) | yCoordinate (32) | ...]
      // xCoordinate is at byte offset 96, yCoordinate at byte offset 128.
      try {
        const { provider } = getProvider();
        const selector = ethers.id('tokenSupplementalData(uint256)').slice(0, 10);
        const arg = ethers.zeroPadValue(ethers.toBeHex(tokenId), 32);
        const raw = await withTimeout(provider.call({ to: TERRAFORMS_ADDRESS, data: selector + arg.slice(2) }));
        if (raw && raw.length >= 322) {
          x = Number(BigInt('0x' + raw.slice(194, 258)));
          y = Number(BigInt('0x' + raw.slice(258, 322)));
        }
      } catch (err) {
        console.warn(`[traits] Token ${tokenId}: tokenSupplementalData failed (${err.message}) — x/y will be null`);
      }

      zone = attrs.find(a => a.trait_type === 'Zone')?.value || null;
      level = parseInt(attrs.find(a => a.trait_type === 'Level')?.value ?? -1, 10);
      biome = parseInt(attrs.find(a => a.trait_type === 'Biome')?.value ?? -1, 10);
      if (level === -1) console.warn(`[traits] Token ${tokenId}: missing Level attribute`);
      if (biome === -1) console.warn(`[traits] Token ${tokenId}: missing Biome attribute`);
      chroma = attrs.find(a => a.trait_type === 'Chroma')?.value || 'Flow';
      mode = attrs.find(a => a.trait_type === 'Mode')?.value || 'Terrain';
      specialType = SPECIAL_TOKEN_LOOKUP[Number(tokenId)] || detectSpecialType(attrs) || null;
      isOneOfOne  = ONE_OF_ONE_IDS.has(Number(tokenId));
      isGodmode   = GODMODE_IDS.has(Number(tokenId));
      isLith0like = LITH0LIKE_IDS.has(Number(tokenId));
      isGm        = GM_IDS.has(Number(tokenId));
      // S0 (Season 0) — parcels whose antenna was first turned on during the
      // V2 launch window (2023-12-24 → 2024-01-13 UTC). Antenna activation
      // timestamps live on a separate contract; query only when currently on.
      const antennaOn = attrs.find(a => a.trait_type === 'Antenna')?.value === 'On';
      let antennaFirstTs = 0;
      if (antennaOn) {
        try {
          const { antennaContract: ac } = getProvider();
          const rec = await withTimeout(ac.getFirstAntennaModification(tokenId));
          antennaFirstTs = Number(rec[2]);
        } catch (err) {
          // Reverts with "No antenna modifications" if never modified — leave at 0.
        }
      }
      isS0 = computeIsS0(antennaOn, antennaFirstTs);
      // '???' trait — the watermark level, controlling how much of the parcel surface is flooded by
      // the liquid animation. Derived from Perlin Noise; locked on-chain but delegatable to an external
      // contract. Present on ~89% of tokens. Not used in pricing (collection-wide distribution, no
      // rarity correlation). Surfaced as a high/low outlier flag — see MYSTERY_P5/MYSTERY_P95 below.
      const rawMystery = attrs.find(a => a.trait_type === '???')?.value;
      mysteryValue = rawMystery != null ? Number(rawMystery) : null;
    }

    return {
      tokenId: Number(tokenId),
      zone,
      level: isNaN(level) ? null : level,
      biome: isNaN(biome) ? null : biome,
      chroma,
      mode,
      specialType,
      isOneOfOne,
      isGodmode,
      isS0,
      isLith0like,
      isGm,
      mysteryValue,
      mysteryOutlier: mysteryOutlierFlag(mysteryValue),
      seed,
      x,
      y,
    };
  } catch (err) {
    console.error(`Error fetching traits for token ${tokenId}:`, err);
    throw new Error(`Could not fetch traits for parcel ${tokenId}`);
  }
}

// GET /estimate/:tokenId
// GET /image/:tokenId — serves the on-chain SVG directly from tokenURI
// The SVG is base64-encoded inside the JSON image field.
// Note: parcels can change mode (terraform/daydream), so no long-term caching.
app.get('/image/:tokenId', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.tokenId)) return res.status(400).send('Invalid token ID');
    const tokenId = parseInt(req.params.tokenId, 10);
    if (tokenId < 1 || tokenId > 9911) {
      return res.status(400).send('Invalid token ID');
    }

    const uri = await getCachedTokenURI(tokenId);

    if (!uri.startsWith('data:application/json;base64,')) {
      return res.status(500).send('Unexpected tokenURI format');
    }

    const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
    const image = json.image || '';

    if (image.startsWith('data:image/svg+xml;base64,')) {
      const svg = Buffer.from(image.slice(26), 'base64');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h — tokenURI is immutable
      return res.send(svg);
    }

    if (image.startsWith('data:image/svg+xml,')) {
      const svg = decodeURIComponent(image.slice(19));
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(svg);
    }

    res.status(500).send('Unrecognised image format in tokenURI');
  } catch (err) {
    console.error(`[image] ${req.params.tokenId}:`, err.message);
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 277 400" width="277" height="400"><rect width="277" height="400" fill="#1a1918"/><text x="138" y="185" font-size="80" text-anchor="middle" dominant-baseline="middle">⛱</text><text x="138" y="260" font-family="monospace" font-size="11" fill="#ffffff" opacity="0.4" text-anchor="middle">parcel did not load</text></svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(fallbackSvg);
  }
});

// GET /estimate/:tokenId
app.get('/estimate/:tokenId', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.tokenId)) return res.status(400).json({ error: 'Invalid token ID (must be 1–9911)' });
    const tokenId = parseInt(req.params.tokenId, 10);
    if (tokenId < 1 || tokenId > 9911) {
      return res.status(400).json({ error: 'Invalid token ID (must be 1–9911)' });
    }

    const [traits, { price: floor, isLive: floorIsLive }] = await Promise.all([
      getParcelTraits(tokenId),
      getFloorPrice(),
    ]);
    const pricing = estimatePrice(traits, floor);

    res.json({ tokenId, traits, pricing, floorIsLive });
  } catch (err) {
    console.error(`[estimate] ${req.params.tokenId}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch parcel data.' });
  }
});

// GET /wallet/:address
app.get('/wallet/:address', async (req, res) => {
  try {
    let address = req.params.address;
    if (!ethers.isAddress(address)) {
      // Attempt ENS resolution (supports .eth names including emoji ENS like 🐒.eth)
      const { provider } = getProvider();
      try {
        const resolved = await withTimeout(provider.resolveName(address), 10_000);
        if (!resolved) {
          const safe = String(req.params.address).slice(0, 100).replace(/[<>"']/g, '');
          return res.status(400).json({ error: `Could not resolve ENS name: ${safe}` });
        }
        address = resolved;
        console.log(`[wallet] ENS resolved: ${req.params.address} → ${address}`);
      } catch (ensErr) {
        const safe = String(req.params.address).slice(0, 100).replace(/[<>"']/g, '');
        return res.status(400).json({ error: `Invalid address or unresolvable name: ${safe}` });
      }
    }

    const { contract } = getProvider();
    const balance = await withTimeout(contract.balanceOf(address));
    const count = Number(balance);
    const MAX_WALLET_TOKENS = 500;
    const fetchCount = Math.min(count, MAX_WALLET_TOKENS);
    if (count > MAX_WALLET_TOKENS) {
      console.warn(`[wallet] ${address}: balance=${count} exceeds cap, clamping to ${MAX_WALLET_TOKENS}`);
    }

    const { price: liveFloor, isLive: floorIsLive } = await getFloorPrice();

    if (fetchCount === 0) {
      return res.json({ address, parcels: [], sets: [], totalEstimatedValue: 0, floor: liveFloor, floorIsLive });
    }

    const tokenIds = await withTimeout(
      Promise.all(Array.from({ length: fetchCount }, (_, i) => contract.tokenOfOwnerByIndex(address, i))),
      30_000, // 30s for large wallets
    );

    // Batch fetch traits for all tokens (needed for accurate set detection)
    const BATCH_SIZE = 5;
    const allParcels = [];
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const batch = tokenIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(id => getParcelTraits(id)));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          allParcels.push(r.value);
        } else {
          console.warn(`[wallet] Token ${batch[j]}: trait fetch failed — ${r.reason?.message || r.reason}`);
        }
      }
    }

    // Set detection runs on all parcels
    const sets = detectSets(allParcels);

    // Pricing and display capped at 100 to keep response size manageable
    const displayParcels = allParcels.slice(0, 100);
    const pricedParcels = displayParcels.map(p => ({
      tokenId: p.tokenId,
      traits: p,
      pricing: estimatePrice(p, liveFloor),
    }));

    // Reuse already-computed pricing for the first 100; run estimatePrice only for the remainder
    const displayedTotal = pricedParcels.reduce((sum, p) => sum + p.pricing.estimatedValue, 0);
    const remainderTotal = allParcels.slice(100).reduce((sum, p) => sum + estimatePrice(p, liveFloor).estimatedValue, 0);
    const totalEstimatedValue = displayedTotal + remainderTotal;

    res.json({
      address,
      totalParcels: count,
      fetchedParcels: allParcels.length,
      parcels: pricedParcels,
      sets,
      totalEstimatedValue: Math.round(totalEstimatedValue * 1000) / 1000,
      floor: liveFloor,
      floorIsLive,
    });
  } catch (err) {
    console.error(`[wallet] ${req.params.address}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch wallet data.' });
  }
});

// ─── UNMINTED PARCELS ──────────────────────────────────────────────────────────
const UNMINTED_PARCELS = require('./unminted-parcels.json');
// Build lookup maps: by coordinate and by sequential ID
const UNMINTED_LOOKUP    = new Map(UNMINTED_PARCELS.map(p => [`${p.level}/${p.x}/${p.y}`, p]));
const UNMINTED_ID_LOOKUP = new Map(UNMINTED_PARCELS.map(p => [p.id, p]));

// Animation data (grid + colors per parcel) — optional, loaded separately.
// UNMINTED_ANIM_LOOKUP: keyed by coord, includes inline fontData (used by
//   /unminted/search to serve the full preview in one round-trip).
// UNMINTED_ANIM_BY_ID: keyed by sequential id, fontIndex only (used by
//   /unminted/anim/:id for thumbnail cards — payload stays ~2KB).
// UNMINTED_FONT_ARRAY: served on-demand via /unminted/font/:idx so thumb
//   cards can dedupe font fetches by index.
let UNMINTED_ANIM_LOOKUP = new Map();
let UNMINTED_ANIM_BY_ID  = new Map();
let UNMINTED_FONT_ARRAY  = [];
try {
  const animData = require('./unminted-animation.json');
  try { UNMINTED_FONT_ARRAY = require('./unminted-fonts.json'); } catch(_) {}
  for (const p of animData) {
    const light = {
      grid: p.grid, colors: p.colors, seed: p.seed, resource: p.resource,
      chars: p.chars || {},
      fontSize: p.fontSize || 15,
      fontWeight: p.fontWeight || null,
      animClasses: p.animClasses || [],
      fontIndex: p.fontIndex ?? null,
    };
    UNMINTED_ANIM_LOOKUP.set(`${p.level}/${p.x}/${p.y}`, {
      ...light,
      fontData: light.fontIndex != null ? UNMINTED_FONT_ARRAY[light.fontIndex] : null,
    });
  }
  for (const parcel of UNMINTED_PARCELS) {
    const full = UNMINTED_ANIM_LOOKUP.get(`${parcel.level}/${parcel.x}/${parcel.y}`);
    if (full) {
      const { fontData, ...rest } = full;
      UNMINTED_ANIM_BY_ID.set(parcel.id, rest);
    }
  }
  console.log(`[startup] Animation data loaded for ${UNMINTED_ANIM_LOOKUP.size} unminted parcels`);
} catch(e) {
  console.warn('[startup] unminted-animation.json not found — animations disabled');
}

app.use('/unminted', standardLimiter);

// Shared handler: resolve a parcel, price it, and attach anim data
async function resolveUnminted(parcel, res) {
  const { price: floor, isLive: floorIsLive } = await getFloorPrice();
  // Compute derivable special flags from parcel data.
  // isS0 / isGodmode / isOneOfOne / isLith0like require manual curation — not applicable to unminted.
  // isGm: Terrain + Biome 71 + low ??? (mirrors minted logic; visual pattern derives from these traits).
  const isGm = parcel.biome === 71 && parcel.mode === 'Terrain'
    && parcel.mysteryValue != null && parcel.mysteryValue < MYSTERY_P5;
  const traits   = { ...parcel, isS0: false, isGodmode: false, isOneOfOne: false, isLith0like: false, isGm };
  const pricing  = estimatePrice(traits, floor);
  const animData = UNMINTED_ANIM_LOOKUP.get(`${parcel.level}/${parcel.x}/${parcel.y}`) || null;
  res.json({ traits, pricing, floorIsLive, animData });
}

// GET /unminted/search?id=N  — lookup by sequential id (1–1193)
// GET /unminted/search?level=L&x=X&y=Y  — lookup by coordinates
app.get('/unminted/search', async (req, res) => {
  try {
    if (req.query.id !== undefined) {
      const id = parseInt(req.query.id, 10);
      if (isNaN(id) || id < 1 || id > UNMINTED_PARCELS.length) {
        return res.status(400).json({ error: `Unminted ID must be between 1 and ${UNMINTED_PARCELS.length}.` });
      }
      const parcel = UNMINTED_ID_LOOKUP.get(id);
      if (!parcel) return res.status(404).json({ error: `Unminted parcel #${id} not found.` });
      return await resolveUnminted(parcel, res);
    }

    const level = parseInt(req.query.level, 10);
    const x     = parseInt(req.query.x, 10);
    const y     = parseInt(req.query.y, 10);
    if (isNaN(level) || isNaN(x) || isNaN(y)) {
      return res.status(400).json({ error: 'Provide either id=N or level=L&x=X&y=Y.' });
    }
    const parcel = UNMINTED_LOOKUP.get(`${level}/${x}/${y}`);
    if (!parcel) return res.status(404).json({ error: `No unminted parcel found at L${level}/X${x}/Y${y}.` });
    return await resolveUnminted(parcel, res);
  } catch (err) {
    console.error('[unminted/search]', err.message);
    res.status(500).json({ error: 'Failed to fetch unminted parcel data.' });
  }
});

// Lightweight per-parcel anim data for thumbnail cards — no fontData inline
// (fonts are fetched separately so duplicates dedupe across cards).
app.get('/unminted/anim/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const data = UNMINTED_ANIM_BY_ID.get(id);
  if (!data) return res.status(404).json({ error: 'not found' });
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(data);
});

// One font (by index 0..93) as base64 woff2. Heavily cached — the 94 fonts
// are static, deployed with the build.
app.get('/unminted/font/:idx', (req, res) => {
  const idx = parseInt(req.params.idx, 10);
  if (isNaN(idx) || idx < 0 || idx >= UNMINTED_FONT_ARRAY.length) {
    return res.status(404).json({ error: 'not found' });
  }
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.json({ fontData: UNMINTED_FONT_ARRAY[idx] });
});

// ─── TRAITS BROWSE ─────────────────────────────────────────────────────────────
// Find every parcel (minted + unminted) matching a given special trait, e.g.
// every Mesa parcel, every Lith0-like, every Penthouse. Index is built on
// first request and cached for the process lifetime — underlying data
// (snapshot + curated id sets) is static.
const TRAIT_TYPES = [
  { type: 'godmode',          label: 'Godmode',          group: 'special' },
  { type: 'origin-daydream',  label: 'Origin Daydream',  group: 'mode' },
  { type: 'origin-terraform', label: 'Origin Terraform', group: 'mode' },
  { type: 'plague',           label: 'Plague',           group: 'special' },
  { type: 'x-seed',           label: 'X-Seed',           group: 'special' },
  { type: 'y-seed',           label: 'Y-Seed',           group: 'special' },
  { type: 'lith0',            label: 'Lith0',            group: 'special' },
  { type: 'spine',            label: 'Spine',            group: 'special' },
  { type: '1of1',             label: '1 of 1',           group: 'special' },
  { type: 's0',               label: 'S0',               group: 'special' },
  { type: 'biome0',           label: 'Biome 0',          group: 'visual' },
  { type: 'lith0like',        label: 'Lith0-like',       group: 'visual' },
  { type: 'mesa',             label: 'Mesa',             group: 'visual' },
  { type: 'matrix',           label: 'Matrix',           group: 'visual' },
  { type: 'big-grass',        label: 'Big Grass',        group: 'visual' },
  { type: 'little-grass',     label: 'Little Grass',     group: 'visual' },
  { type: 'heartbeat',        label: 'Heartbeat',        group: 'visual' },
  { type: 'gm',               label: 'gm',               group: 'visual' },
  { type: 'basement',         label: 'Basement',         group: 'level' },
  { type: 'penthouse',        label: 'Penthouse',        group: 'level' },
];

// Mirrors AutoBadgeStack / hasBadges logic in frontend/src/components/shared.js.
// Keep in sync — drift between the two is what causes badge-vs-search disagreements.
function matchesTrait(traits, type) {
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryValue } = traits;
  const isTerrain = mode === 'Terrain';
  switch (type) {
    case 'godmode':          return !!isGodmode;
    case 'origin-daydream':  return mode === 'Origin Daydream';
    case 'origin-terraform': return mode === 'Origin Terraform';
    case 'plague':           return specialType === 'Plague';
    case 'x-seed':           return specialType === 'X-Seed';
    case 'y-seed':           return specialType === 'Y-Seed';
    case 'lith0':            return specialType === 'Lith0';
    case 'spine':            return specialType === 'Spine';
    case '1of1':             return !!isOneOfOne;
    case 's0':               return !!isS0;
    case 'biome0':           return biome === 0 && specialType !== 'Lith0';
    case 'lith0like':        return !!isLith0like;
    case 'mesa':             return isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000;
    case 'matrix':           return isTerrain && biome === 58 && zone === 'Intro Forest';
    case 'big-grass':        return isTerrain && biome === 42;
    case 'little-grass':     return isTerrain && biome === 65;
    case 'heartbeat':        return isTerrain && zone === '[BLOOD]' && chroma === 'Pulse';
    case 'gm':               return !!isGm;
    case 'basement':         return level === 1;
    case 'penthouse':        return level === 20;
    default: return false;
  }
}

// Unminted parcels store specialType directly (1of1, Spine, Lith0, etc.) but
// no isOneOfOne/isGm flags — derive them so matchesTrait can use one shape.
function augmentUnmintedTraits(parcel) {
  const isGm = parcel.biome === 71 && parcel.mode === 'Terrain'
    && parcel.mysteryValue != null && parcel.mysteryValue < MYSTERY_P5;
  return {
    ...parcel,
    isS0: false,
    isGodmode: false,
    isOneOfOne: parcel.specialType === '1of1',
    isLith0like: false,
    isGm,
  };
}

let TRAITS_INDEX = null;
function getTraitsIndex() {
  if (TRAITS_INDEX) return TRAITS_INDEX;
  const t0 = Date.now();
  const index = {};
  for (const t of TRAIT_TYPES) index[t.type] = { ...t, parcels: [] };

  if (MINTED_TRAITS_SNAPSHOT) {
    for (const tokenId of MINTED_TRAITS_SNAPSHOT.keys()) {
      const traits = getSnapshotTraits(tokenId);
      if (!traits) continue;
      for (const t of TRAIT_TYPES) {
        if (matchesTrait(traits, t.type)) {
          index[t.type].parcels.push({ tokenId, traits, isUnminted: false });
        }
      }
    }
  }

  for (const parcel of UNMINTED_PARCELS) {
    const traits = augmentUnmintedTraits(parcel);
    const tokenId = 9911 + parcel.id;
    for (const t of TRAIT_TYPES) {
      if (matchesTrait(traits, t.type)) {
        index[t.type].parcels.push({ tokenId, unmintedId: parcel.id, traits, isUnminted: true });
      }
    }
  }

  for (const t of TRAIT_TYPES) {
    index[t.type].parcels.sort((a, b) => a.tokenId - b.tokenId);
  }

  TRAITS_INDEX = index;
  console.log(`[traits] Built trait index in ${Date.now() - t0}ms`);
  return TRAITS_INDEX;
}

app.use('/traits', standardLimiter);

// GET /traits — list of trait types with parcel counts
app.get('/traits', (_req, res) => {
  const index = getTraitsIndex();
  const types = TRAIT_TYPES.map(t => ({ ...t, count: index[t.type].parcels.length }));
  res.json({ types });
});

// GET /traits/:type — all parcels matching the trait, sorted by tokenId
app.get('/traits/:type', (req, res) => {
  const validType = TRAIT_TYPES.find(t => t.type === req.params.type);
  if (!validType) return res.status(404).json({ error: 'Unknown trait type' });
  const entry = getTraitsIndex()[validType.type];
  res.json({
    type: entry.type,
    label: entry.label,
    group: entry.group,
    count: entry.parcels.length,
    parcels: entry.parcels,
  });
});

// GET /health
app.use('/health', standardLimiter);
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /floor
app.get('/floor', async (req, res) => {
  try {
    const { price, isLive, fetchedAt } = await getFloorPrice();
    res.json({ floor: price, isLive, fetchedAt });
  } catch (err) {
    console.error('[floor]', err.message);
    res.status(500).json({ error: 'Failed to fetch floor price.' });
  }
});

// ─── WEEKLY REPORT DATA ────────────────────────────────────────────────────────

async function fetchCollectorsCount() {
  // Try 1: Etherscan V2 tokeninfo (requires ETHERSCAN_API_KEY)
  try {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (apiKey) {
      const url = `https://api.etherscan.io/v2/api?chainid=1&module=token&action=tokeninfo&contractaddress=${TERRAFORMS_ADDRESS}&apikey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      const count = parseInt(data.result?.[0]?.holdersCount, 10);
      if (Number.isFinite(count)) return count;
    }
  } catch (err) {
    console.warn('[weekly-report] Etherscan tokeninfo failed:', err.message);
  }

  // Try 2: OpenSea collection stats → total.num_owners
  try {
    const res = await fetchWithRetry(
      'https://api.opensea.io/api/v2/collections/terraforms/stats',
      { headers: { 'X-API-KEY': OPENSEA_API_KEY, 'Accept': 'application/json' } }
    );
    const data = await res.json();
    const count = data?.total?.num_owners ?? data?.num_owners ?? null;
    if (count != null) return parseInt(count, 10);
  } catch (err) {
    console.warn('[weekly-report] OpenSea stats failed:', err.message);
  }

  return null;
}

async function fetchEthUsdPrice() {
  try {
    // Coinbase public API — no key required, no rate limit
    const res = await fetch(
      'https://api.coinbase.com/v2/prices/ETH-USD/spot',
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const price = parseFloat(data?.data?.amount);
    return Number.isFinite(price) ? price : null;
  } catch (err) {
    console.warn('[weekly-report] fetchEthUsdPrice failed:', err.message);
    return null;
  }
}

let weeklyReportCache = null;
let weeklyReportFetchedAt = 0;
let weeklyReportInFlight = null;
const WEEKLY_REPORT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function buildWeeklyReportData() {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // Fan out all slow calls in parallel.
  // fetchOpenSeaListings(2) = 2 pages × 100 = up to 200 listings (matches /undervalued).
  // computeRecentSales limit matches what /sales already uses.
  // Sales is load-bearing — anything else can degrade gracefully.
  const [salesRes, listingsRes, collectorsRes, ethUsdRes] = await Promise.allSettled([
    computeRecentSales({
      apiKey: OPENSEA_API_KEY,
      fetchWithRetry,
      getParcelTraits,
      getFloorPrice,
      floorAt,
    }),
    fetchOpenSeaListings(2),
    fetchCollectorsCount(),
    fetchEthUsdPrice(),
  ]);

  if (salesRes.status === 'rejected') throw salesRes.reason;
  const salesResult = salesRes.value;
  const listingsRaw = listingsRes.status === 'fulfilled' ? listingsRes.value : [];
  const collectors  = collectorsRes.status === 'fulfilled' ? collectorsRes.value : null;
  const ethUsd      = ethUsdRes.status === 'fulfilled' ? ethUsdRes.value : null;
  if (listingsRes.status === 'rejected') console.warn('[weekly-report] listings fetch failed:', listingsRes.reason?.message);

  // Use cheapest active OpenSea listing as the floor — already fetched, no extra call.
  // Fall back to Alchemy floor if listings came back empty.
  const floor = listingsRaw[0]?.listedPrice ?? salesResult.floor;
  const floorIsLive = salesResult.floorIsLive;

  // ── Weekly sales (past 7 days only) ──
  // closingDate from OpenSea is a Unix timestamp in seconds — convert to ms for Date comparison.
  const sevenDaysAgoMs = sevenDaysAgo.getTime();
  const weeklySales = salesResult.sales.filter(s => {
    if (!s.closingDate) return false;
    const ms = typeof s.closingDate === 'number' ? s.closingDate * 1000 : new Date(s.closingDate).getTime();
    return ms >= sevenDaysAgoMs;
  });
  const weekly_sales_count = weeklySales.length;
  const weekly_volume_eth =
    Math.round(
      weeklySales.reduce((sum, s) => sum + s.salePrice, 0) * 1000
    ) / 1000;

  // ── Top sales (highest price first, capped at 10) ──
  const top_sales = [...weeklySales]
    .sort((a, b) => b.salePrice - a.salePrice)
    .slice(0, 10)
    .map(s => ({
      tokenId: s.tokenId,
      zone: s.traits?.zone ?? null,
      biome: s.traits?.biome ?? null,
      mode: s.traits?.mode ?? null,
      chroma: s.traits?.chroma ?? null,
      specialType: s.traits?.specialType ?? null,
      price_eth: s.salePrice,
      estimated_value_eth: s.pricing?.estimatedValue ?? null,
      price_to_estimate_ratio:
        s.pricing?.estimatedValue
          ? Math.round((s.salePrice / s.pricing.estimatedValue) * 100) / 100
          : null,
      buyer_wallet: s.winner,
      seller_wallet: s.seller,
      timestamp: typeof s.closingDate === 'number' ? new Date(s.closingDate * 1000).toISOString() : s.closingDate,
    }));

  // ── Bargains: score every listing against estimator formula ──
  // Same approach as /undervalued: snapshot first, RPC fallback for misses.
  const scored = [];
  const scoreListing = (traits, listedPrice) => {
    const pricing = estimatePrice(traits, floor);
    const discount_pct = Math.round((1 - listedPrice / pricing.estimatedValue) * 100);
    scored.push({ tokenId: traits.tokenId, traits, pricing, listedPrice, discount_pct });
  };

  const needRpc = [];
  for (const l of listingsRaw) {
    const traits = getSnapshotTraits(l.tokenId);
    if (traits) scoreListing(traits, l.listedPrice);
    else needRpc.push(l);
  }

  if (needRpc.length > 0) {
    const BATCH = 8;
    for (let i = 0; i < needRpc.length; i += BATCH) {
      const batch = needRpc.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map(l => getParcelTraits(l.tokenId)));
      for (let j = 0; j < settled.length; j++) {
        if (settled[j].status === 'fulfilled') scoreListing(settled[j].value, batch[j].listedPrice);
      }
    }
  }

  const bargains = scored
    .filter(l => l.discount_pct > 0)
    .sort((a, b) => b.discount_pct - a.discount_pct)
    .slice(0, 10)
    .map(l => ({
      tokenId: l.tokenId,
      zone: l.traits.zone,
      biome: l.traits.biome,
      mode: l.traits.mode,
      chroma: l.traits.chroma,
      specialType: l.traits.specialType ?? null,
      list_price_eth: l.listedPrice,
      estimated_value_eth: l.pricing.estimatedValue,
      discount_pct: l.discount_pct,
    }));

  const floor_usd = ethUsd ? Math.round(floor * ethUsd) : null;
  const cheapest_listing = listingsRaw[0] ?? null;

  // listingsRaw is capped at 200 (2 pages). If the true listing count exceeds
  // 200 this will undercount. Acceptable given report usage.
  const parcels_listed = listingsRaw.length;

  const reportDate = new Date();

  return {
    period: {
      from: sevenDaysAgo.toISOString().slice(0, 10),
      to: reportDate.toISOString().slice(0, 10),
    },
    market: {
      floor_eth: floor,
      floor_usd,
      floor_token_id: cheapest_listing?.tokenId ?? null,
      parcels_listed,
      collectors,
      weekly_sales_count,
      weekly_volume_eth,
    },
    top_sales,
    bargains,
    fetchedAt: reportDate.toISOString(),
  };
}

app.get('/api/weekly-report-data', standardLimiter, async (req, res) => {
  try {
    const now = Date.now();

    if (weeklyReportCache && now - weeklyReportFetchedAt < WEEKLY_REPORT_CACHE_TTL) {
      return res.json(weeklyReportCache);
    }

    if (!weeklyReportInFlight) {
      weeklyReportInFlight = buildWeeklyReportData()
        .then(data => {
          weeklyReportCache = data;
          weeklyReportFetchedAt = Date.now();
          return data;
        })
        .finally(() => {
          weeklyReportInFlight = null;
        });
    }

    const data = await weeklyReportInFlight;
    res.json(data);
  } catch (err) {
    console.error('[weekly-report-data] error:', err);
    res.status(500).json({ error: 'Failed to build weekly report data.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Terraform Estimator API on port ${PORT}`);
  if (!process.env.ALCHEMY_API_KEY) console.warn('[startup] ALCHEMY_API_KEY not set — floor price will use hardcoded fallback');
  if (!process.env.OPENSEA_API_KEY) console.warn('[startup] OPENSEA_API_KEY not set — /undervalued endpoint disabled');
  try {
    const { provider } = getProvider();
    const network = await withTimeout(provider.getNetwork());
    if (network.chainId !== 1n) {
      console.error(`[startup] FATAL: RPC is on chain ${network.chainId}, expected mainnet (1). Prices will be wrong!`);
      process.exit(1);
    }
    console.log(`[startup] RPC connected to Ethereum mainnet`);
  } catch (err) {
    console.warn(`[startup] Could not verify chain ID: ${err.message}`);
  }
});
