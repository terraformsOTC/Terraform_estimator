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

  // ── X-Seed (48) ──────────────────────────────────────────────────────────────
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

  // ── 1of1 (1237) — unique zone/biome combination, computed from full on-chain scan ──
  // 20 tokens that are also Spine/Lith0/X-Seed/Y-Seed are stored here as their primary type
  // but are included in ONE_OF_ONE_IDS below so both traits can be shown.
  // Source: Alchemy getNFTsForCollection scan of all 9911 tokens, Mar 2025.
  2: '1of1', 50: '1of1', 51: '1of1', 59: '1of1', 64: '1of1', 75: '1of1', 77: '1of1', 87: '1of1',
  90: '1of1', 97: '1of1', 125: '1of1', 139: '1of1', 140: '1of1', 151: '1of1', 154: '1of1', 161: '1of1',
  166: '1of1', 168: '1of1', 172: '1of1', 173: '1of1', 197: '1of1', 209: '1of1', 223: '1of1', 235: '1of1',
  239: '1of1', 243: '1of1', 245: '1of1', 248: '1of1', 263: '1of1', 268: '1of1', 274: '1of1', 301: '1of1',
  311: '1of1', 316: '1of1', 319: '1of1', 334: '1of1', 336: '1of1', 340: '1of1', 352: '1of1', 354: '1of1',
  377: '1of1', 379: '1of1', 386: '1of1',
401: '1of1', 436: '1of1', 437: '1of1', 439: '1of1',
  445: '1of1', 448: '1of1', 463: '1of1', 469: '1of1', 476: '1of1', 501: '1of1', 508: '1of1', 521: '1of1',
  523: '1of1', 533: '1of1', 536: '1of1', 547: '1of1', 598: '1of1', 656: '1of1',
668: '1of1',
  674: '1of1', 676: '1of1', 680: '1of1', 684: '1of1', 711: '1of1', 713: '1of1', 717: '1of1', 719: '1of1',
  746: '1of1', 756: '1of1', 765: '1of1', 782: '1of1', 794: '1of1', 814: '1of1', 829: '1of1', 840: '1of1',
  856: '1of1', 873: '1of1', 876: '1of1', 879: '1of1', 881: '1of1', 887: '1of1', 908: '1of1', 923: '1of1',
  929: '1of1', 933: '1of1', 935: '1of1', 947: '1of1', 948: '1of1', 952: '1of1',
955: '1of1',
  957: '1of1', 963: '1of1', 969: '1of1', 970: '1of1', 983: '1of1',
990: '1of1', 996: '1of1',
  1025: '1of1', 1027: '1of1',
1043: '1of1', 1075: '1of1', 1079: '1of1', 1085: '1of1', 1093: '1of1',
  1117: '1of1', 1126: '1of1', 1130: '1of1', 1133: '1of1', 1135: '1of1', 1137: '1of1', 1161: '1of1', 1165: '1of1',
  1171: '1of1', 1173: '1of1', 1180: '1of1', 1181: '1of1', 1191: '1of1', 1195: '1of1', 1235: '1of1', 1259: '1of1',
  1273: '1of1', 1282: '1of1', 1292: '1of1', 1293: '1of1', 1294: '1of1', 1296: '1of1', 1297: '1of1',
  1306: '1of1', 1317: '1of1', 1330: '1of1', 1338: '1of1', 1341: '1of1', 1345: '1of1',
1361: '1of1',
  1367: '1of1', 1368: '1of1', 1370: '1of1', 1371: '1of1', 1374: '1of1', 1381: '1of1', 1392: '1of1',
  1419: '1of1', 1427: '1of1', 1441: '1of1', 1442: '1of1',
1456: '1of1', 1460: '1of1', 1470: '1of1',
  1472: '1of1', 1475: '1of1', 1476: '1of1', 1477: '1of1', 1483: '1of1', 1496: '1of1', 1498: '1of1', 1502: '1of1',
  1507: '1of1',
1541: '1of1', 1546: '1of1', 1558: '1of1', 1564: '1of1', 1583: '1of1', 1593: '1of1',
  1594: '1of1',
1603: '1of1', 1615: '1of1', 1620: '1of1', 1621: '1of1', 1628: '1of1', 1633: '1of1',

1724: '1of1', 1759: '1of1', 1780: '1of1', 1787: '1of1', 1795: '1of1',
  1802: '1of1', 1804: '1of1', 1822: '1of1', 1824: '1of1', 1834: '1of1', 1845: '1of1', 1870: '1of1', 1871: '1of1',
  1891: '1of1', 1892: '1of1', 1893: '1of1', 1895: '1of1', 1897: '1of1', 1907: '1of1', 1921: '1of1', 1926: '1of1',
  1935: '1of1', 1940: '1of1', 1944: '1of1', 1949: '1of1',
1969: '1of1', 1974: '1of1', 1976: '1of1',
  1977: '1of1', 1981: '1of1',
