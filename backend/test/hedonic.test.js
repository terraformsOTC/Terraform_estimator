// Structural guarantees of the hedonic model that a refit must never break. The
// daily refit ships unattended, so these run against whatever coefficients are
// committed, not against fixed numbers.
const test = require('node:test');
const assert = require('node:assert');
const { estimateHedonic, ASK_PREMIUM } = require('../src/hedonicModel');
const { snapshotTraits } = require('../src/snapshotTraits');
const coeffs = require('../src/pricing-v2-coeffs.json');
const snapshot = require('../src/minted-traits.json');

const FLOOR = 0.25;
const all = snapshot.map((rec) => snapshotTraits(rec));

test('every minted parcel prices, with bid <= ask', () => {
  const bad = [];
  for (const t of all) {
    const e = estimateHedonic(t, FLOOR);
    if (!(e.off > 0 && e.on > 0 && e.off <= e.on)) bad.push(t.tokenId);
  }
  assert.deepStrictEqual(bad, [], `parcels with a missing or inverted range: ${bad.slice(0, 10)}`);
});

test('the ask premium is a real premium', () => {
  assert.ok(ASK_PREMIUM > 1 && ASK_PREMIUM < 1.5, `ask premium ${ASK_PREMIUM}`);
});

test('fitted parcel flags replace the v1 premiums rather than stacking on them', () => {
  const extra = coeffs.money_sword_on.multipliers.extra;
  if (!extra) return; // pre-2.2 coefficients carry v1 premiums instead
  const plain = all.find((t) => t.mode === 'Terrain' && t.zone === 'Holo' && !t.isOneOfOne
    && !t.isS0 && !t.specialType && t.chroma === 'Flow');
  assert.ok(plain, 'a plain Holo parcel exists in the snapshot');
  const base = estimateHedonic(plain, FLOOR).on;
  for (const [key, trait] of [['one_of_one', { isOneOfOne: true }], ['s0', { isS0: true }], ['spine', { specialType: 'Spine' }]]) {
    const got = estimateHedonic({ ...plain, ...trait }, FLOOR).on / base;
    assert.ok(Math.abs(got - extra[key]) < 0.01, `${key}: priced x${got.toFixed(3)}, fitted x${extra[key]}`);
  }
});

test('a Daydream parcel does not carry its full biome premium', () => {
  const table = coeffs.money_sword_on.multipliers.mode_biome?.DDTF;
  if (!table) return;
  const terrain = { tokenId: 0, zone: 'Holo', biome: 0, level: 10, chroma: 'Hyper', mode: 'Terrain',
    specialType: null, isOneOfOne: false, isS0: false, isGodmode: false, isLith0like: false, isGm: false, mysteryValue: 40000 };
  const daydream = { ...terrain, mode: 'Daydream' };
  const ratio = estimateHedonic(daydream, FLOOR).on / estimateHedonic(terrain, FLOOR).on;
  const ddtf = coeffs.money_sword_on.multipliers.mode.DDTF;
  assert.ok(Math.abs(ratio - ddtf * table['0']) < 0.01, `biome-0 Daydream/Terrain ratio ${ratio}`);
  assert.ok(table['0'] < 1, 'biome 0 is discounted in Daydream');
  assert.strictEqual(table['46'], 1, 'the reference biome carries no discount');
});

test('Tier-2 parcels collapse to one v1 price', () => {
  for (const t of all.filter((x) => x.isGodmode || ['X-Seed', 'Y-Seed', 'Lith0', 'Plague'].includes(x.specialType))) {
    const e = estimateHedonic(t, FLOOR);
    assert.strictEqual(e.tier, 'tier2');
    assert.strictEqual(e.off, e.on);
  }
});
