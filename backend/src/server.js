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

  // ── 1of1 (1237) — unique zone/biome combination, computed from full on-chain scan ──
  // 26 tokens that are also Spine/Lith0/X-Seed/Y-Seed are excluded (higher-priority type kept).
  // Source: Alchemy getNFTsForCollection scan of all 9911 tokens, Mar 2025.
  2: '1of1', 50: '1of1', 51: '1of1', 59: '1of1', 64: '1of1', 75: '1of1', 77: '1of1', 87: '1of1',
  90: '1of1', 97: '1of1', 125: '1of1', 139: '1of1', 140: '1of1', 151: '1of1', 154: '1of1', 161: '1of1',
  166: '1of1', 168: '1of1', 172: '1of1', 173: '1of1', 197: '1of1', 209: '1of1', 223: '1of1', 235: '1of1',
  239: '1of1', 243: '1of1', 245: '1of1', 248: '1of1', 263: '1of1', 268: '1of1', 274: '1of1', 301: '1of1',
  311: '1of1', 316: '1of1', 319: '1of1', 334: '1of1', 336: '1of1', 340: '1of1', 352: '1of1', 354: '1of1',
  377: '1of1', 379: '1of1', 386: '1of1', 397: '1of1', 401: '1of1', 436: '1of1', 437: '1of1', 439: '1of1',
  445: '1of1', 448: '1of1', 463: '1of1', 469: '1of1', 476: '1of1', 501: '1of1', 508: '1of1', 521: '1of1',
  523: '1of1', 533: '1of1', 536: '1of1', 547: '1of1', 598: '1of1', 656: '1of1', 661: '1of1', 668: '1of1',
  674: '1of1', 676: '1of1', 680: '1of1', 684: '1of1', 711: '1of1', 713: '1of1', 717: '1of1', 719: '1of1',
  746: '1of1', 756: '1of1', 765: '1of1', 782: '1of1', 794: '1of1', 814: '1of1', 829: '1of1', 840: '1of1',
  856: '1of1', 873: '1of1', 876: '1of1', 879: '1of1', 881: '1of1', 887: '1of1', 908: '1of1', 923: '1of1',
  929: '1of1', 933: '1of1', 935: '1of1', 947: '1of1', 948: '1of1', 952: '1of1', 954: '1of1', 955: '1of1',
  957: '1of1', 963: '1of1', 969: '1of1', 970: '1of1', 983: '1of1', 988: '1of1', 990: '1of1', 996: '1of1',
  1025: '1of1', 1027: '1of1', 1038: '1of1', 1043: '1of1', 1075: '1of1', 1079: '1of1', 1085: '1of1', 1093: '1of1',
  1117: '1of1', 1126: '1of1', 1130: '1of1', 1133: '1of1', 1135: '1of1', 1137: '1of1', 1161: '1of1', 1165: '1of1',
  1171: '1of1', 1173: '1of1', 1180: '1of1', 1181: '1of1', 1191: '1of1', 1195: '1of1', 1235: '1of1', 1259: '1of1',
  1273: '1of1', 1282: '1of1', 1292: '1of1', 1293: '1of1', 1294: '1of1', 1296: '1of1', 1297: '1of1', 1299: '1of1',
  1306: '1of1', 1317: '1of1', 1330: '1of1', 1338: '1of1', 1341: '1of1', 1345: '1of1', 1358: '1of1', 1361: '1of1',
  1367: '1of1', 1368: '1of1', 1370: '1of1', 1371: '1of1', 1374: '1of1', 1381: '1of1', 1392: '1of1', 1397: '1of1',
  1419: '1of1', 1427: '1of1', 1441: '1of1', 1442: '1of1', 1448: '1of1', 1456: '1of1', 1460: '1of1', 1470: '1of1',
  1472: '1of1', 1475: '1of1', 1476: '1of1', 1477: '1of1', 1483: '1of1', 1496: '1of1', 1498: '1of1', 1502: '1of1',
  1507: '1of1', 1511: '1of1', 1541: '1of1', 1546: '1of1', 1558: '1of1', 1564: '1of1', 1583: '1of1', 1593: '1of1',
  1594: '1of1', 1599: '1of1', 1603: '1of1', 1615: '1of1', 1620: '1of1', 1621: '1of1', 1628: '1of1', 1633: '1of1',
  1644: '1of1', 1654: '1of1', 1716: '1of1', 1724: '1of1', 1759: '1of1', 1780: '1of1', 1787: '1of1', 1795: '1of1',
  1802: '1of1', 1804: '1of1', 1822: '1of1', 1824: '1of1', 1834: '1of1', 1845: '1of1', 1870: '1of1', 1871: '1of1',
  1891: '1of1', 1892: '1of1', 1893: '1of1', 1895: '1of1', 1897: '1of1', 1907: '1of1', 1921: '1of1', 1926: '1of1',
  1935: '1of1', 1940: '1of1', 1944: '1of1', 1949: '1of1', 1954: '1of1', 1969: '1of1', 1974: '1of1', 1976: '1of1',
  1977: '1of1', 1981: '1of1', 2016: '1of1', 2018: '1of1', 2041: '1of1', 2049: '1of1', 2059: '1of1', 2062: '1of1',
  2067: '1of1', 2069: '1of1', 2083: '1of1', 2093: '1of1', 2094: '1of1', 2150: '1of1', 2161: '1of1', 2186: '1of1',
  2234: '1of1', 2235: '1of1', 2252: '1of1', 2260: '1of1', 2268: '1of1', 2306: '1of1', 2307: '1of1', 2313: '1of1',
  2315: '1of1', 2320: '1of1', 2322: '1of1', 2323: '1of1', 2331: '1of1', 2332: '1of1', 2345: '1of1', 2350: '1of1',
  2360: '1of1', 2372: '1of1', 2378: '1of1', 2398: '1of1', 2399: '1of1', 2402: '1of1', 2406: '1of1', 2412: '1of1',
  2423: '1of1', 2426: '1of1', 2428: '1of1', 2434: '1of1', 2451: '1of1', 2459: '1of1', 2465: '1of1', 2478: '1of1',
  2483: '1of1', 2486: '1of1', 2491: '1of1', 2505: '1of1', 2508: '1of1', 2515: '1of1', 2516: '1of1', 2565: '1of1',
  2597: '1of1', 2626: '1of1', 2627: '1of1', 2656: '1of1', 2658: '1of1', 2660: '1of1', 2668: '1of1', 2669: '1of1',
  2677: '1of1', 2679: '1of1', 2694: '1of1', 2698: '1of1', 2711: '1of1', 2714: '1of1', 2716: '1of1', 2722: '1of1',
  2733: '1of1', 2739: '1of1', 2747: '1of1', 2753: '1of1', 2791: '1of1', 2801: '1of1', 2824: '1of1', 2829: '1of1',
  2834: '1of1', 2844: '1of1', 2851: '1of1', 2871: '1of1', 2906: '1of1', 2911: '1of1', 2918: '1of1', 2952: '1of1',
  2957: '1of1', 2986: '1of1', 2989: '1of1', 2994: '1of1', 2997: '1of1', 2998: '1of1', 3004: '1of1', 3012: '1of1',
  3013: '1of1', 3016: '1of1', 3036: '1of1', 3052: '1of1', 3057: '1of1', 3060: '1of1', 3061: '1of1', 3063: '1of1',
  3071: '1of1', 3072: '1of1', 3073: '1of1', 3079: '1of1', 3081: '1of1', 3083: '1of1', 3103: '1of1', 3113: '1of1',
  3129: '1of1', 3132: '1of1', 3147: '1of1', 3148: '1of1', 3160: '1of1', 3171: '1of1', 3177: '1of1', 3179: '1of1',
  3183: '1of1', 3203: '1of1', 3216: '1of1', 3217: '1of1', 3218: '1of1', 3228: '1of1', 3236: '1of1', 3252: '1of1',
  3260: '1of1', 3270: '1of1', 3271: '1of1', 3277: '1of1', 3287: '1of1', 3288: '1of1', 3289: '1of1', 3290: '1of1',
  3295: '1of1', 3296: '1of1', 3311: '1of1', 3316: '1of1', 3319: '1of1', 3332: '1of1', 3333: '1of1', 3337: '1of1',
  3343: '1of1', 3344: '1of1', 3345: '1of1', 3351: '1of1', 3359: '1of1', 3370: '1of1', 3375: '1of1', 3380: '1of1',
  3382: '1of1', 3384: '1of1', 3393: '1of1', 3403: '1of1', 3404: '1of1', 3405: '1of1', 3414: '1of1', 3415: '1of1',
  3416: '1of1', 3430: '1of1', 3437: '1of1', 3442: '1of1', 3453: '1of1', 3457: '1of1', 3468: '1of1', 3471: '1of1',
  3476: '1of1', 3483: '1of1', 3509: '1of1', 3517: '1of1', 3518: '1of1', 3521: '1of1', 3526: '1of1', 3528: '1of1',
  3542: '1of1', 3554: '1of1', 3557: '1of1', 3562: '1of1', 3576: '1of1', 3583: '1of1', 3586: '1of1', 3590: '1of1',
  3592: '1of1', 3611: '1of1', 3624: '1of1', 3635: '1of1', 3638: '1of1', 3669: '1of1', 3674: '1of1', 3686: '1of1',
  3687: '1of1', 3689: '1of1', 3700: '1of1', 3701: '1of1', 3702: '1of1', 3704: '1of1', 3732: '1of1', 3738: '1of1',
  3739: '1of1', 3742: '1of1', 3750: '1of1', 3754: '1of1', 3761: '1of1', 3770: '1of1', 3779: '1of1', 3785: '1of1',
  3797: '1of1', 3799: '1of1', 3814: '1of1', 3816: '1of1', 3821: '1of1', 3827: '1of1', 3829: '1of1', 3857: '1of1',
  3861: '1of1', 3877: '1of1', 3878: '1of1', 3880: '1of1', 3884: '1of1', 3892: '1of1', 3897: '1of1', 3898: '1of1',
  3908: '1of1', 3919: '1of1', 3931: '1of1', 3939: '1of1', 3941: '1of1', 3951: '1of1', 3959: '1of1', 3967: '1of1',
  3969: '1of1', 3984: '1of1', 3986: '1of1', 3993: '1of1', 3994: '1of1', 4000: '1of1', 4003: '1of1', 4011: '1of1',
  4022: '1of1', 4029: '1of1', 4030: '1of1', 4034: '1of1', 4035: '1of1', 4043: '1of1', 4052: '1of1', 4062: '1of1',
  4064: '1of1', 4065: '1of1', 4068: '1of1', 4070: '1of1', 4073: '1of1', 4075: '1of1', 4076: '1of1', 4079: '1of1',
  4085: '1of1', 4094: '1of1', 4096: '1of1', 4099: '1of1', 4102: '1of1', 4113: '1of1', 4114: '1of1', 4117: '1of1',
  4118: '1of1', 4119: '1of1', 4133: '1of1', 4150: '1of1', 4174: '1of1', 4181: '1of1', 4197: '1of1', 4210: '1of1',
  4211: '1of1', 4217: '1of1', 4222: '1of1', 4237: '1of1', 4253: '1of1', 4263: '1of1', 4270: '1of1', 4281: '1of1',
  4288: '1of1', 4290: '1of1', 4293: '1of1', 4297: '1of1', 4298: '1of1', 4303: '1of1', 4307: '1of1', 4318: '1of1',
  4319: '1of1', 4321: '1of1', 4324: '1of1', 4352: '1of1', 4358: '1of1', 4359: '1of1', 4361: '1of1', 4367: '1of1',
  4372: '1of1', 4375: '1of1', 4380: '1of1', 4396: '1of1', 4398: '1of1', 4404: '1of1', 4407: '1of1', 4410: '1of1',
  4412: '1of1', 4415: '1of1', 4418: '1of1', 4433: '1of1', 4437: '1of1', 4438: '1of1', 4439: '1of1', 4441: '1of1',
  4443: '1of1', 4462: '1of1', 4478: '1of1', 4481: '1of1', 4503: '1of1', 4511: '1of1', 4522: '1of1', 4525: '1of1',
  4533: '1of1', 4543: '1of1', 4553: '1of1', 4554: '1of1', 4558: '1of1', 4563: '1of1', 4566: '1of1', 4574: '1of1',
  4575: '1of1', 4576: '1of1', 4583: '1of1', 4593: '1of1', 4601: '1of1', 4605: '1of1', 4614: '1of1', 4619: '1of1',
  4623: '1of1', 4633: '1of1', 4634: '1of1', 4637: '1of1', 4639: '1of1', 4645: '1of1', 4652: '1of1', 4655: '1of1',
  4656: '1of1', 4668: '1of1', 4675: '1of1', 4677: '1of1', 4679: '1of1', 4684: '1of1', 4685: '1of1', 4689: '1of1',
  4692: '1of1', 4695: '1of1', 4699: '1of1', 4709: '1of1', 4724: '1of1', 4732: '1of1', 4745: '1of1', 4755: '1of1',
  4758: '1of1', 4764: '1of1', 4775: '1of1', 4781: '1of1', 4791: '1of1', 4792: '1of1', 4800: '1of1', 4801: '1of1',
  4802: '1of1', 4812: '1of1', 4839: '1of1', 4868: '1of1', 4874: '1of1', 4880: '1of1', 4882: '1of1', 4891: '1of1',
  4934: '1of1', 4941: '1of1', 4945: '1of1', 4947: '1of1', 4969: '1of1', 4976: '1of1', 4986: '1of1', 4987: '1of1',
  4988: '1of1', 5001: '1of1', 5006: '1of1', 5013: '1of1', 5014: '1of1', 5015: '1of1', 5019: '1of1', 5032: '1of1',
  5034: '1of1', 5038: '1of1', 5041: '1of1', 5044: '1of1', 5049: '1of1', 5057: '1of1', 5072: '1of1', 5074: '1of1',
  5085: '1of1', 5089: '1of1', 5096: '1of1', 5100: '1of1', 5120: '1of1', 5135: '1of1', 5139: '1of1', 5158: '1of1',
  5173: '1of1', 5179: '1of1', 5182: '1of1', 5195: '1of1', 5197: '1of1', 5200: '1of1', 5202: '1of1', 5204: '1of1',
  5205: '1of1', 5211: '1of1', 5212: '1of1', 5213: '1of1', 5216: '1of1', 5218: '1of1', 5222: '1of1', 5235: '1of1',
  5237: '1of1', 5265: '1of1', 5278: '1of1', 5285: '1of1', 5286: '1of1', 5310: '1of1', 5316: '1of1', 5322: '1of1',
  5344: '1of1', 5347: '1of1', 5371: '1of1', 5387: '1of1', 5389: '1of1', 5392: '1of1', 5393: '1of1', 5395: '1of1',
  5397: '1of1', 5400: '1of1', 5409: '1of1', 5410: '1of1', 5411: '1of1', 5424: '1of1', 5425: '1of1', 5449: '1of1',
  5455: '1of1', 5462: '1of1', 5464: '1of1', 5485: '1of1', 5488: '1of1', 5489: '1of1', 5494: '1of1', 5502: '1of1',
  5518: '1of1', 5525: '1of1', 5531: '1of1', 5532: '1of1', 5543: '1of1', 5559: '1of1', 5566: '1of1', 5574: '1of1',
  5575: '1of1', 5577: '1of1', 5580: '1of1', 5587: '1of1', 5599: '1of1', 5606: '1of1', 5619: '1of1', 5620: '1of1',
  5632: '1of1', 5642: '1of1', 5643: '1of1', 5646: '1of1', 5655: '1of1', 5665: '1of1', 5677: '1of1', 5679: '1of1',
  5682: '1of1', 5691: '1of1', 5724: '1of1', 5734: '1of1', 5754: '1of1', 5758: '1of1', 5762: '1of1', 5763: '1of1',
  5767: '1of1', 5768: '1of1', 5773: '1of1', 5790: '1of1', 5798: '1of1', 5803: '1of1', 5825: '1of1', 5830: '1of1',
  5836: '1of1', 5837: '1of1', 5843: '1of1', 5847: '1of1', 5850: '1of1', 5853: '1of1', 5854: '1of1', 5858: '1of1',
  5869: '1of1', 5872: '1of1', 5875: '1of1', 5876: '1of1', 5880: '1of1', 5881: '1of1', 5885: '1of1', 5917: '1of1',
  5924: '1of1', 5932: '1of1', 5941: '1of1', 5943: '1of1', 5944: '1of1', 5954: '1of1', 5956: '1of1', 5958: '1of1',
  5964: '1of1', 5977: '1of1', 5980: '1of1', 5994: '1of1', 6000: '1of1', 6025: '1of1', 6033: '1of1', 6037: '1of1',
  6040: '1of1', 6048: '1of1', 6052: '1of1', 6054: '1of1', 6060: '1of1', 6068: '1of1', 6070: '1of1', 6087: '1of1',
  6088: '1of1', 6093: '1of1', 6111: '1of1', 6140: '1of1', 6144: '1of1', 6145: '1of1', 6146: '1of1', 6158: '1of1',
  6172: '1of1', 6173: '1of1', 6182: '1of1', 6200: '1of1', 6210: '1of1', 6214: '1of1', 6234: '1of1', 6236: '1of1',
  6256: '1of1', 6268: '1of1', 6279: '1of1', 6282: '1of1', 6299: '1of1', 6307: '1of1', 6311: '1of1', 6315: '1of1',
  6323: '1of1', 6332: '1of1', 6336: '1of1', 6341: '1of1', 6346: '1of1', 6381: '1of1', 6387: '1of1', 6388: '1of1',
  6394: '1of1', 6401: '1of1', 6405: '1of1', 6409: '1of1', 6422: '1of1', 6423: '1of1', 6427: '1of1', 6439: '1of1',
  6440: '1of1', 6455: '1of1', 6457: '1of1', 6458: '1of1', 6463: '1of1', 6467: '1of1', 6469: '1of1', 6470: '1of1',
  6472: '1of1', 6494: '1of1', 6495: '1of1', 6502: '1of1', 6509: '1of1', 6516: '1of1', 6517: '1of1', 6535: '1of1',
  6547: '1of1', 6560: '1of1', 6583: '1of1', 6586: '1of1', 6589: '1of1', 6605: '1of1', 6608: '1of1', 6611: '1of1',
  6613: '1of1', 6617: '1of1', 6619: '1of1', 6626: '1of1', 6628: '1of1', 6638: '1of1', 6642: '1of1', 6657: '1of1',
  6659: '1of1', 6661: '1of1', 6667: '1of1', 6669: '1of1', 6686: '1of1', 6692: '1of1', 6700: '1of1', 6710: '1of1',
  6711: '1of1', 6713: '1of1', 6714: '1of1', 6716: '1of1', 6740: '1of1', 6744: '1of1', 6750: '1of1', 6760: '1of1',
  6771: '1of1', 6798: '1of1', 6804: '1of1', 6829: '1of1', 6840: '1of1', 6856: '1of1', 6862: '1of1', 6876: '1of1',
  6879: '1of1', 6887: '1of1', 6891: '1of1', 6897: '1of1', 6902: '1of1', 6918: '1of1', 6922: '1of1', 6923: '1of1',
  6925: '1of1', 6939: '1of1', 6949: '1of1', 6954: '1of1', 6961: '1of1', 6965: '1of1', 6967: '1of1', 6971: '1of1',
  6975: '1of1', 6996: '1of1', 7008: '1of1', 7030: '1of1', 7039: '1of1', 7061: '1of1', 7083: '1of1', 7086: '1of1',
  7091: '1of1', 7095: '1of1', 7098: '1of1', 7107: '1of1', 7108: '1of1', 7121: '1of1', 7125: '1of1', 7127: '1of1',
  7135: '1of1', 7137: '1of1', 7139: '1of1', 7151: '1of1', 7153: '1of1', 7161: '1of1', 7174: '1of1', 7180: '1of1',
  7186: '1of1', 7187: '1of1', 7188: '1of1', 7192: '1of1', 7199: '1of1', 7207: '1of1', 7208: '1of1', 7214: '1of1',
  7227: '1of1', 7229: '1of1', 7232: '1of1', 7237: '1of1', 7243: '1of1', 7271: '1of1', 7273: '1of1', 7303: '1of1',
  7304: '1of1', 7306: '1of1', 7307: '1of1', 7322: '1of1', 7325: '1of1', 7336: '1of1', 7338: '1of1', 7343: '1of1',
  7350: '1of1', 7354: '1of1', 7366: '1of1', 7369: '1of1', 7374: '1of1', 7388: '1of1', 7390: '1of1', 7401: '1of1',
  7404: '1of1', 7428: '1of1', 7429: '1of1', 7432: '1of1', 7434: '1of1', 7441: '1of1', 7443: '1of1', 7446: '1of1',
  7471: '1of1', 7472: '1of1', 7476: '1of1', 7484: '1of1', 7486: '1of1', 7494: '1of1', 7495: '1of1', 7497: '1of1',
  7514: '1of1', 7516: '1of1', 7525: '1of1', 7526: '1of1', 7529: '1of1', 7536: '1of1', 7538: '1of1', 7542: '1of1',
  7546: '1of1', 7548: '1of1', 7549: '1of1', 7558: '1of1', 7568: '1of1', 7580: '1of1', 7584: '1of1', 7598: '1of1',
  7618: '1of1', 7647: '1of1', 7679: '1of1', 7686: '1of1', 7704: '1of1', 7716: '1of1', 7733: '1of1', 7741: '1of1',
  7744: '1of1', 7746: '1of1', 7754: '1of1', 7761: '1of1', 7771: '1of1', 7773: '1of1', 7777: '1of1', 7794: '1of1',
  7799: '1of1', 7804: '1of1', 7805: '1of1', 7812: '1of1', 7825: '1of1', 7828: '1of1', 7831: '1of1', 7834: '1of1',
  7872: '1of1', 7879: '1of1', 7892: '1of1', 7917: '1of1', 7926: '1of1', 7929: '1of1', 7952: '1of1', 7976: '1of1',
  7977: '1of1', 7978: '1of1', 7980: '1of1', 7983: '1of1', 7986: '1of1', 7991: '1of1', 7999: '1of1', 8013: '1of1',
  8014: '1of1', 8015: '1of1', 8023: '1of1', 8033: '1of1', 8062: '1of1', 8075: '1of1', 8078: '1of1', 8079: '1of1',
  8081: '1of1', 8083: '1of1', 8119: '1of1', 8126: '1of1', 8128: '1of1', 8135: '1of1', 8137: '1of1', 8141: '1of1',
  8145: '1of1', 8147: '1of1', 8150: '1of1', 8152: '1of1', 8155: '1of1', 8159: '1of1', 8160: '1of1', 8164: '1of1',
  8165: '1of1', 8172: '1of1', 8183: '1of1', 8185: '1of1', 8190: '1of1', 8197: '1of1', 8202: '1of1', 8203: '1of1',
  8208: '1of1', 8216: '1of1', 8218: '1of1', 8226: '1of1', 8242: '1of1', 8244: '1of1', 8252: '1of1', 8271: '1of1',
  8280: '1of1', 8300: '1of1', 8307: '1of1', 8312: '1of1', 8345: '1of1', 8351: '1of1', 8355: '1of1', 8356: '1of1',
  8358: '1of1', 8364: '1of1', 8365: '1of1', 8372: '1of1', 8373: '1of1', 8374: '1of1', 8376: '1of1', 8383: '1of1',
  8390: '1of1', 8396: '1of1', 8399: '1of1', 8414: '1of1', 8419: '1of1', 8421: '1of1', 8425: '1of1', 8427: '1of1',
  8446: '1of1', 8453: '1of1', 8456: '1of1', 8466: '1of1', 8471: '1of1', 8488: '1of1', 8500: '1of1', 8510: '1of1',
  8527: '1of1', 8529: '1of1', 8533: '1of1', 8535: '1of1', 8538: '1of1', 8551: '1of1', 8555: '1of1', 8567: '1of1',
  8571: '1of1', 8575: '1of1', 8584: '1of1', 8587: '1of1', 8602: '1of1', 8607: '1of1', 8609: '1of1', 8611: '1of1',
  8613: '1of1', 8616: '1of1', 8620: '1of1', 8621: '1of1', 8622: '1of1', 8632: '1of1', 8641: '1of1', 8642: '1of1',
  8657: '1of1', 8660: '1of1', 8679: '1of1', 8687: '1of1', 8690: '1of1', 8698: '1of1', 8704: '1of1', 8714: '1of1',
  8723: '1of1', 8727: '1of1', 8729: '1of1', 8735: '1of1', 8742: '1of1', 8744: '1of1', 8745: '1of1', 8752: '1of1',
  8759: '1of1', 8768: '1of1', 8775: '1of1', 8781: '1of1', 8782: '1of1', 8785: '1of1', 8791: '1of1', 8809: '1of1',
  8812: '1of1', 8813: '1of1', 8817: '1of1', 8822: '1of1', 8824: '1of1', 8828: '1of1', 8829: '1of1', 8831: '1of1',
  8843: '1of1', 8847: '1of1', 8851: '1of1', 8855: '1of1', 8864: '1of1', 8871: '1of1', 8874: '1of1', 8879: '1of1',
  8885: '1of1', 8905: '1of1', 8906: '1of1', 8909: '1of1', 8923: '1of1', 8925: '1of1', 8927: '1of1', 8950: '1of1',
  8952: '1of1', 8957: '1of1', 8966: '1of1', 8977: '1of1', 9028: '1of1', 9061: '1of1', 9063: '1of1', 9070: '1of1',
  9082: '1of1', 9091: '1of1', 9093: '1of1', 9103: '1of1', 9128: '1of1', 9132: '1of1', 9134: '1of1', 9137: '1of1',
  9152: '1of1', 9154: '1of1', 9155: '1of1', 9179: '1of1', 9190: '1of1', 9228: '1of1', 9252: '1of1', 9261: '1of1',
  9263: '1of1', 9265: '1of1', 9267: '1of1', 9269: '1of1', 9270: '1of1', 9280: '1of1', 9295: '1of1', 9305: '1of1',
  9306: '1of1', 9312: '1of1', 9314: '1of1', 9317: '1of1', 9320: '1of1', 9326: '1of1', 9347: '1of1', 9348: '1of1',
  9352: '1of1', 9363: '1of1', 9378: '1of1', 9381: '1of1', 9393: '1of1', 9396: '1of1', 9419: '1of1', 9451: '1of1',
  9458: '1of1', 9460: '1of1', 9472: '1of1', 9474: '1of1', 9478: '1of1', 9484: '1of1', 9492: '1of1', 9493: '1of1',
  9494: '1of1', 9496: '1of1', 9497: '1of1', 9503: '1of1', 9506: '1of1', 9518: '1of1', 9528: '1of1', 9532: '1of1',
  9537: '1of1', 9544: '1of1', 9579: '1of1', 9612: '1of1', 9630: '1of1', 9639: '1of1', 9644: '1of1', 9646: '1of1',
  9651: '1of1', 9669: '1of1', 9680: '1of1', 9694: '1of1', 9712: '1of1', 9715: '1of1', 9733: '1of1', 9735: '1of1',
  9740: '1of1', 9742: '1of1', 9754: '1of1', 9755: '1of1', 9761: '1of1', 9762: '1of1', 9766: '1of1', 9779: '1of1',
  9783: '1of1', 9797: '1of1', 9807: '1of1', 9810: '1of1', 9813: '1of1', 9828: '1of1', 9848: '1of1', 9872: '1of1',
  9887: '1of1', 9891: '1of1', 9892: '1of1', 9896: '1of1', 9903: '1of1',
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