2018: '1of1', 2041: '1of1', 2049: '1of1',
2062: '1of1',
  2067: '1of1', 2069: '1of1', 2083: '1of1', 2093: '1of1', 2094: '1of1', 2150: '1of1', 2161: '1of1', 2186: '1of1',
  2234: '1of1', 2235: '1of1', 2252: '1of1', 2260: '1of1', 2268: '1of1', 2306: '1of1', 2307: '1of1', 2313: '1of1',
  2315: '1of1', 2320: '1of1', 2322: '1of1', 2323: '1of1', 2331: '1of1', 2332: '1of1', 2345: '1of1', 2350: '1of1',
  2360: '1of1', 2372: '1of1', 2378: '1of1', 2398: '1of1', 2399: '1of1', 2402: '1of1', 2406: '1of1', 2412: '1of1',
  2423: '1of1', 2426: '1of1', 2428: '1of1', 2434: '1of1', 2451: '1of1', 2459: '1of1', 2465: '1of1', 2478: '1of1',
  2483: '1of1', 2486: '1of1', 2491: '1of1', 2505: '1of1', 2508: '1of1', 2515: '1of1', 2516: '1of1', 2565: '1of1',
  2597: '1of1', 2626: '1of1', 2627: '1of1', 2656: '1of1', 2658: '1of1', 2660: '1of1', 2668: '1of1', 2669: '1of1',
  2677: '1of1', 2679: '1of1', 2694: '1of1', 2698: '1of1', 2711: '1of1', 2714: '1of1', 2716: '1of1', 2722: '1of1',
  2733: '1of1', 2739: '1of1', 2747: '1of1',

2801: '1of1', 2824: '1of1', 2829: '1of1',
  2834: '1of1', 2844: '1of1', 2851: '1of1', 2871: '1of1', 2906: '1of1', 2911: '1of1', 2918: '1of1', 2952: '1of1',
  2957: '1of1', 2986: '1of1', 2989: '1of1', 2994: '1of1',
2998: '1of1', 3004: '1of1', 3012: '1of1',
  3013: '1of1', 3016: '1of1', 3036: '1of1', 3052: '1of1', 3057: '1of1', 3060: '1of1', 3061: '1of1', 3063: '1of1',
  3071: '1of1', 3072: '1of1', 3073: '1of1', 3079: '1of1', 3081: '1of1', 3083: '1of1', 3103: '1of1', 3113: '1of1',
  3129: '1of1', 3132: '1of1', 3147: '1of1', 3148: '1of1', 3160: '1of1', 3171: '1of1', 3177: '1of1', 3179: '1of1',
  3183: '1of1',
3216: '1of1', 3217: '1of1', 3218: '1of1', 3228: '1of1', 3236: '1of1', 3252: '1of1',
  3260: '1of1',

3277: '1of1',
3288: '1of1', 3289: '1of1', 3290: '1of1',
  3295: '1of1', 3296: '1of1', 3311: '1of1', 3316: '1of1', 3319: '1of1', 3332: '1of1', 3333: '1of1', 3337: '1of1',
  3343: '1of1', 3344: '1of1', 3345: '1of1', 3351: '1of1', 3359: '1of1', 3370: '1of1', 3375: '1of1', 3380: '1of1',
  3382: '1of1', 3384: '1of1', 3393: '1of1', 3403: '1of1', 3404: '1of1', 3405: '1of1', 3414: '1of1', 3415: '1of1',
  3416: '1of1', 3430: '1of1', 3437: '1of1', 3442: '1of1', 3453: '1of1',

3471: '1of1',
  3476: '1of1', 3483: '1of1', 3509: '1of1', 3517: '1of1', 3518: '1of1', 3521: '1of1', 3526: '1of1', 3528: '1of1',
  3542: '1of1', 3554: '1of1', 3557: '1of1', 3562: '1of1', 3576: '1of1', 3583: '1of1', 3586: '1of1', 3590: '1of1',
  3592: '1of1', 3611: '1of1', 3624: '1of1', 3635: '1of1', 3638: '1of1',

3686: '1of1',
  3687: '1of1', 3689: '1of1', 3700: '1of1', 3701: '1of1', 3702: '1of1', 3704: '1of1', 3732: '1of1', 3738: '1of1',
  3739: '1of1', 3742: '1of1', 3750: '1of1', 3754: '1of1', 3761: '1of1', 3770: '1of1', 3779: '1of1', 3785: '1of1',
  3797: '1of1', 3799: '1of1', 3814: '1of1', 3816: '1of1', 3821: '1of1', 3827: '1of1', 3829: '1of1',
  3861: '1of1', 3877: '1of1', 3878: '1of1', 3880: '1of1', 3884: '1of1', 3892: '1of1', 3897: '1of1', 3898: '1of1',
  3908: '1of1', 3919: '1of1', 3931: '1of1', 3939: '1of1',
3951: '1of1', 3959: '1of1',
  3969: '1of1', 3984: '1of1', 3986: '1of1', 3993: '1of1', 3994: '1of1', 4000: '1of1', 4003: '1of1', 4011: '1of1',
  4022: '1of1', 4029: '1of1', 4030: '1of1',
4035: '1of1', 4043: '1of1', 4052: '1of1', 4062: '1of1',
  4064: '1of1', 4065: '1of1', 4068: '1of1', 4070: '1of1', 4073: '1of1', 4075: '1of1',

  4085: '1of1', 4094: '1of1', 4096: '1of1', 4099: '1of1', 4102: '1of1', 4113: '1of1', 4114: '1of1', 4117: '1of1',
  4118: '1of1', 4119: '1of1', 4133: '1of1', 4150: '1of1',
