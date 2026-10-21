// Terraforms Hedonic Pricing Model (v2, fitted)
//
// The multipliers here are FITTED to actual settlements rather than hand-tuned:
// weighted Ridge on ln(price / floor_at_sale) over ~20k eligible sales, a trait
// with too little data for that leaning on its own recency-weighted sales instead
// (v1's hand-set multipliers only where a trait has none).
// See "sales database/MODELING.md" for the fit, the parameter sweep, and the
// honest A/B against v1.
//
// Two sub-models, differing only in how the settlement side is priced:
//   money sword ON  — retail / ask   (what a buyer pays taking a listing)
//   money sword OFF — liquidation / bid (what a seller nets accepting an offer)
// Together they bracket a parcel: OFF is the floor of the realistic range, ON the
// ceiling. Both numbers are SETTLED sale prices — the fit's target is
// ln(price / floor_at_sale) over sales that actually cleared. ASK is therefore the
// listing price that gets taken, not the listing price someone posts and holds.
//
// The two share one fit. A single weighted Ridge runs over all 20,271 sales with
// an is-ask indicator, and that coefficient IS the spread: ask = bid x 1.1241.
// Structurally, off <= on for every parcel — the same parcel priced on two sides,
// not two parcels priced independently.
//
// It used to be two separate fits at 80/20 and 20/80 weight mass, with nothing
// tying them together. Per-trait noise then flipped 1,626 of 9,911 parcels (16.4%,
// and 32% of the plainest sixth) to bid-above-ask, against raw data that says ask
// clears ~25% above bid at every level bucket and zone-richness quartile. The
// fitted like-for-like spread is smaller than that raw gap — +12.4% against +24.6%
// — because the raw number is partly composition: different parcels sell on each
// side. Controlling for traits is what the indicator does.
//
// This is the site's pricing model. It replaced pricingModel.js (v1) as the
// headline estimate; v1 still computes alongside it and is served on the unlinked
// /legacy page. On the live sales feed at cutover, v2 missed by 11.3% median
// absolute error against v1's 27.2%, closer on 39 of 50 settled sales — most of
// v1's gap being a level bias, since v1 read high and parcels cleared under it.

const { estimatePrice } = require('./pricingModel');
const coeffs = require('./pricing-v2-coeffs.json');

// Bump when the coefficients are refit or the application logic changes, so sales
// records can be segmented by which model produced them. 2.0.0 is a structural
// change, not a refit: one fit with a side indicator instead of two independent
// fits, and alpha 30 instead of the CV pick (see fit_hedonic.py — CV scores the
// most recent 20% of the DB, which is adjacent to training, and its choice was the
// worst of the grid against sales that landed after the DB was built).
// 2.1.0 (2026-09-03) IS a refit: the sales DB was three weeks stale, and the live
// feed alpha was tuned against was missing ~30% of its sales (Blur Pool fills,
// which are bid-side). With both fixed the alpha minimum moves 30 -> 10.
// 2.2.0 (2026-09-23) changes the features: 1of1 / S0 / Spine are fitted rather
// than v1 premiums stacked on the fit, Daydream/Terraform parcels get a fitted
// discount on their biome premium, and the fit runs at half-life 180d / alpha 3.
// Chosen by a rolling-origin backtest — see HALF_LIFE_D in fit_hedonic.py.
// 2.3.0 (2026-10-20, James): level 20, Dread and biome 39 lean on their own
// recent sales rather than v1's hand-set numbers (SALES_ANCHORED in
// fit_hedonic.py, which lists every trait approved since), Lith0 and Plague are priced from their own sales, Y-Seeds are
// valued as X-Seeds, Spine adds nothing on a level-20 (penthouse) parcel, and the
// fit takes sweep legs at their own price (9k more sales).
// 2.3.1 (2026-10-20, James): First Earth, Avidana, biome 17 and the Biome 0 Flow
// and Matrix badges move to their own sales too — the five whose sales sat above v1.
// 2.3.2 (2026-10-21, James): level 20 is priced by its own recent sales alone (the
// two May 2026 sales; SALES_ONLY in fit_hedonic.py), and its sales above 40x the
// floor count.
// 2.3.3 (2026-10-21, James): biomes 74, 77, 78 and 81 set to what their two latest
// sales say, Plague's floor multiple lowered in line with its sales, and two bids
// he knows were accepted far under value left out (excluded-sales.json).
const HEDONIC_MODEL_VERSION = '2.3.3';

// Tier-2: too few sales to fit. As in v1 the type sets the value — the parcel's
// other traits don't stack on it. Lith0 and Plague are one floor multiple each,
// read off their own sales (special_multiples, from fit_hedonic.py); the others
// keep v1's price, collapsed to a point. Spine and 1of1 are NOT here — they are
// premiums layered onto the standard formula.
const TIER2_SPECIALS = new Set(['X-Seed', 'Y-Seed', 'Lith0', 'Plague']);
const SPECIAL_MULTIPLES = coeffs.special_multiples || {};
// Y-Seeds are valued as X-Seeds (James, 2026-10-20); v1 put them 17% above.
const V1_PRICED_AS = { 'Y-Seed': 'X-Seed' };

const MODE_GROUP = {
  'Terrain': 'Terrain',
  'Daydream': 'DDTF', 'Terraform': 'DDTF',
  'Origin Daydream': 'ORIG', 'Origin Terraform': 'ORIG',
};

// v1's premiums for the three parcel flags. Since 2.2.0 the fit estimates these
// itself (multipliers.extra); the v1 values are only used by a coefficients file
// that predates that, so an older JSON still prices the way it was fitted to.
const V1_FLAG_PREMIUMS = { spine: 1.20, one_of_one: 1.05, s0: 1.05 };

