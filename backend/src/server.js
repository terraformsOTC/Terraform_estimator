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

app.use('/estimate', standardLimiter);
app.use('/image',    standardLimiter);
app.use('/wallet',   walletLimiter);
app.use('/floor',    standardLimiter);

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
const tokenUriCache = new Map(); // Map<tokenId, uri> — insertion order = LRU order

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
const ONE_OF_ONE_IDS = new Set([
  2, 50, 51, 59, 64, 75, 77, 87, 90, 97, 99, 102,
  125, 139, 140, 151, 154, 161, 166, 168, 172, 173, 197, 209,
  223, 235, 239, 243, 245, 248, 263, 268, 274, 301, 311, 316,
  319, 334, 336, 340, 352, 354, 377, 379, 386, 401, 436,
  437, 439, 445, 448, 463, 469, 476, 501, 508, 521, 523, 533,
  536, 547, 586, 598, 656, 668, 674, 676, 680, 684, 711,
  713, 717, 719, 746, 756, 765, 782, 794, 814, 829, 840, 856,
  867, 873, 876, 879, 881, 887, 908, 923, 929, 933, 935, 947,
  948, 952, 955, 957, 963, 969, 970, 983, 990, 996,
  1025, 1027, 1043, 1075, 1079, 1085, 1093, 1117, 1126, 1130, 1133,
  1135, 1137, 1161, 1165, 1171, 1173, 1180, 1181, 1191, 1195, 1235, 1259,
  1273, 1282, 1292, 1293, 1294, 1296, 1297, 1306, 1317, 1330, 1338,
  1341, 1345, 1361, 1367, 1368, 1370, 1371, 1374, 1381, 1392, 1397,
  1419, 1427, 1441, 1442, 1456, 1460, 1470, 1472, 1475, 1476, 1477,
  1483, 1496, 1498, 1502, 1507, 1541, 1546, 1558, 1564, 1583, 1593,
  1594, 1603, 1615, 1620, 1621, 1628, 1633, 1724,
  1755, 1759, 1780, 1787, 1795, 1802, 1804, 1822, 1824, 1834, 1845, 1870,
  1871, 1891, 1892, 1893, 1895, 1897, 1907, 1921, 1926, 1935, 1940, 1944,
  1949, 1954, 1969, 1974, 1976, 1977, 1981, 2018, 2041, 2049, 2062, 2067, 2069, 2083, 2093, 2094, 2109, 2150, 2161, 2186, 2234, 2235,
  2252, 2260, 2268, 2306, 2307, 2313, 2315, 2320, 2322, 2323, 2331, 2332,
  2345, 2350, 2360, 2372, 2378, 2398, 2399, 2402, 2406, 2412, 2423, 2426,
  2428, 2434, 2451, 2459, 2465, 2478, 2483, 2486, 2491, 2505, 2508, 2515,
  2516, 2565, 2597, 2626, 2627, 2656, 2658, 2660, 2668, 2669, 2677, 2679,
  2694, 2698, 2711, 2714, 2716, 2722, 2733, 2739, 2747, 2801,
  2824, 2829, 2834, 2844, 2851, 2871, 2906, 2911, 2918, 2952, 2957, 2986,
  2989, 2994, 2998, 3004, 3012, 3013, 3016, 3036, 3052, 3057, 3060,
  3061, 3063, 3071, 3072, 3073, 3079, 3081, 3083, 3103, 3113, 3129, 3132,
  3147, 3148, 3160, 3171, 3177, 3179, 3183, 3216, 3217, 3218, 3228,
  3236, 3252, 3260, 3277, 3288, 3289, 3290, 3295, 3296,
  3300, 3311, 3316, 3319, 3332, 3333, 3337, 3343, 3344, 3345, 3351, 3359,
  3370, 3375, 3380, 3382, 3384, 3393, 3403, 3404, 3405, 3414, 3415, 3416,
  3430, 3437, 3442, 3453, 3471, 3476, 3483, 3509, 3517, 3518,
  3521, 3526, 3528, 3542, 3554, 3557, 3562, 3565, 3576, 3583, 3586, 3590,
  3592, 3611, 3624, 3635, 3638, 3686, 3687, 3689, 3700, 3701,
  3702, 3704, 3732, 3738, 3739, 3742, 3750, 3754, 3761, 3770, 3779, 3785,
  3797, 3799, 3814, 3816, 3821, 3827, 3829, 3861, 3877, 3878, 3880,
  3884, 3892, 3897, 3898, 3908, 3919, 3931, 3939, 3951, 3959, 3969, 3984, 3986, 3993, 3994, 4000, 4003, 4011, 4022, 4029, 4030, 4035, 4043, 4052, 4062, 4064, 4065, 4068, 4070, 4073, 4075, 4085, 4094, 4096, 4099, 4102, 4113, 4114, 4117, 4118, 4119, 4133, 4150,
  4181, 4192, 4197, 4210, 4211, 4217, 4222, 4237, 4253, 4263, 4270,
  4281, 4288, 4290, 4293, 4297, 4298, 4303, 4307, 4318, 4319, 4324,
  4352, 4358, 4359, 4361, 4367, 4372, 4375, 4380, 4396, 4398, 4404, 4407,
  4410, 4412, 4415, 4418, 4433, 4437, 4438, 4439, 4441, 4443, 4462, 4478,
  4481, 4503, 4504, 4511, 4522, 4525, 4533, 4543, 4553, 4554, 4558, 4563,
  4566, 4574, 4575, 4576, 4583, 4593, 4601, 4605, 4614, 4619, 4623, 4633,
  4634, 4637, 4639, 4645, 4652, 4655, 4656, 4668, 4675, 4677, 4679, 4684,
  4685, 4689, 4692, 4695, 4699, 4709, 4724, 4732, 4745, 4755, 4758, 4764,
  4775, 4781, 4790, 4791, 4792, 4800, 4801, 4802, 4812, 4827, 4839, 4868, 4874,
  4880, 4891, 4934, 4941, 4947, 4969, 4976, 4986, 4987, 5001, 5006, 5013, 5014, 5015, 5019, 5034, 5038, 5041, 5044, 5049,
  5057, 5072, 5074, 5085, 5089, 5096, 5100, 5120, 5135, 5139, 5158, 5173,
  5179, 5182, 5195, 5197, 5200, 5202, 5204, 5205, 5211, 5212, 5213, 5216,
  5218, 5222, 5235, 5237, 5278, 5285, 5286, 5310, 5316, 5322, 5344,
  5347, 5371, 5387, 5389, 5392, 5393, 5397, 5400, 5409, 5410, 5411,
  5424, 5425, 5449, 5455, 5462, 5464, 5485, 5488, 5489, 5494, 5502, 5518,
  5525, 5531, 5532, 5543, 5559, 5566, 5574, 5575, 5577, 5580, 5587, 5599,
  5606, 5619, 5620, 5632, 5642, 5643, 5655, 5665, 5677, 5679, 5682,
  5691, 5724, 5734, 5754, 5758, 5762, 5763, 5767, 5768, 5773, 5790, 5798,
  5803, 5825, 5830, 5836, 5837, 5843, 5847, 5850, 5853, 5854, 5858, 5869,
  5872, 5875, 5876, 5880, 5881, 5885, 5917, 5924, 5932, 5941, 5943, 5944,
  5954, 5956, 5964, 5977, 5980, 6000, 6025, 6033, 6037, 6040,
  6048, 6052, 6054, 6060, 6068, 6070, 6087, 6088, 6093, 6111, 6140, 6144,
  6145, 6146, 6158, 6172, 6173, 6210, 6214, 6234, 6236, 6256,
  6268, 6279, 6282, 6299, 6302, 6307, 6311, 6315, 6323, 6332, 6335, 6336,
  6341, 6346, 6350, 6381, 6387, 6388, 6394, 6401, 6405, 6409, 6422, 6423, 6427,
  6440, 6455, 6457, 6458, 6463, 6467, 6469, 6470, 6472, 6494, 6495,
  6502, 6509, 6516, 6517, 6547, 6554, 6560, 6583, 6586, 6589, 6605,
  6608, 6611, 6613, 6617, 6619, 6626, 6628, 6638, 6642, 6657, 6659, 6661,
  6667, 6669, 6686, 6692, 6698, 6700, 6710, 6711, 6713, 6714, 6716, 6740,
  6744, 6750, 6760, 6771, 6798, 6804, 6829, 6840, 6856, 6862, 6876, 6879,
  6887, 6891, 6897, 6902, 6918, 6922, 6923, 6925, 6939, 6949, 6954, 6965, 6967, 6971, 6975, 6996, 7008, 7030, 7039, 7061, 7083, 7086, 7091,
  7095, 7098, 7107, 7108, 7121, 7125, 7127, 7135, 7137, 7139, 7151, 7153,
  7161, 7174, 7180, 7186, 7187, 7188, 7192, 7199, 7207, 7214, 7227,
  7229, 7232, 7237, 7243, 7271, 7273, 7278, 7303, 7306, 7307, 7322,
  7325, 7336, 7338, 7343, 7350, 7354, 7366, 7369, 7374, 7388, 7390, 7401,
  7404, 7428, 7429, 7432, 7434, 7441, 7443, 7446, 7471, 7472, 7476, 7484,
  7486, 7495, 7514, 7525, 7536, 7538, 7542,
  7546, 7548, 7549, 7558, 7568, 7580, 7584, 7598, 7618, 7647, 7679, 7686,
  7704, 7716, 7730, 7733, 7741, 7744, 7746, 7754, 7761, 7771, 7777,
  7794, 7799, 7804, 7805, 7825, 7828, 7831, 7834, 7872, 7879, 7892,
  7917, 7926, 7929, 7952, 7976, 7977, 7978, 7980, 7983, 7986, 7991, 7999,
  8013, 8014, 8015, 8023, 8033, 8062, 8075, 8078, 8081, 8083, 8119,
  8126, 8128, 8135, 8137, 8141, 8145, 8147, 8150, 8152, 8155, 8159, 8160,
  8164, 8165, 8172, 8183, 8185, 8190, 8197, 8202, 8203, 8208, 8216, 8218,
  8226, 8244, 8252, 8271, 8280, 8300, 8312, 8345, 8351, 8355,
  8356, 8358, 8364, 8365, 8372, 8373, 8374, 8376, 8383, 8390, 8396, 8399,
  8414, 8419, 8421, 8427, 8453, 8456, 8466, 8471, 8488, 8500,
  8510, 8527, 8529, 8533, 8535, 8538, 8555, 8567, 8571, 8575, 8584,
  8587, 8602, 8607, 8609, 8611, 8613, 8616, 8620, 8621, 8622, 8632, 8641,
  8642, 8657, 8660, 8679, 8687, 8698, 8704, 8714, 8723, 8727, 8729,
  8735, 8742, 8744, 8745, 8752, 8759, 8768, 8775, 8781, 8782, 8785, 8791,
  8809, 8812, 8813, 8817, 8822, 8824, 8828, 8829, 8831, 8843, 8847, 8851,
  8855, 8864, 8871, 8874, 8879, 8885, 8905, 8909, 8923, 8925, 8927,
  8950, 8952, 8957, 8966, 8977, 9028, 9061, 9063, 9070, 9082, 9091, 9093,
  9103, 9128, 9132, 9134, 9137, 9152, 9154, 9155, 9179, 9190, 9228, 9252,
  9263, 9265, 9267, 9269, 9270, 9280, 9295, 9306, 9312, 9314,
  9317, 9326, 9347, 9348, 9352, 9363, 9378, 9381, 9393, 9396, 9417,
  9419, 9451, 9458, 9472, 9474, 9478, 9484, 9492, 9493, 9494, 9496,
  9497, 9506, 9518, 9528, 9532, 9537, 9544, 9579, 9612, 9630, 9639,
  9644, 9646, 9651, 9669, 9680, 9694, 9695, 9712, 9715, 9735, 9740,
  9742, 9746, 9754, 9755, 9761, 9762, 9766, 9779, 9783, 9797, 9807, 9810,
  9813, 9828, 9848, 9872, 9887, 9891, 9892, 9896, 9903,
]);