4181: '1of1', 4197: '1of1', 4210: '1of1',
  4211: '1of1', 4217: '1of1', 4222: '1of1', 4237: '1of1', 4253: '1of1', 4263: '1of1', 4270: '1of1', 4281: '1of1',
  4288: '1of1', 4290: '1of1', 4293: '1of1', 4297: '1of1', 4298: '1of1', 4303: '1of1', 4307: '1of1', 4318: '1of1',
  4319: '1of1',
4324: '1of1', 4352: '1of1', 4358: '1of1', 4359: '1of1', 4361: '1of1', 4367: '1of1',
  4372: '1of1', 4375: '1of1', 4380: '1of1', 4396: '1of1', 4398: '1of1', 4404: '1of1', 4407: '1of1', 4410: '1of1',
  4412: '1of1', 4415: '1of1', 4418: '1of1', 4433: '1of1', 4437: '1of1', 4438: '1of1', 4439: '1of1', 4441: '1of1',
  4443: '1of1', 4462: '1of1', 4478: '1of1', 4481: '1of1', 4503: '1of1', 4511: '1of1', 4522: '1of1', 4525: '1of1',
  4533: '1of1', 4543: '1of1', 4553: '1of1', 4554: '1of1', 4558: '1of1', 4563: '1of1', 4566: '1of1', 4574: '1of1',
  4575: '1of1', 4576: '1of1', 4583: '1of1', 4593: '1of1', 4601: '1of1', 4605: '1of1', 4614: '1of1', 4619: '1of1',
  4623: '1of1', 4633: '1of1', 4634: '1of1', 4637: '1of1', 4639: '1of1', 4645: '1of1', 4652: '1of1', 4655: '1of1',
  4656: '1of1', 4668: '1of1', 4675: '1of1', 4677: '1of1', 4679: '1of1', 4684: '1of1', 4685: '1of1', 4689: '1of1',
  4692: '1of1', 4695: '1of1', 4699: '1of1', 4709: '1of1', 4724: '1of1', 4732: '1of1', 4745: '1of1', 4755: '1of1',
  4758: '1of1', 4764: '1of1', 4775: '1of1', 4781: '1of1', 4791: '1of1', 4792: '1of1', 4800: '1of1', 4801: '1of1',
  4802: '1of1', 4812: '1of1', 4839: '1of1', 4868: '1of1', 4874: '1of1', 4880: '1of1',
4891: '1of1',
  4934: '1of1', 4941: '1of1',
4947: '1of1', 4969: '1of1', 4976: '1of1', 4986: '1of1', 4987: '1of1',
5001: '1of1', 5006: '1of1', 5013: '1of1', 5014: '1of1', 5015: '1of1', 5019: '1of1',
  5034: '1of1', 5038: '1of1', 5041: '1of1', 5044: '1of1', 5049: '1of1', 5057: '1of1', 5072: '1of1', 5074: '1of1',
  5085: '1of1', 5089: '1of1', 5096: '1of1', 5100: '1of1', 5120: '1of1', 5135: '1of1', 5139: '1of1', 5158: '1of1',
  5173: '1of1', 5179: '1of1', 5182: '1of1', 5195: '1of1', 5197: '1of1', 5200: '1of1', 5202: '1of1', 5204: '1of1',
  5205: '1of1', 5211: '1of1', 5212: '1of1', 5213: '1of1', 5216: '1of1', 5218: '1of1', 5222: '1of1', 5235: '1of1',
  5237: '1of1',
5278: '1of1', 5285: '1of1', 5286: '1of1', 5310: '1of1', 5316: '1of1', 5322: '1of1',
  5344: '1of1', 5347: '1of1', 5371: '1of1', 5387: '1of1', 5389: '1of1', 5392: '1of1', 5393: '1of1',
5400: '1of1', 5409: '1of1', 5410: '1of1', 5411: '1of1', 5424: '1of1', 5425: '1of1', 5449: '1of1',
  5455: '1of1', 5462: '1of1', 5464: '1of1', 5485: '1of1', 5488: '1of1', 5489: '1of1', 5494: '1of1', 5502: '1of1',
  5518: '1of1', 5525: '1of1', 5531: '1of1', 5532: '1of1', 5543: '1of1', 5559: '1of1', 5566: '1of1', 5574: '1of1',
  5575: '1of1', 5577: '1of1', 5580: '1of1', 5587: '1of1', 5599: '1of1', 5606: '1of1', 5619: '1of1', 5620: '1of1',
  5632: '1of1', 5642: '1of1', 5643: '1of1',
5655: '1of1', 5665: '1of1', 5677: '1of1', 5679: '1of1',
  5682: '1of1', 5691: '1of1', 5724: '1of1', 5734: '1of1', 5754: '1of1', 5758: '1of1', 5762: '1of1', 5763: '1of1',
  5767: '1of1', 5768: '1of1', 5773: '1of1', 5790: '1of1', 5798: '1of1', 5803: '1of1', 5825: '1of1', 5830: '1of1',
  5836: '1of1', 5837: '1of1', 5843: '1of1', 5847: '1of1', 5850: '1of1', 5853: '1of1', 5854: '1of1', 5858: '1of1',
  5869: '1of1', 5872: '1of1', 5875: '1of1', 5876: '1of1', 5880: '1of1', 5881: '1of1', 5885: '1of1', 5917: '1of1',
  5924: '1of1', 5932: '1of1', 5941: '1of1', 5943: '1of1', 5944: '1of1',
