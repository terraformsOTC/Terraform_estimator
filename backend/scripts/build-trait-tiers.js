#!/usr/bin/env node
// Builds src/trait-tiers.json — the desirability tier shown on every zone and
// biome badge, derived from two measurements (the rubric on /glossary):
//
//   premium   — the fitted multiple for the trait in the live hedonic model
//               (pricing-v2-coeffs.json, prior-blended), i.e. what a parcel
//               carrying it sells for against an otherwise identical common
//               parcel (Holo / biome 46, Terrain, mid-level).
//   scarcity  — how many of the minted parcels carry it (minted-traits.json).
//
//   Mythical  premium >= 2.5x, OR <= 25 parcels with < 30 sales (too scarce to
//             have traded enough to measure, so scarcity stands in for price)
//   Rare      premium >= 1.3x AND <= 100 parcels
//   Premium   premium >= 1.1x
//   Uncommon  below that, and fewer than 2% of minted parcels carry it
//   Floor     below that, and 2% or more carry it
//
// Deliberately a committed snapshot, not computed at load: the model refits
// nightly and traits sitting on a boundary (biome 12 is 1.30x) would otherwise
// flip badges from one day to the next. Re-run by hand when you want the tiers
// to catch up with the market, and review the diff before committing:
//
//   cd backend && node scripts/build-trait-tiers.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const coeffs = require(path.join(SRC, 'pricing-v2-coeffs.json'));
const minted = require(path.join(SRC, 'minted-traits.json'));

const RULES = {
  mythicalPremium: 2.5,
  mythicalMaxParcels: 25,
  mythicalMaxSales: 30,
  rarePremium: 1.3,
  rareMaxParcels: 100,
  premiumPremium: 1.1,
  commonShare: 0.02,
};

// The ask-side fit; the two fits share trait multipliers, only the level differs.
const fit = coeffs.money_sword_on;
const salesFor = {};
for (const a of fit.prior_audit) salesFor[`${a.kind}:${a.name}`] = a.n;

const counts = { zone: {}, biome: {} };
for (const p of minted) {
  if (p.zone) counts.zone[p.zone] = (counts.zone[p.zone] || 0) + 1;
  if (p.biome != null) counts.biome[p.biome] = (counts.biome[p.biome] || 0) + 1;
}
const commonMin = Math.ceil(minted.length * RULES.commonShare);

function tierFor(premium, parcels, sales) {
  if (premium >= RULES.mythicalPremium) return 'Mythical';
  if (parcels <= RULES.mythicalMaxParcels && sales < RULES.mythicalMaxSales) return 'Mythical';
  if (premium >= RULES.rarePremium && parcels <= RULES.rareMaxParcels) return 'Rare';
  if (premium >= RULES.premiumPremium) return 'Premium';
  return parcels >= commonMin ? 'Floor' : 'Uncommon';
}

const out = {
  built: new Date().toISOString(),
  model: coeffs.meta.built,
  minted: minted.length,
  rules: { ...RULES, commonMinParcels: commonMin },
  zone: {},
  biome: {},
};
for (const kind of ['zone', 'biome']) {
  const multipliers = fit.multipliers[kind];
  for (const name of Object.keys(counts[kind]).sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }))) {
    // The reference trait (Holo, biome 46) is the model's 1.0 and has no row.
    const premium = multipliers[name] ?? 1;
    const parcels = counts[kind][name];
    const sales = salesFor[`${kind}:${name}`] ?? null;
    out[kind][name] = {
      tier: tierFor(premium, parcels, sales ?? Infinity),
      premium: Math.round(premium * 100) / 100,
      parcels,
      sales,
    };
  }
}

const dest = path.join(SRC, 'trait-tiers.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
const tally = kind => Object.values(out[kind]).reduce((t, r) => ((t[r.tier] = (t[r.tier] || 0) + 1), t), {});
console.log(`wrote ${path.relative(process.cwd(), dest)}`);
console.log('zones ', tally('zone'));
console.log('biomes', tally('biome'));
