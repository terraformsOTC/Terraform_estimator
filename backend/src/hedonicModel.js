// Terraforms Hedonic Pricing Model (v2, fitted)
//
// The multipliers here are FITTED to actual settlements rather than hand-tuned:
// weighted Ridge on ln(price / floor_at_sale) over ~20k eligible sales, shrunk
// toward the v1 model's multipliers for traits with too little data to estimate.
// See "sales database/MODELING.md" for the fit, the parameter sweep, and the
// honest A/B against v1.
//
// Two sub-models, differing only in how bid vs ask settlements are weighted:
//   money sword ON  — retail / ask   (what a buyer pays taking a listing)
//   money sword OFF — liquidation / bid (what a seller nets accepting an offer)
// Together they bracket a parcel: OFF is the floor of the realistic range, ON the
// ceiling. Across every floor regime measured, BID settles ~1.05x floor and ASK
// ~1.30x, so this spread is a persistent market feature, not fitting noise.
//
// SHADOW MODE: this runs alongside pricingModel.js and does not replace it. On the
// held-out A/B the two are at parity overall (v1 9.7% vs v2 10.0% median error);
// v2 is better on ask sales and mid-tier zones, worse on floor parcels and the
// expensive tail. The live scorecard on /sales is what should decide a cutover.

const { estimatePrice } = require('./pricingModel');
const coeffs = require('./pricing-v2-coeffs.json');

// Bump when the coefficients are refit or the application logic changes, so sales
// records can be segmented by which model produced them.
const HEDONIC_MODEL_VERSION = '1.0.0';

// Tier-2: too few sales to fit, so the whole price is v1's prior and both
// sub-models return the same number. Spine and 1of1 are NOT here — they are
// premiums layered onto the standard formula.
const TIER2_SPECIALS = new Set(['X-Seed', 'Y-Seed', 'Lith0', 'Plague']);

const MODE_GROUP = {
  'Terrain': 'Terrain',
  'Daydream': 'DDTF', 'Terraform': 'DDTF',
  'Origin Daydream': 'ORIG', 'Origin Terraform': 'ORIG',
};

// Not fitted features — carried over from v1 as priors, matching the fit's
// treatment so predictions here agree with sales database/predict.js.
const SPINE_PREMIUM = 1.20;
const ONE_OF_ONE_PREMIUM = 1.05;
const S0_PREMIUM = 1.05;

// The fit's target divides by the ENDOGENOUS floor index, which sits below the
// live listing floor. Applying a fitted multiple to a live floor without dividing
// that gap back out inflates every estimate. Measured by
// "sales database/calibrate-floor.js"; absent, fall back to 1 (uncorrected) rather
// than silently guessing a constant.
const FLOOR_CALIBRATION = coeffs.floor_calibration?.value ?? 1;

/** Badge tests. MUST stay in lockstep with badges() in fit_hedonic.py — a badge
 *  applied on a definition the model did not fit is worse than no badge at all. */
function badgeFlags(traits, modeGroup) {
  const isTerrain = modeGroup === 'Terrain';
  const biome = String(traits.biome);
  const mystery = traits.mysteryValue;
  return {
    mesa: isTerrain && biome === '39' && mystery != null && mystery < 30000,
    // Intro Forest is required: biome 58 alone is already carried by the biome
    // coefficient, and the narrow definition is what the product calls Matrix.
    matrix: isTerrain && biome === '58' && traits.zone === 'Intro Forest',
    heartbeat: isTerrain && traits.zone === '[BLOOD]' && traits.chroma === 'Pulse',
    gm: isTerrain && biome === '71' && mystery != null && mystery < 30000,
    biome0_flow: biome === '0' && traits.chroma === 'Flow',
  };
}

/**
 * Total floor-multiple for one sub-model, with a human-readable breakdown.
 * Unknown trait levels resolve to 1.0 — the reference parcel's value — which is
 * also what the reference zone/biome themselves carry.
 */