5956: '1of1',
  5964: '1of1', 5977: '1of1', 5980: '1of1', 6000: '1of1', 6025: '1of1', 6033: '1of1', 6037: '1of1',
  6040: '1of1', 6048: '1of1', 6052: '1of1', 6054: '1of1', 6060: '1of1', 6068: '1of1', 6070: '1of1', 6087: '1of1',
  6088: '1of1', 6093: '1of1', 6111: '1of1', 6140: '1of1', 6144: '1of1', 6145: '1of1', 6146: '1of1', 6158: '1of1',
  6172: '1of1', 6173: '1of1',

6210: '1of1', 6214: '1of1', 6234: '1of1', 6236: '1of1',
  6256: '1of1', 6268: '1of1', 6279: '1of1', 6282: '1of1', 6299: '1of1', 6307: '1of1', 6311: '1of1', 6315: '1of1',
  6323: '1of1', 6332: '1of1', 6336: '1of1', 6341: '1of1', 6346: '1of1', 6381: '1of1', 6387: '1of1', 6388: '1of1',
  6394: '1of1', 6401: '1of1', 6405: '1of1', 6409: '1of1', 6422: '1of1', 6423: '1of1', 6427: '1of1',
  6440: '1of1', 6455: '1of1', 6457: '1of1', 6458: '1of1', 6463: '1of1', 6467: '1of1', 6469: '1of1', 6470: '1of1',
  6472: '1of1', 6494: '1of1', 6495: '1of1', 6502: '1of1', 6509: '1of1', 6516: '1of1', 6517: '1of1',
  6547: '1of1', 6560: '1of1', 6583: '1of1', 6586: '1of1', 6589: '1of1', 6605: '1of1', 6608: '1of1', 6611: '1of1',
  6613: '1of1', 6617: '1of1', 6619: '1of1', 6626: '1of1', 6628: '1of1', 6638: '1of1', 6642: '1of1', 6657: '1of1',
  6659: '1of1',
6667: '1of1', 6669: '1of1', 6686: '1of1', 6692: '1of1', 6700: '1of1', 6710: '1of1',
  6711: '1of1', 6713: '1of1', 6714: '1of1', 6716: '1of1', 6740: '1of1', 6744: '1of1', 6750: '1of1', 6760: '1of1',
  6771: '1of1', 6798: '1of1', 6804: '1of1', 6829: '1of1', 6840: '1of1', 6856: '1of1', 6862: '1of1', 6876: '1of1',
  6879: '1of1', 6887: '1of1', 6891: '1of1', 6897: '1of1', 6902: '1of1', 6918: '1of1', 6922: '1of1', 6923: '1of1',
  6925: '1of1', 6939: '1of1', 6949: '1of1',

6965: '1of1', 6967: '1of1', 6971: '1of1',
  6975: '1of1', 6996: '1of1', 7008: '1of1', 7030: '1of1', 7039: '1of1', 7061: '1of1', 7083: '1of1', 7086: '1of1',
  7091: '1of1', 7095: '1of1', 7098: '1of1', 7107: '1of1', 7108: '1of1', 7121: '1of1', 7125: '1of1', 7127: '1of1',
  7135: '1of1', 7137: '1of1', 7139: '1of1', 7151: '1of1', 7153: '1of1', 7161: '1of1', 7174: '1of1', 7180: '1of1',
  7186: '1of1', 7187: '1of1', 7188: '1of1', 7192: '1of1', 7199: '1of1', 7207: '1of1',
7214: '1of1',
  7227: '1of1', 7229: '1of1', 7232: '1of1', 7237: '1of1', 7243: '1of1', 7271: '1of1', 7273: '1of1', 7303: '1of1',

7306: '1of1', 7307: '1of1', 7322: '1of1', 7325: '1of1', 7336: '1of1', 7338: '1of1', 7343: '1of1',
  7350: '1of1', 7354: '1of1', 7366: '1of1', 7369: '1of1', 7374: '1of1', 7388: '1of1', 7390: '1of1', 7401: '1of1',
  7404: '1of1', 7428: '1of1', 7429: '1of1', 7432: '1of1', 7434: '1of1', 7441: '1of1', 7443: '1of1', 7446: '1of1',
  7471: '1of1', 7472: '1of1', 7476: '1of1', 7484: '1of1', 7486: '1of1',
7495: '1of1',
  7514: '1of1',
7525: '1of1',

7536: '1of1', 7538: '1of1', 7542: '1of1',
  7546: '1of1', 7548: '1of1', 7549: '1of1', 7558: '1of1', 7568: '1of1', 7580: '1of1', 7584: '1of1', 7598: '1of1',
  7618: '1of1', 7647: '1of1', 7679: '1of1', 7686: '1of1', 7704: '1of1', 7716: '1of1', 7733: '1of1', 7741: '1of1',
  7744: '1of1', 7746: '1of1', 7754: '1of1', 7761: '1of1', 7771: '1of1',
7777: '1of1', 7794: '1of1',
  7799: '1of1', 7804: '1of1', 7805: '1of1',
