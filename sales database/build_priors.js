#!/usr/bin/env node
'use strict';

// Convert the hand-tuned v1 model into priors the hedonic fit can shrink toward.
//
// WHY: rare traits have too few sales to estimate. Aetherking has 13 eligible
// sales and none in the last year, so a recency-weighted fit prices it at ~2.3x
// floor against v1's 15x — the penalty, not the market, is choosing the number.
// v1's multipliers encode real judgement about exactly these traits, so they are
// the natural prior. fit_hedonic.py blends fitted <- prior with weight n/(n+K).
//
// THE UNIT PROBLEM: v1 and the fit are different parameterizations. v1 averages
// zone and biome additively — floor x (1 + level_premium + (zone_m x 0.5 + biome_m x 0.5 - 1))
// — while the fit is fully multiplicative. A v1 multiplier is therefore NOT
// directly comparable to a fitted coefficient.
//
// The fix: evaluate v1 on a REFERENCE PARCEL, varying one trait at a time. The
// reference is the same one the fit drops from its design matrix, so both express
// the same quantity — "how much more is this parcel worth than the reference" —
// and the blend is apples-to-apples. The reference parcel evaluates to exactly
// 1.0, so each prior is a plain ratio.
//
// Priors are exact only at the reference parcel; away from it, v1's additive
// averaging and the fit's multiplicative form diverge. That is acceptable — a
// prior anchors a coefficient, and data moves it wherever data exists.
//
//   node build_priors.js            # -> v1-priors.json
//   node build_priors.js --print    # also dump a readable table

const fs = require('fs');
const path = require('path');
const v1 = require('../backend/src/pricingModel.js');

// Reference level per factor: the most-traded FLOOR-tier value, so the reference
// is both common (stable intercept) and unremarkable (premium 1.0). Holo has
// 1,799 eligible sales, biome 46 has 695. These MUST match REF_ZONE / REF_BIOME
// in fit_hedonic.py or the priors and coefficients mean different things.
const REF_ZONE = 'Holo';
const REF_BIOME = 46;
const REF_LEVEL = 10;               // interior L4-17: no level premium in either model

const REF = {
  tokenId: 0, zone: REF_ZONE, biome: REF_BIOME, level: REF_LEVEL,
  chroma: 'Flow', mode: 'Terrain',
};

const round = (x) => Math.round(x * 10000) / 10000;

/** v1's total floor-multiple for the reference parcel with `overrides` applied. */
function refMultiple(overrides) {
  return v1.estimatePrice({ ...REF, ...overrides }, 1.0).estimatedValue;
}

function build() {
  // Derived from the reference parcel rather than exported, so it stays correct
  // if the chroma table moves. Reference is 1.0, so this IS the Hyper multiple.
  const CHROMA_HYPER = refMultiple({ chroma: 'Hyper' });

  const base = refMultiple({});
  if (Math.abs(base - 1) > 1e-9) {
    // Everything downstream assumes the reference is exactly 1.0, so a floor-tier
    // reference that has picked up a premium is a hard error, not a warning.
    throw new Error(`reference parcel must evaluate to 1.0, got ${base} — REF_ZONE/REF_BIOME are no longer floor-tier`);
  }

  const zone = {};
  for (const z of Object.keys(v1.ZONE_MULTIPLES)) zone[z] = round(refMultiple({ zone: z }));

  const biome = {};
  for (const b of Object.keys(v1.BIOME_MULTIPLES).map(Number)) {
    // Biome 0 + Terrain + Flow triggers v1's chroma override (1.56x), which the
    // fit carries separately as the `biome0_flow` badge. Pricing it here too
    // would count it twice, so evaluate biome 0 on a chroma the override skips
    // and divide that chroma's own multiple back out. The result (3.7) matches
    // biome 73, which shares biome 0's 6.4 multiple but has no override.
    if (b === 0) {
      biome[b] = round(refMultiple({ biome: 0, chroma: 'Hyper' }) / CHROMA_HYPER);
      continue;
    }
    biome[b] = round(refMultiple({ biome: b }));
  }

  // Only the extremes get a dummy in the fit; interior L4-17 pool into the baseline.
  const level = {};
  for (const l of [1, 2, 3, 18, 19, 20]) level[l] = round(refMultiple({ level: l }));

  // Badges are interaction terms, so a reference-parcel ratio would double-count
  // the underlying zone/biome coefficient. Take v1's premium directly instead.
  const badge = {
    mesa: v1.TRAIT_PREMIUMS['Mesa'],
    matrix: v1.TRAIT_PREMIUMS['Matrix'],
    heartbeat: v1.TRAIT_PREMIUMS['Heartbeat'],
    gm: v1.TRAIT_PREMIUMS['gm'],
    // Not in TRAIT_PREMIUMS: biome 0 + Flow is applied as a chroma override in
    // estimatePrice. Recover it as the ratio between the Flow and non-Flow paths.
    biome0_flow: round(refMultiple({ biome: 0 }) / refMultiple({ biome: 0, chroma: 'Hyper' })
                       * CHROMA_HYPER),
  };

  return {
    meta: {
      built: new Date().toISOString(),
      source: 'backend/src/pricingModel.js v' + v1.PRICING_MODEL_VERSION,
      ref_zone: REF_ZONE, ref_biome: REF_BIOME, ref_level: REF_LEVEL,
      note: 'Floor-multiple of a reference parcel varying one trait at a time. '
          + 'Reference parcel = 1.0, so each value is a ratio directly comparable '
          + 'to a fitted coefficient. Badges are v1 premiums (interaction terms).',
    },
    zone, biome, level, badge,
  };
}

function main() {
  const priors = build();
  const out = path.join(__dirname, 'v1-priors.json');
  fs.writeFileSync(out, JSON.stringify(priors, null, 2));

  const nz = Object.keys(priors.zone).length, nb = Object.keys(priors.biome).length;
  console.log(`Wrote ${out}`);
  console.log(`  reference parcel: ${REF_ZONE} / biome ${REF_BIOME} / L${REF_LEVEL} / Flow / Terrain = 1.0x`);
  console.log(`  ${nz} zones, ${nb} biomes, ${Object.keys(priors.level).length} extreme levels, ${Object.keys(priors.badge).length} badges`);

  if (process.argv.includes('--print')) {
    const top = Object.entries(priors.zone).sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log('\n  top zone priors: ' + top.map(([k, v]) => `${k} ${v}x`).join(', '));
    console.log('  level priors:    ' + Object.entries(priors.level).map(([k, v]) => `L${k} ${v}x`).join(', '));
    console.log('  badge priors:    ' + Object.entries(priors.badge).map(([k, v]) => `${k} ${v}x`).join(', '));
    console.log('  biome 0 prior:   ' + priors.biome[0] + 'x  (biome 73 = ' + priors.biome[73] + 'x, same 6.4 multiple)');
  }
}

main();