function subModelMultiple(modelKey, traits) {
  const M = coeffs[modelKey].multipliers;
  const parts = [];
  const push = (label, v) => { if (v !== 1) parts.push({ label, multiple: Number(v.toFixed(4)) }); };

  let mult = M.baseline_multiple;
  parts.push({ label: 'baseline', multiple: Number(mult.toFixed(4)) });

  const zoneM = M.zone[traits.zone] ?? 1;
  mult *= zoneM; push(`zone ${traits.zone}`, zoneM);

  const biomeM = M.biome[String(traits.biome)] ?? 1;
  mult *= biomeM; push(`biome ${traits.biome}`, biomeM);

  const levelM = M.level[String(traits.level)] ?? 1;
  mult *= levelM; push(`L${traits.level}`, levelM);

  if (traits.chroma === 'Pulse' || traits.chroma === 'Hyper') {
    const c = M.chroma[traits.chroma] ?? 1;
    mult *= c; push(traits.chroma, c);
  }

  const g = MODE_GROUP[traits.mode] || 'Terrain';
  if (g !== 'Terrain') {
    const m = M.mode[g] ?? 1;
    mult *= m; push(g === 'DDTF' ? 'daydream/terraform' : 'origin', m);
  }

  const flags = badgeFlags(traits, g);
  for (const [name, on] of Object.entries(flags)) {
    if (!on) continue;
    const b = M.badge[name] ?? 1;
    mult *= b; push(name, b);
  }

  if (traits.specialType === 'Spine') { mult *= SPINE_PREMIUM; push('spine (v1 prior)', SPINE_PREMIUM); }
  if (traits.isOneOfOne) { mult *= ONE_OF_ONE_PREMIUM; push('1of1 (v1 prior)', ONE_OF_ONE_PREMIUM); }
  if (traits.isS0) { mult *= S0_PREMIUM; push('S0 (v1 prior)', S0_PREMIUM); }

  return { multiple: mult, parts };
}

function isTier2(traits) {
  return Boolean(traits.isGodmode) || TIER2_SPECIALS.has(traits.specialType);
}

/**
 * Hedonic estimate for a parcel.
 *
 * @param traits  same shape pricingModel.estimatePrice takes (getSnapshotTraits output)
 * @param floor   floor price in ETH
 * @param opts.floorBasis  'live'  (default) a listing floor — Alchemy, floor-history.
 *                                  FLOOR_CALIBRATION is applied.
 *                         'index' the endogenous floor index the model trained on.
 *                                  No calibration — it is already the right basis.
 * @returns { off, on, ... } where off <= on for a normal parcel; Tier-2 collapses
 *          both to the v1 price.
 */
function estimateHedonic(traits, floor, opts = {}) {
  const basis = opts.floorBasis ?? 'live';
  const calibration = basis === 'live' ? FLOOR_CALIBRATION : 1;
  const effectiveFloor = floor * calibration;

  if (isTier2(traits)) {
    // No bid/ask data to split these on, so the range collapses to a point and
    // the number is v1's — deliberately identical to what the v1 model returns.
    const v1Value = estimatePrice(traits, floor).estimatedValue;
    return {
      off: v1Value,
      on: v1Value,
      tier: 'tier2',
      tierReason: traits.isGodmode ? 'Godmode' : traits.specialType,
      floor,
      effectiveFloor: floor,
      floorCalibration: 1,
      modelVersion: HEDONIC_MODEL_VERSION,
    };
  }

  const offR = subModelMultiple('money_sword_off', traits);
  const onR = subModelMultiple('money_sword_on', traits);
  const round = (x) => Math.round(x * 1000) / 1000;

  return {
    off: round(effectiveFloor * offR.multiple),
    on: round(effectiveFloor * onR.multiple),
    offMultiple: Math.round(offR.multiple * 100) / 100,
    onMultiple: Math.round(onR.multiple * 100) / 100,
    tier: 'tier1',
    floor,
    effectiveFloor: Math.round(effectiveFloor * 100000) / 100000,
    floorCalibration: calibration,
    breakdown: { off: offR.parts, on: onR.parts },
    modelVersion: HEDONIC_MODEL_VERSION,
  };
}

module.exports = {
  estimateHedonic,
  isTier2,
  HEDONIC_MODEL_VERSION,
  FLOOR_CALIBRATION,
  COEFFS_META: coeffs.meta,
};
