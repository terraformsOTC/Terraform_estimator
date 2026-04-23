// check_1of1.js — Cross-reference minted 1-of-1 list against unminted parcels
// Usage: node backend/check_1of1.js
//
// Outputs:
//   - Minted token IDs to REMOVE from ONE_OF_ONE_IDS (zone/biome also in unminted set)
//   - Unminted parcel IDs to ADD as 1-of-1 (zone/biome unique across full minted set)

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://ethereum.publicnode.com';
const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const CONCURRENCY = 25;
const TIMEOUT_MS = 20_000;

const ONE_OF_ONE_IDS = [
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
];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function fetchZoneBiome(contract, tokenId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const uri = await withTimeout(contract.tokenURI(tokenId), TIMEOUT_MS);
      const json = Buffer.from(uri.replace('data:application/json;base64,', ''), 'base64').toString('utf8');
      const meta = JSON.parse(json);
      const attrs = meta.attributes || [];
      const zone  = attrs.find(a => a.trait_type === 'Zone')?.value  ?? null;
      const biome = attrs.find(a => a.trait_type === 'Biome')?.value ?? null;
      return { tokenId, zone, biome: biome !== null ? parseInt(biome, 10) : null };
    } catch (e) {
      if (attempt === retries) return { tokenId, zone: null, biome: null, error: e.message };
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
}

async function runBatch(contract, ids, concurrency) {
  const results = [];
  let idx = 0;
  let done = 0;
  const total = ids.length;

  async function worker() {
    while (idx < ids.length) {
      const id = ids[idx++];
      const result = await fetchZoneBiome(contract, id);
      results.push(result);
      done++;
      if (done % 50 === 0 || done === total) {
        process.stdout.write(`\r  Fetched ${done}/${total}...`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write('\n');
  return results;
}

async function main() {
  const unmintedPath = path.join(__dirname, 'src', 'unminted-parcels.json');
  const unminted = JSON.parse(fs.readFileSync(unmintedPath, 'utf8'));

  // Build map of unminted zone/biome combos and count duplicates within unminted set
  const unmintedByCombo = new Map();  // combo -> first unminted parcel
  const unmintedComboCount = new Map();
  for (const p of unminted) {
    const key = `${p.zone}|${p.biome}`;
    if (!unmintedByCombo.has(key)) unmintedByCombo.set(key, p);
    unmintedComboCount.set(key, (unmintedComboCount.get(key) || 0) + 1);
  }
  console.log(`Unminted parcels: ${unminted.length} (${unmintedByCombo.size} unique zone/biome combos)`);

  // Connect to chain
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    TERRAFORMS_ADDRESS,
    ['function tokenURI(uint256 tokenId) view returns (string)'],
    provider
  );

  // ── FULL SCAN: all 9911 minted tokens ──
  const allMintedIds = Array.from({ length: 9911 }, (_, i) => i + 1);
  console.log(`\nFetching zone/biome for all ${allMintedIds.length} minted tokens (full scan)...`);
  const allMintedTraits = await runBatch(contract, allMintedIds, CONCURRENCY);

  const failed = allMintedTraits.filter(r => r.error);
  if (failed.length > 0) {
    console.log(`\nWARNING: ${failed.length} tokens failed to fetch: ${failed.map(r => r.tokenId).join(', ')}`);
  }

  // Build full minted combo map: combo -> list of tokenIds
  const mintedComboMap = new Map(); // combo -> [tokenId, ...]
  for (const r of allMintedTraits) {
    if (r.zone && r.biome !== null) {
      const key = `${r.zone}|${r.biome}`;
      if (!mintedComboMap.has(key)) mintedComboMap.set(key, []);
      mintedComboMap.get(key).push(r.tokenId);
    }
  }

  const ONE_OF_ONE_SET = new Set(ONE_OF_ONE_IDS);

  // ── REMOVALS: current minted 1-of-1s invalidated by an unminted parcel ──
  const toRemove = [];
  for (const id of ONE_OF_ONE_IDS) {
    const r = allMintedTraits.find(t => t.tokenId === id);
    if (!r || !r.zone || r.biome === null) continue;
    const key = `${r.zone}|${r.biome}`;
    if (unmintedByCombo.has(key)) {
      const up = unmintedByCombo.get(key);
      toRemove.push({ tokenId: id, combo: key, unmintedId: up.id, unmintedParcel: `${up.zone}/B${up.biome}/L${up.level}` });
    }
  }

  // ── ADDITIONS: unminted parcels that are genuinely new 1-of-1s ──
  // Criteria: combo appears exactly once in minted set AND exactly once in unminted set
  const toAdd = [];
  for (const [combo, p] of unmintedByCombo) {
    const mintedCount = (mintedComboMap.get(combo) || []).length;
    const unmintedCount = unmintedComboCount.get(combo);
    if (mintedCount === 1 && unmintedCount === 1) {
      // Appears once in minted AND once in unminted — total 2, not unique
      // So: only a new 1-of-1 if it appears ZERO times in minted
      // (mintedCount === 0 means no minted token has this combo)
    }
    if (mintedCount === 0 && unmintedCount === 1) {
      toAdd.push({ unmintedId: p.id, combo, zone: p.zone, biome: p.biome, level: p.level });
    }
  }

  // ── ALSO CHECK: minted 1-of-1s that are now confirmed still valid ──
  // (in ONE_OF_ONE_IDS, NOT shared with any unminted parcel)
  const stillValid = ONE_OF_ONE_IDS.filter(id => !toRemove.find(r => r.tokenId === id));

  // ── REPORT ──
  console.log('\n════════════════════════════════════════════════════');
  console.log('RESULTS');
  console.log('════════════════════════════════════════════════════');

  console.log(`\nMINTED 1-of-1s TO REMOVE: ${toRemove.length} (invalidated by unminted parcel sharing same zone/biome)`);
  for (const r of toRemove) {
    console.log(`  Token #${r.tokenId} (${r.combo}) — shared with unminted #${r.unmintedId} (${r.unmintedParcel})`);
  }

  console.log(`\nNEW UNMINTED 1-of-1s TO ADD: ${toAdd.length} (zone/biome absent from all 9911 minted tokens)`);
  for (const c of toAdd) {
    console.log(`  Unminted #${c.unmintedId} — ${c.zone}/B${c.biome}/L${c.level}`);
  }

  console.log(`\nSUMMARY:`);
  console.log(`  Minted 1-of-1s before: ${ONE_OF_ONE_IDS.length}`);
  console.log(`  Minted 1-of-1s after:  ${stillValid.length} (removed ${toRemove.length})`);
  console.log(`  Unminted new 1-of-1s:  ${toAdd.length}`);

  // Save full results
  const outPath = path.join(__dirname, '1of1_check_results.json');
  fs.writeFileSync(outPath, JSON.stringify({
    generated: new Date().toISOString(),
    mintedToRemove: toRemove,
    unmintedToAdd: toAdd,
    failed,
  }, null, 2));
  console.log(`\nFull results saved to: ${outPath}`);
}

main().catch(console.error);