// The fit's target divides by the ENDOGENOUS floor index, which sits below the
// live listing floor. Applying a fitted multiple to a live floor without dividing
// that gap back out inflates every estimate. Measured by
// "sales database/calibrate-floor.js"; absent, fall back to 1 (uncorrected) rather
// than silently guessing a constant.
const FLOOR_CALIBRATION = coeffs.floor_calibration?.value ?? 1;

// exp(beta) on the is-ask indicator: ask = bid x this, for every parcel. Read
// rather than hardcoded so a refit carries through.
const ASK_PREMIUM = coeffs.ask_premium?.value ?? 1;

/**
 * Raise a range that sits below a live, standing collection-wide bid.
 *
 * A collection offer is fillable against ANY parcel, so while one stands nobody
 * would rationally sell below it — it is a hard floor under every estimate the
 * model produces, whatever the traits say.
 *
 * The ask side is re-derived through the model's own fitted premium rather than
 * merely clamped to the new bid. Since 2.0.0 ask IS bid x ASK_PREMIUM by
 * construction, so once the bid moves the model's own definition says where the
 * ask goes; clamping both to the same number would contradict the model and
 * collapse the range to a point on the ~10% of parcels priced entirely below the
 * bid. max() throughout, so a parcel already above the bid is untouched.
 */
function applyOfferFloor(estimate, offer) {
  if (!estimate || !(offer > 0) || !(estimate.off < offer)) return estimate;
  const round = (x) => Math.round(x * 1000) / 1000;
  const off = offer;
  const on = Math.max(estimate.on, offer * ASK_PREMIUM);
  return {
    ...estimate,
    off: round(off),
    on: round(on),
    // What the number would have been without the floor, so the UI (and anyone
    // reading the API) can tell a floored estimate from a modelled one.
    modelOff: estimate.off,
    modelOn: estimate.on,
    offerFloor: round(offer),
  };
}

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

  // Daydream/Terraform hide the terrain, so the biome premium is scaled down by a
  // fitted per-biome factor (prior ** beta, beta < 0). Absent in pre-2.2 files.
  const modeBiome = M.mode_biome?.[g]?.[String(traits.biome)];
  if (modeBiome != null) { mult *= modeBiome; push(`biome ${traits.biome} in ${g === 'DDTF' ? 'daydream/terraform' : g}`, modeBiome); }

  const flags = badgeFlags(traits, g);
  for (const [name, on] of Object.entries(flags)) {
    if (!on) continue;
    const b = M.badge[name] ?? 1;
    mult *= b; push(name, b);
  }

  const fitted = M.extra || {};
  const flag = (key, label) => {
    const v = fitted[key] ?? V1_FLAG_PREMIUMS[key];
    mult *= v; push(`${label}${fitted[key] == null ? ' (v1 prior)' : ''}`, v);
  };
  // Penthouse outranks Spine (James, 2026-10-20): on level 20 the Spine flag adds
  // nothing, as the fit treats it (fit_hedonic.py load_records).
  if (traits.specialType === 'Spine' && Number(traits.level) !== 20) flag('spine', 'spine');
  if (traits.isOneOfOne) flag('one_of_one', '1of1');
  if (traits.isS0) flag('s0', 'S0');

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
 * @returns { off, on, ... } where off <= on always, by construction. Tier-2 is
 *          its type's floor multiple from sales (Lith0, Plague), else v1's price
 *          collapsed to a point.
 */
function estimateHedonic(traits, floor, opts = {}) {
  const basis = opts.floorBasis ?? 'live';
  const calibration = basis === 'live' ? FLOOR_CALIBRATION : 1;
  const effectiveFloor = floor * calibration;

  const round = (x) => Math.round(x * 1000) / 1000;

  if (isTier2(traits)) {
    const type = traits.isGodmode ? 'Godmode' : traits.specialType;
    const sp = SPECIAL_MULTIPLES[type];
    if (sp?.multiple > 0) {
      const label = `${type} (${sp.n} ${sp.n === 1 ? 'sale' : 'sales'}, last ${sp.last_sale})`;
      return {
        off: round(effectiveFloor * sp.multiple),
        on: round(effectiveFloor * sp.multiple * ASK_PREMIUM),
        offMultiple: Math.round(sp.multiple * 100) / 100,
        onMultiple: Math.round(sp.multiple * ASK_PREMIUM * 100) / 100,
        tier: 'tier2',
        tierReason: type,
        special: { type, multiple: sp.multiple, sales: sp.n, lastSale: sp.last_sale },
        floor,
        effectiveFloor: Math.round(effectiveFloor * 100000) / 100000,
        floorCalibration: calibration,
        breakdown: {
          off: [{ label, multiple: sp.multiple }],
          on: [{ label, multiple: sp.multiple }, { label: 'taken listing', multiple: ASK_PREMIUM }],
        },
        modelVersion: HEDONIC_MODEL_VERSION,
      };
    }
    // No sales multiple for this type: the range collapses to a point and the
    // number is v1's (a Y-Seed's as if it were an X-Seed).
    const v1Traits = V1_PRICED_AS[type] ? { ...traits, specialType: V1_PRICED_AS[type] } : traits;
    const v1Value = estimatePrice(v1Traits, floor).estimatedValue;
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
  applyOfferFloor,
  isTier2,
  ASK_PREMIUM,
  HEDONIC_MODEL_VERSION,
  FLOOR_CALIBRATION,
  COEFFS_META: coeffs.meta,
};