// ??? value thresholds — full collection scan of 9911 tokens (Mar 2026)
// 8864 tokens have ??? trait (1047 have none).
// Distribution: min=815, p5=19918, p25=32332, p50=41052, p75=48163, p95=52953, max=53994
// low ???  : value < 20000  →  449 tokens  (5.1%)
// high ??? : value > 50000  →  1574 tokens (17.8%)
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

// Parse all traits from tokenURI metadata
// Zone and Level are read from tokenURI attributes (trait_type "Zone" / "Level").
// tokenSupplementalData has a struct ABI mismatch and is not used.
async function getParcelTraits(tokenId) {
  try {
    const uri = await getCachedTokenURI(tokenId);

    let zone = null, level = null, biome = null, chroma = null, mode = null,
        specialType = null, isOneOfOne = false, isGodmode = false, isS0 = false,
        isLith0like = false, isGm = false, mysteryValue = null, seed = null;

    if (uri.startsWith('data:application/json;base64,')) {
      const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
      const attrs = json.attributes || [];

      // Extract seed from tokenHTML (on-chain HTML animation contains `const SEED=X;`)
      // The SVG from tokenURI is static and has no SEED — tokenHTML is the correct source.
      try {
        const { contract } = getProvider();
        const html = await withTimeout(contract.tokenHTML(tokenId));
        const m = html.match(/\bSEED\s*=\s*(\d+)/);
        if (m) seed = parseInt(m[1], 10);
      } catch (_) { /* seed stays null */ }

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
        const resolved = await provider.resolveName(address);
        if (!resolved) {
          return res.status(400).json({ error: `Could not resolve ENS name: ${address}` });
        }
        address = resolved;
        console.log(`[wallet] ENS resolved: ${req.params.address} → ${address}`);
      } catch (ensErr) {
        return res.status(400).json({ error: `Invalid address or unresolvable name: ${req.params.address}` });
      }
    }

    const { contract } = getProvider();
    const balance = await withTimeout(contract.balanceOf(address));
    const count = Number(balance);

    const { price: liveFloor, isLive: floorIsLive } = await getFloorPrice();

    if (count === 0) {
      return res.json({ address, parcels: [], sets: [], totalEstimatedValue: 0, floor: liveFloor, floorIsLive });
    }

    const tokenIds = await withTimeout(
      Promise.all(Array.from({ length: count }, (_, i) => contract.tokenOfOwnerByIndex(address, i))),
      30_000, // 30s for large wallets
    );

    // Batch fetch traits for all tokens (needed for accurate set detection)
    const BATCH_SIZE = 5;
    const allParcels = [];
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const batch = tokenIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(id => getParcelTraits(id)));
      for (const r of results) {
        if (r.status === 'fulfilled') allParcels.push(r.value);
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
  const traits   = { ...parcel, isS0: false, isGodmode: false, isOneOfOne: false, isLith0like: false, isGm: false };
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
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /floor
app.get('/floor', async (req, res) => {
  const { price, isLive, fetchedAt } = await getFloorPrice();
  res.json({ floor: price, isLive, fetchedAt });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Terraform Estimator API on port ${PORT}`);
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