7825: '1of1', 7828: '1of1', 7831: '1of1', 7834: '1of1',
  7872: '1of1', 7879: '1of1', 7892: '1of1', 7917: '1of1', 7926: '1of1', 7929: '1of1', 7952: '1of1', 7976: '1of1',
  7977: '1of1', 7978: '1of1', 7980: '1of1', 7983: '1of1', 7986: '1of1', 7991: '1of1', 7999: '1of1', 8013: '1of1',
  8014: '1of1', 8015: '1of1', 8023: '1of1', 8033: '1of1', 8062: '1of1', 8075: '1of1', 8078: '1of1',
  8081: '1of1', 8083: '1of1', 8119: '1of1', 8126: '1of1', 8128: '1of1', 8135: '1of1', 8137: '1of1', 8141: '1of1',
  8145: '1of1', 8147: '1of1', 8150: '1of1', 8152: '1of1', 8155: '1of1', 8159: '1of1', 8160: '1of1', 8164: '1of1',
  8165: '1of1', 8172: '1of1', 8183: '1of1', 8185: '1of1', 8190: '1of1', 8197: '1of1', 8202: '1of1', 8203: '1of1',
  8208: '1of1', 8216: '1of1', 8218: '1of1', 8226: '1of1',
8244: '1of1', 8252: '1of1', 8271: '1of1',
  8280: '1of1', 8300: '1of1',
8312: '1of1', 8345: '1of1', 8351: '1of1', 8355: '1of1', 8356: '1of1',
  8358: '1of1', 8364: '1of1', 8365: '1of1', 8372: '1of1', 8373: '1of1', 8374: '1of1', 8376: '1of1', 8383: '1of1',
  8390: '1of1', 8396: '1of1', 8399: '1of1', 8414: '1of1', 8419: '1of1', 8421: '1of1',
8427: '1of1',

8453: '1of1', 8456: '1of1', 8466: '1of1', 8471: '1of1', 8488: '1of1', 8500: '1of1', 8510: '1of1',
  8527: '1of1', 8529: '1of1', 8533: '1of1', 8535: '1of1', 8538: '1of1',
8555: '1of1', 8567: '1of1',
  8571: '1of1', 8575: '1of1', 8584: '1of1', 8587: '1of1', 8602: '1of1', 8607: '1of1', 8609: '1of1', 8611: '1of1',
  8613: '1of1', 8616: '1of1', 8620: '1of1', 8621: '1of1', 8622: '1of1', 8632: '1of1', 8641: '1of1', 8642: '1of1',
  8657: '1of1', 8660: '1of1', 8679: '1of1', 8687: '1of1',
8698: '1of1', 8704: '1of1', 8714: '1of1',
  8723: '1of1', 8727: '1of1', 8729: '1of1', 8735: '1of1', 8742: '1of1', 8744: '1of1', 8745: '1of1', 8752: '1of1',
  8759: '1of1', 8768: '1of1', 8775: '1of1', 8781: '1of1', 8782: '1of1', 8785: '1of1', 8791: '1of1', 8809: '1of1',
  8812: '1of1', 8813: '1of1', 8817: '1of1', 8822: '1of1', 8824: '1of1', 8828: '1of1', 8829: '1of1', 8831: '1of1',
  8843: '1of1', 8847: '1of1', 8851: '1of1', 8855: '1of1', 8864: '1of1', 8871: '1of1', 8874: '1of1', 8879: '1of1',
  8885: '1of1', 8905: '1of1',
8909: '1of1', 8923: '1of1', 8925: '1of1', 8927: '1of1', 8950: '1of1',
  8952: '1of1', 8957: '1of1', 8966: '1of1', 8977: '1of1', 9028: '1of1', 9061: '1of1', 9063: '1of1', 9070: '1of1',
  9082: '1of1', 9091: '1of1', 9093: '1of1', 9103: '1of1', 9128: '1of1', 9132: '1of1', 9134: '1of1', 9137: '1of1',
  9152: '1of1', 9154: '1of1', 9155: '1of1', 9179: '1of1', 9190: '1of1', 9228: '1of1', 9252: '1of1',
  9263: '1of1', 9265: '1of1', 9267: '1of1', 9269: '1of1', 9270: '1of1', 9280: '1of1', 9295: '1of1',
  9306: '1of1', 9312: '1of1', 9314: '1of1', 9317: '1of1',
9326: '1of1', 9347: '1of1', 9348: '1of1',
  9352: '1of1', 9363: '1of1', 9378: '1of1', 9381: '1of1', 9393: '1of1', 9396: '1of1', 9419: '1of1', 9451: '1of1',
  9458: '1of1',
9472: '1of1', 9474: '1of1', 9478: '1of1', 9484: '1of1', 9492: '1of1', 9493: '1of1',
  9494: '1of1', 9496: '1of1', 9497: '1of1',
9506: '1of1', 9518: '1of1', 9528: '1of1', 9532: '1of1',
  9537: '1of1', 9544: '1of1', 9579: '1of1', 9612: '1of1', 9630: '1of1', 9639: '1of1', 9644: '1of1', 9646: '1of1',
  9651: '1of1', 9669: '1of1', 9680: '1of1', 9694: '1of1', 9712: '1of1', 9715: '1of1',
