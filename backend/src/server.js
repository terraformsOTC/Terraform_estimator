const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const { estimatePrice, detectSets, FLOOR_PRICE_ETH } = require('./pricingModel');

const app = express();

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
    // Allow requests with no origin (curl, Postman, same-origin server calls)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
}));

app.use(express.json());

// ─── RATE LIMITING ─────────────────────────────────────────────────────────────
// Standard: 60 req/min — enough for a human browsing, blocks trivial scrapers
const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

// Wallet limiter is stricter: each /wallet call can trigger 100+ RPC calls
const walletLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many wallet requests — please wait a moment.' },
});

app.use('/estimate', standardLimiter);
app.use('/image',    standardLimiter);
app.use('/wallet',   walletLimiter);
app.use('/floor',    standardLimiter);

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const RPC_URL = process.env.RPC_URL || 'https://eth.llamarpc.com';

const TERRAFORMS_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
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

// Detect special type from metadata attributes
function detectSpecialType(attributes) {
  if (!attributes) return null;

  const chroma = attributes.find(a => a.trait_type === 'Chroma')?.value;
  if (chroma === 'Plague') return 'Plague';

  const resource = attributes.find(a => a.trait_type === 'Resource')?.value || '';
  if (resource.includes('X-Seed') || resource === 'X Seed') return 'X-Seed';
  if (resource.includes('Y-Seed') || resource === 'Y Seed') return 'Y-Seed';
  if (resource.includes('Lith0')) return 'Lith0';
  if (resource.includes('Spine')) return 'Spine';

  const edition = attributes.find(a => a.trait_type === 'Edition')?.value || '';
  if (edition === '1 of 1' || edition === '1of1') return '1of1';

  return null;
}

// ─── HARDCODED SPECIAL TOKEN LOOKUP ────────────────────────────────────────────
// On-chain Resource/Edition trait names are unverified — this lookup is the
// authoritative source for X-Seed, Y-Seed, Lith0, and Spine.
// Plague is detected reliably on-chain via Chroma trait and is NOT listed here.
// Origin Daydream is detected on-chain via Mode trait and is NOT listed here.
// 1of1 IDs to be added once the full list is provided.
// Source: community-verified list provided Mar 2025.
const SPECIAL_TOKEN_LOOKUP = {
  // ── Lith0 (13) ──────────────────────────────────────────────────────────────
   413: 'Lith0',  586: 'Lith0',  658: 'Lith0', 2377: 'Lith0', 2810: 'Lith0',
  3300: 'Lith0', 4827: 'Lith0', 6293: 'Lith0', 6350: 'Lith0', 7958: 'Lith0',
  8288: 'Lith0', 9449: 'Lith0', 9746: 'Lith0',

  // ── Y-Seed (17) ─────────────────────────────────────────────────────────────
   145: 'Y-Seed', 1365: 'Y-Seed', 1855: 'Y-Seed', 2755: 'Y-Seed', 3533: 'Y-Seed',
  3584: 'Y-Seed', 3594: 'Y-Seed', 5925: 'Y-Seed', 6591: 'Y-Seed', 7586: 'Y-Seed',
  8583: 'Y-Seed', 8951: 'Y-Seed', 9015: 'Y-Seed', 9086: 'Y-Seed', 9119: 'Y-Seed',
  9417: 'Y-Seed', 9443: 'Y-Seed',

  // ── X-Seed (48) — includes OD and Godmode variants ──────────────────────────
     7: 'X-Seed',   24: 'X-Seed',   39: 'X-Seed',   41: 'X-Seed',   71: 'X-Seed',
    83: 'X-Seed',   91: 'X-Seed',  102: 'X-Seed',  114: 'X-Seed',  124: 'X-Seed',
   131: 'X-Seed',  514: 'X-Seed', 1114: 'X-Seed', 1162: 'X-Seed', 1329: 'X-Seed',
  1656: 'X-Seed', 1955: 'X-Seed', 2109: 'X-Seed', 2231: 'X-Seed', 2263: 'X-Seed',
  2681: 'X-Seed', 2752: 'X-Seed', 2894: 'X-Seed', 3028: 'X-Seed', 3264: 'X-Seed',
  3574: 'X-Seed', 3828: 'X-Seed', 3855: 'X-Seed', 3917: 'X-Seed', 4028: 'X-Seed',
  4457: 'X-Seed', 4469: 'X-Seed', 4472: 'X-Seed', 4641: 'X-Seed', 4753: 'X-Seed',
  5930: 'X-Seed', 6127: 'X-Seed', 6392: 'X-Seed', 6655: 'X-Seed', 6725: 'X-Seed',
  7047: 'X-Seed', 7054: 'X-Seed', 7104: 'X-Seed', 8057: 'X-Seed', 8726: 'X-Seed',
  8755: 'X-Seed', 8794: 'X-Seed', 9138: 'X-Seed',

  // ── Spine (68) ──────────────────────────────────────────────────────────────
    99: 'Spine',  213: 'Spine',  361: 'Spine',  652: 'Spine',  697: 'Spine',
   796: 'Spine',  867: 'Spine',  989: 'Spine', 1276: 'Spine', 1302: 'Spine',
  1755: 'Spine', 2321: 'Spine', 2547: 'Spine', 3204: 'Spine', 3452: 'Spine',
  3565: 'Spine', 3660: 'Spine', 3743: 'Spine', 3753: 'Spine', 3812: 'Spine',
  3851: 'Spine', 3852: 'Spine', 4032: 'Spine', 4165: 'Spine', 4192: 'Spine',
  4376: 'Spine', 4504: 'Spine', 4562: 'Spine', 4790: 'Spine', 4830: 'Spine',
  4911: 'Spine', 5266: 'Spine', 5268: 'Spine', 5428: 'Spine', 5473: 'Spine',
  5537: 'Spine', 5618: 'Spine', 6074: 'Spine', 6302: 'Spine', 6335: 'Spine',
  6339: 'Spine', 6468: 'Spine', 6554: 'Spine', 6565: 'Spine', 6698: 'Spine',
  6861: 'Spine', 7093: 'Spine', 7149: 'Spine', 7216: 'Spine', 7250: 'Spine',
  7278: 'Spine', 7308: 'Spine', 7399: 'Spine', 7447: 'Spine', 7508: 'Spine',
  7626: 'Spine', 7730: 'Spine', 7846: 'Spine', 7851: 'Spine', 7907: 'Spine',
  8212: 'Spine', 8287: 'Spine', 8349: 'Spine', 8404: 'Spine', 8474: 'Spine',
  9354: 'Spine', 9695: 'Spine', 9697: 'Spine',
};

