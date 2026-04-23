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

let provider, contract;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    contract = new ethers.Contract(TERRAFORMS_ADDRESS, TERRAFORMS_ABI, provider);
  }
  return { provider, contract };
}

// ─── tokenURI LRU CACHE ─────────────────────────────────────────────────────
// Terraforms tokenURIs are immutable on-chain — safe to cache indefinitely.
// Caching here benefits both /image and /estimate (via getParcelTraits).
// Max 500 entries (~24MB worst-case); oldest entry evicted when full.
const TOKEN_URI_CACHE_MAX = 500;
const TOKEN_HTML_CACHE_MAX = 500;
const tokenUriCache = new Map(); // Map<tokenId, uri> — insertion order = LRU order
const tokenHtmlCache = new Map(); // Map<tokenId, html> — same LRU pattern for tokenHTML

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
    // Refresh insertion order (LRU hit)
    const uri = tokenUriCache.get(key);
    tokenUriCache.delete(key);
    tokenUriCache.set(key, uri);
    return uri;
  }
  const { contract } = getProvider();
  const uri = await withTimeout(contract.tokenURI(tokenId));
  if (tokenUriCache.size >= TOKEN_URI_CACHE_MAX) {
    // Evict oldest entry (first key in insertion order)
    tokenUriCache.delete(tokenUriCache.keys().next().value);
  }
  tokenUriCache.set(key, uri);
  return uri;
}

async function getCachedTokenHTML(tokenId) {
  const key = Number(tokenId);
  if (tokenHtmlCache.has(key)) {
    const html = tokenHtmlCache.get(key);
    tokenHtmlCache.delete(key);
    tokenHtmlCache.set(key, html);
    return html;
  }
  const { contract } = getProvider();
  const html = await withTimeout(contract.tokenHTML(tokenId));
  if (tokenHtmlCache.size >= TOKEN_HTML_CACHE_MAX) {
    tokenHtmlCache.delete(tokenHtmlCache.keys().next().value);
  }
  tokenHtmlCache.set(key, html);
  return html;
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
// Returns array of { tokenId, listedPrice } sorted cheapest first.
// Paginates up to `maxPages` pages (100 listings each).
async function fetchOpenSeaListings(maxPages = 5) {
  const listings = [];
  let next = null;

  for (let page = 0; page < maxPages; page++) {
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
      listings.push({ tokenId, listedPrice });
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
  // Work from cheapest upward — most likely to contain undervalued parcels
  const candidates = allListings.slice(0, 100);

  const { price: floor, isLive: floorIsLive } = await getFloorPrice();

  const results = [];
  const BATCH_SIZE = 8;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(l => getParcelTraits(l.tokenId)));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status !== 'fulfilled') continue;
      const traits = r.value;
      // No mode filter — all modes included
      const pricing = estimatePrice(traits, floor);
      const { listedPrice } = batch[j];
      const discount = (pricing.estimatedValue - listedPrice) / pricing.estimatedValue;
      if (discount >= 0.01) {
        results.push({ tokenId: traits.tokenId, traits, pricing, listedPrice, discount });
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

// GET /undervalued
// Returns the top 25 minted parcels whose OpenSea list price is furthest below
// the internal estimated value. Results are cached for 30 minutes.
// On cold cache, expect ~20–40s while traits are fetched via RPC.
app.get('/undervalued', async (req, res) => {
  try {
    const now = Date.now();
    if (undervaluedCache.data && (now - undervaluedCache.fetchedAt) < UNDERVALUED_CACHE_TTL_MS) {
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
      // S0 (Season 0) — V2 upgraded parcels with Antenna "On".
      // The Antenna trait is only present and set to "On" for parcels upgraded during Season 0.
      // (There is no on-chain Timestamp or S0 trait — the Explorer derives that display externally.)
      isS0 = attrs.some(a => a.trait_type === 'Antenna' && a.value === 'On');
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

// Animation data (grid + colors per parcel) — optional, loaded separately
let UNMINTED_ANIM_LOOKUP = new Map();
try {
  const animData = require('./unminted-animation.json');
  let fontArray = [];
  try { fontArray = require('./unminted-fonts.json'); } catch(_) {}
  UNMINTED_ANIM_LOOKUP = new Map(animData.map(p => [`${p.level}/${p.x}/${p.y}`, {
    grid: p.grid, colors: p.colors, seed: p.seed, resource: p.resource,
    chars: p.chars || {},
    fontSize: p.fontSize || 15,
    fontWeight: p.fontWeight || null,
    animClasses: p.animClasses || [],
    fontData: p.fontIndex != null ? fontArray[p.fontIndex] : null,
  }]));
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

// GET /health
app.use('/health', standardLimiter);
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /floor
app.get('/floor', async (req, res) => {
  const { price, isLive, fetchedAt } = await getFloorPrice();
  res.json({ floor: price, isLive, fetchedAt });
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