9735: '1of1',
  9740: '1of1', 9742: '1of1', 9754: '1of1', 9755: '1of1', 9761: '1of1', 9762: '1of1', 9766: '1of1', 9779: '1of1',
  9783: '1of1', 9797: '1of1', 9807: '1of1', 9810: '1of1', 9813: '1of1', 9828: '1of1', 9848: '1of1', 9872: '1of1',
  9887: '1of1', 9891: '1of1', 9892: '1of1', 9896: '1of1', 9903: '1of1',
};

// ─── ONE-OF-ONE SET ───────────────────────────────────────────────────────────
// 1186 tokens with a confirmed-unique zone/biome combination across all 9911 minted parcels.
// Methodology: full on-chain tokenURI scan of all tokens (Mar 2026) — NOT Alchemy metadata
// (Alchemy returns empty attributes for all Terraforms tokens and cannot be used for this).
// ─── GODMODE SET ─────────────────────────────────────────────────────────────
// X-Seed + Origin Daydream — the rarest combination (3 tokens).
// These remain specialType='X-Seed' in the lookup but get a 45x pricing override
// and show an additional Godmode badge alongside the X-Seed and Origin Daydream badges.
const GODMODE_IDS = new Set([83, 124, 1955]);

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
  4775, 4781, 4790, 4791, 4792, 4800, 4801, 4802, 4812, 4839, 4868, 4874,
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
  6341, 6346, 6381, 6387, 6388, 6394, 6401, 6405, 6409, 6422, 6423, 6427,
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
  const { contract } = getProvider();

  try {
    const uri = await contract.tokenURI(tokenId);

    let zone = null, level = null, biome = null, chroma = null, mode = null,
        specialType = null, isOneOfOne = false, isGodmode = false, mysteryValue = null;

    if (uri.startsWith('data:application/json;base64,')) {
      const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
      const attrs = json.attributes || [];

      zone = attrs.find(a => a.trait_type === 'Zone')?.value || null;
      level = parseInt(attrs.find(a => a.trait_type === 'Level')?.value ?? -1, 10);
      biome = parseInt(attrs.find(a => a.trait_type === 'Biome')?.value ?? -1, 10);
      if (level === -1) console.warn(`[traits] Token ${tokenId}: missing Level attribute`);
      if (biome === -1) console.warn(`[traits] Token ${tokenId}: missing Biome attribute`);
      chroma = attrs.find(a => a.trait_type === 'Chroma')?.value || 'Flow';
      mode = attrs.find(a => a.trait_type === 'Mode')?.value || 'Terrain';
      specialType = detectSpecialType(attrs) || SPECIAL_TOKEN_LOOKUP[Number(tokenId)] || null;
      isOneOfOne = ONE_OF_ONE_IDS.has(Number(tokenId));
      isGodmode  = GODMODE_IDS.has(Number(tokenId));
      // '???' trait — a large integer present on ~89% of tokens (purpose unknown, value locked on-chain).
      // Not used in pricing: its distribution is collection-wide and doesn't correlate with rarity.
      // Surfaced as a high/low outlier flag only — see MYSTERY_P5 / MYSTERY_P95 thresholds below.
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
    if (!/^\d+$/.test(req.params.tokenId)) return res.status(400).send('Invalid token ID');
    const tokenId = parseInt(req.params.tokenId, 10);
    if (tokenId < 1 || tokenId > 9911) {
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
    // Return a Mathcastles-style pixel art fallback so the UI always has something to show
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 277 400" width="277" height="400"><rect width="277" height="400" fill="#1a1918"/><g fill="#f97316"><rect x="94" y="57" width="11" height="11"/><rect x="105" y="57" width="11" height="11"/><rect x="116" y="57" width="11" height="11"/><rect x="127" y="57" width="11" height="11"/><rect x="138" y="57" width="11" height="11"/><rect x="149" y="57" width="11" height="11"/><rect x="72" y="68" width="11" height="11"/><rect x="83" y="68" width="11" height="11"/><rect x="94" y="68" width="11" height="11"/><rect x="105" y="68" width="11" height="11"/><rect x="116" y="68" width="11" height="11"/><rect x="127" y="68" width="11" height="11"/><rect x="138" y="68" width="11" height="11"/><rect x="149" y="68" width="11" height="11"/><rect x="160" y="68" width="11" height="11"/><rect x="171" y="68" width="11" height="11"/><rect x="182" y="68" width="11" height="11"/><rect x="193" y="68" width="11" height="11"/><rect x="61" y="79" width="11" height="11"/><rect x="72" y="79" width="11" height="11"/><rect x="83" y="79" width="11" height="11"/><rect x="105" y="79" width="11" height="11"/><rect x="138" y="79" width="11" height="11"/><rect x="149" y="79" width="11" height="11"/><rect x="160" y="79" width="11" height="11"/><rect x="50" y="90" width="11" height="11"/><rect x="61" y="90" width="11" height="11"/><rect x="72" y="90" width="11" height="11"/><rect x="83" y="90" width="11" height="11"/><rect x="94" y="90" width="11" height="11"/><rect x="105" y="90" width="11" height="11"/><rect x="127" y="90" width="11" height="11"/><rect x="149" y="90" width="11" height="11"/><rect x="160" y="90" width="11" height="11"/><rect x="171" y="90" width="11" height="11"/><rect x="182" y="90" width="11" height="11"/><rect x="50" y="101" width="11" height="11"/><rect x="61" y="101" width="11" height="11"/><rect x="83" y="101" width="11" height="11"/><rect x="105" y="101" width="11" height="11"/><rect x="127" y="101" width="11" height="11"/><rect x="149" y="101" width="11" height="11"/><rect x="160" y="101" width="11" height="11"/><rect x="182" y="101" width="11" height="11"/><rect x="193" y="101" width="11" height="11"/><rect x="50" y="112" width="11" height="11"/><rect x="61" y="112" width="11" height="11"/><rect x="83" y="112" width="11" height="11"/><rect x="105" y="112" width="11" height="11"/><rect x="127" y="112" width="11" height="11"/><rect x="149" y="112" width="11" height="11"/><rect x="160" y="112" width="11" height="11"/><rect x="182" y="112" width="11" height="11"/><rect x="193" y="112" width="11" height="11"/><rect x="50" y="123" width="11" height="11"/><rect x="61" y="123" width="11" height="11"/><rect x="72" y="123" width="11" height="11"/><rect x="83" y="123" width="11" height="11"/><rect x="149" y="123" width="11" height="11"/><rect x="160" y="123" width="11" height="11"/><rect x="171" y="123" width="11" height="11"/><rect x="182" y="123" width="11" height="11"/><rect x="61" y="134" width="11" height="11"/><rect x="72" y="134" width="11" height="11"/><rect x="83" y="134" width="11" height="11"/><rect x="94" y="134" width="11" height="11"/><rect x="116" y="134" width="11" height="11"/><rect x="127" y="134" width="11" height="11"/><rect x="138" y="134" width="11" height="11"/><rect x="149" y="134" width="11" height="11"/><rect x="160" y="134" width="11" height="11"/><rect x="171" y="134" width="11" height="11"/><rect x="61" y="145" width="11" height="11"/><rect x="72" y="145" width="11" height="11"/><rect x="83" y="145" width="11" height="11"/><rect x="94" y="145" width="11" height="11"/><rect x="105" y="145" width="11" height="11"/><rect x="116" y="145" width="11" height="11"/><rect x="127" y="145" width="11" height="11"/><rect x="138" y="145" width="11" height="11"/><rect x="149" y="145" width="11" height="11"/><rect x="160" y="145" width="11" height="11"/><rect x="171" y="145" width="11" height="11"/><rect x="172" y="145" width="11" height="11"/><rect x="50" y="156" width="11" height="11"/><rect x="61" y="156" width="11" height="11"/><rect x="72" y="156" width="11" height="11"/><rect x="83" y="156" width="11" height="11"/><rect x="94" y="156" width="11" height="11"/><rect x="105" y="156" width="11" height="11"/><rect x="116" y="156" width="11" height="11"/><rect x="127" y="156" width="11" height="11"/><rect x="138" y="156" width="11" height="11"/><rect x="149" y="156" width="11" height="11"/><rect x="160" y="156" width="11" height="11"/><rect x="171" y="156" width="11" height="11"/><rect x="182" y="156" width="11" height="11"/><rect x="193" y="156" width="11" height="11"/><rect x="39" y="167" width="11" height="11"/><rect x="50" y="167" width="11" height="11"/><rect x="61" y="167" width="11" height="11"/><rect x="72" y="167" width="11" height="11"/><rect x="83" y="167" width="11" height="11"/><rect x="94" y="167" width="11" height="11"/><rect x="105" y="167" width="11" height="11"/><rect x="116" y="167" width="11" height="11"/><rect x="127" y="167" width="11" height="11"/><rect x="138" y="167" width="11" height="11"/><rect x="149" y="167" width="11" height="11"/><rect x="160" y="167" width="11" height="11"/><rect x="171" y="167" width="11" height="11"/><rect x="182" y="167" width="11" height="11"/><rect x="193" y="167" width="11" height="11"/><rect x="204" y="167" width="11" height="11"/><rect x="28" y="178" width="11" height="11"/><rect x="39" y="178" width="11" height="11"/><rect x="50" y="178" width="11" height="11"/><rect x="61" y="178" width="11" height="11"/><rect x="72" y="178" width="11" height="11"/><rect x="83" y="178" width="11" height="11"/><rect x="94" y="178" width="11" height="11"/><rect x="116" y="178" width="11" height="11"/><rect x="127" y="178" width="11" height="11"/><rect x="149" y="178" width="11" height="11"/><rect x="160" y="178" width="11" height="11"/><rect x="171" y="178" width="11" height="11"/><rect x="182" y="178" width="11" height="11"/><rect x="193" y="178" width="11" height="11"/><rect x="204" y="178" width="11" height="11"/><rect x="215" y="178" width="11" height="11"/><rect x="226" y="178" width="11" height="11"/><rect x="237" y="178" width="11" height="11"/><rect x="28" y="189" width="11" height="11"/><rect x="39" y="189" width="11" height="11"/><rect x="50" y="189" width="11" height="11"/><rect x="61" y="189" width="11" height="11"/><rect x="83" y="189" width="11" height="11"/><rect x="94" y="189" width="11" height="11"/><rect x="105" y="189" width="11" height="11"/><rect x="116" y="189" width="11" height="11"/><rect x="127" y="189" width="11" height="11"/><rect x="138" y="189" width="11" height="11"/><rect x="149" y="189" width="11" height="11"/><rect x="160" y="189" width="11" height="11"/><rect x="171" y="189" width="11" height="11"/><rect x="193" y="189" width="11" height="11"/><rect x="204" y="189" width="11" height="11"/><rect x="215" y="189" width="11" height="11"/><rect x="226" y="189" width="11" height="11"/><rect x="237" y="189" width="11" height="11"/><rect x="28" y="200" width="11" height="11"/><rect x="39" y="200" width="11" height="11"/><rect x="50" y="200" width="11" height="11"/><rect x="61" y="200" width="11" height="11"/><rect x="72" y="200" width="11" height="11"/><rect x="83" y="200" width="11" height="11"/><rect x="94" y="200" width="11" height="11"/><rect x="116" y="200" width="11" height="11"/><rect x="127" y="200" width="11" height="11"/><rect x="149" y="200" width="11" height="11"/><rect x="160" y="200" width="11" height="11"/><rect x="171" y="200" width="11" height="11"/><rect x="182" y="200" width="11" height="11"/><rect x="193" y="200" width="11" height="11"/><rect x="204" y="200" width="11" height="11"/><rect x="215" y="200" width="11" height="11"/><rect x="226" y="200" width="11" height="11"/><rect x="237" y="200" width="11" height="11"/><rect x="39" y="211" width="11" height="11"/><rect x="50" y="211" width="11" height="11"/><rect x="61" y="211" width="11" height="11"/><rect x="72" y="211" width="11" height="11"/><rect x="83" y="211" width="11" height="11"/><rect x="94" y="211" width="11" height="11"/><rect x="105" y="211" width="11" height="11"/><rect x="116" y="211" width="11" height="11"/><rect x="127" y="211" width="11" height="11"/><rect x="138" y="211" width="11" height="11"/><rect x="149" y="211" width="11" height="11"/><rect x="160" y="211" width="11" height="11"/><rect x="171" y="211" width="11" height="11"/><rect x="182" y="211" width="11" height="11"/><rect x="193" y="211" width="11" height="11"/><rect x="204" y="211" width="11" height="11"/><rect x="50" y="222" width="11" height="11"/><rect x="61" y="222" width="11" height="11"/><rect x="72" y="222" width="11" height="11"/><rect x="83" y="222" width="11" height="11"/><rect x="94" y="222" width="11" height="11"/><rect x="105" y="222" width="11" height="11"/><rect x="116" y="222" width="11" height="11"/><rect x="127" y="222" width="11" height="11"/><rect x="138" y="222" width="11" height="11"/><rect x="149" y="222" width="11" height="11"/><rect x="160" y="222" width="11" height="11"/><rect x="171" y="222" width="11" height="11"/><rect x="182" y="222" width="11" height="11"/><rect x="61" y="233" width="11" height="11"/><rect x="72" y="233" width="11" height="11"/><rect x="83" y="233" width="11" height="11"/><rect x="94" y="233" width="11" height="11"/><rect x="105" y="233" width="11" height="11"/><rect x="116" y="233" width="11" height="11"/><rect x="127" y="233" width="11" height="11"/><rect x="138" y="233" width="11" height="11"/><rect x="149" y="233" width="11" height="11"/><rect x="160" y="233" width="11" height="11"/><rect x="72" y="244" width="11" height="11"/><rect x="83" y="244" width="11" height="11"/><rect x="94" y="244" width="11" height="11"/><rect x="105" y="244" width="11" height="11"/><rect x="116" y="244" width="11" height="11"/><rect x="127" y="244" width="11" height="11"/><rect x="138" y="244" width="11" height="11"/><rect x="149" y="244" width="11" height="11"/><rect x="83" y="255" width="11" height="11"/><rect x="94" y="255" width="11" height="11"/><rect x="105" y="255" width="11" height="11"/><rect x="116" y="255" width="11" height="11"/><rect x="127" y="255" width="11" height="11"/><rect x="94" y="266" width="11" height="11"/><rect x="105" y="266" width="11" height="11"/><rect x="116" y="266" width="11" height="11"/><rect x="94" y="277" width="11" height="11"/><rect x="105" y="277" width="11" height="11"/><rect x="83" y="288" width="11" height="11"/><rect x="94" y="288" width="11" height="11"/><rect x="83" y="299" width="11" height="11"/></g><text x="138" y="385" font-family="monospace" font-size="9" fill="#f97316" opacity="0.45" text-anchor="middle" letter-spacing="3">TERRAFORMS</text></svg>`;
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
    const balance = await contract.balanceOf(address);
    const count = Number(balance);

    const { price: liveFloor, isLive: floorIsLive } = await getFloorPrice();

    if (count === 0) {
      return res.json({ address, parcels: [], sets: [], totalEstimatedValue: 0, floor: liveFloor, floorIsLive });
    }

    const tokenIds = await Promise.all(
      Array.from({ length: count }, (_, i) => contract.tokenOfOwnerByIndex(address, i))
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

    const totalEstimatedValue = allParcels.reduce((sum, p) => sum + estimatePrice(p, liveFloor).estimatedValue, 0);

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

// GET /health
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /floor
app.get('/floor', async (req, res) => {
  const { price, isLive, fetchedAt } = await getFloorPrice();
  res.json({ floor: price, isLive, fetchedAt });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Terraform Estimator API on port ${PORT}`));