// ??? value thresholds derived from sampling 500 tokens across the collection (Mar 2025)
// Distribution: min=5573, max=53993, p5=20733, p95=52564
const MYSTERY_P5  = 20733;
const MYSTERY_P95 = 52564;

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

// Parse all traits from tokenURI metadata
// Zone and Level are read from tokenURI attributes (trait_type "Zone" / "Level").
// tokenSupplementalData has a struct ABI mismatch and is not used.
async function getParcelTraits(tokenId) {
  const { contract } = getProvider();

  try {
    const uri = await contract.tokenURI(tokenId);

    let zone = null, level = null, biome = null, chroma = null, mode = null,
        specialType = null, mysteryValue = null;

    if (uri.startsWith('data:application/json;base64,')) {
      const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
      const attrs = json.attributes || [];

      zone = attrs.find(a => a.trait_type === 'Zone')?.value || null;
      level = parseInt(attrs.find(a => a.trait_type === 'Level')?.value ?? -1);
      biome = parseInt(attrs.find(a => a.trait_type === 'Biome')?.value ?? -1);
      chroma = attrs.find(a => a.trait_type === 'Chroma')?.value || 'Flow';
      mode = attrs.find(a => a.trait_type === 'Mode')?.value || 'Terrain';
      specialType = detectSpecialType(attrs) || SPECIAL_TOKEN_LOOKUP[Number(tokenId)] || null;
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
      mysteryValue,
      mysteryOutlier: mysteryOutlierFlag(mysteryValue),
    };
  } catch (err) {
    console.error(`Error fetching traits for token ${tokenId}:`, err.message);
    throw new Error(`Could not fetch traits for parcel ${tokenId}`);
  }
}

// GET /estimate/:tokenId
// GET /image/:tokenId — serves the on-chain SVG directly from tokenURI
// The SVG is base64-encoded inside the JSON image field.
// Note: parcels can change mode (terraform/daydream), so no long-term caching.
app.get('/image/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId) || tokenId < 1 || tokenId > 9911) {
      return res.status(400).send('Invalid token ID');
    }

    const { contract } = getProvider();
    const uri = await contract.tokenURI(tokenId);

    if (!uri.startsWith('data:application/json;base64,')) {
      return res.status(500).send('Unexpected tokenURI format');
    }

    const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
    const image = json.image || '';

    if (image.startsWith('data:image/svg+xml;base64,')) {
      const svg = Buffer.from(image.slice(26), 'base64');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min — mode can change
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
    res.status(500).send('Failed to load parcel image.');
  }
});

// GET /estimate/:tokenId
app.get('/estimate/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId) || tokenId < 1 || tokenId > 9911) {
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
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const { contract } = getProvider();
    const balance = await contract.balanceOf(address);
    const count = Number(balance);

    const { price: liveFloor, isLive: floorIsLive } = await getFloorPrice();

    if (count === 0) {
      return res.json({ address, parcels: [], sets: [], totalEstimatedValue: 0, floor: liveFloor, floorIsLive });
    }

    const fetchCount = Math.min(count, 100);

    const tokenIds = await Promise.all(
      Array.from({ length: fetchCount }, (_, i) => contract.tokenOfOwnerByIndex(address, i))
    );

    // Batch fetch traits with concurrency limit
    const BATCH_SIZE = 5;
    const parcels = [];
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const batch = tokenIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(id => getParcelTraits(id)));
      for (const r of results) {
        if (r.status === 'fulfilled') parcels.push(r.value);
      }
    }

    const pricedParcels = parcels.map(p => ({
      tokenId: p.tokenId,
      traits: p,
      pricing: estimatePrice(p, liveFloor),
    }));

    const sets = detectSets(parcels);

    const totalEstimatedValue = pricedParcels.reduce((sum, p) => sum + p.pricing.estimatedValue, 0);

    res.json({
      address,
      totalParcels: count,
      fetchedParcels: parcels.length,
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

// GET /floor
app.get('/floor', async (req, res) => {
  const { price, isLive, fetchedAt } = await getFloorPrice();
  res.json({ floor: price, isLive, fetchedAt });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Terraform Estimator API on port ${PORT}`));
