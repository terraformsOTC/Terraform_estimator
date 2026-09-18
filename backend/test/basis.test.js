// Pins the sales-feed comparison protocol. These rules have been reworked three
// times; the failure mode each time was a case nobody thought to check, so the
// edge cases below matter as much as the three headline rules.
const test = require('node:test');
const assert = require('node:assert');
const { decideBasis, PREMIUM_OVER_FLOOR } = require('../src/sales');

const near = (got, want) => assert.ok(
  want === null ? got === null : Math.abs(got - want) < 0.0005,
  `expected ${want}, got ${got}`);

// premiumEstimate is modelOn — ask side, before applyOfferFloor.
const c = (salePrice, saleFloor, estimate, premiumEstimate) =>
  decideBasis({ salePrice, saleFloor, estimate, premiumEstimate });

test('rule 1 — below floor, plain parcel, measured against floor', () => {
  const r = c(0.180, 0.204, 0.177, 0.189);          // #2427, 2026-09-18
  assert.strictEqual(r.basis, 'floor');
  assert.strictEqual(r.isPremium, false);
  near(r.vsReference, -0.1176);
});

test('rule 2 — below floor, premium parcel, measured against estimate', () => {
  const r = c(0.203, 0.204, 0.319, 0.319);          // #2299, 2026-09-18
  assert.strictEqual(r.basis, 'estimate');
  assert.strictEqual(r.isPremium, true);
  near(r.vsReference, -0.3636);
});

test('rule 3 — at or above floor, measured against estimate', () => {
  const r = c(0.750, 0.204, 1.068, 1.068);          // #295, 2026-09-18
  assert.strictEqual(r.basis, 'estimate');
  near(r.vsReference, -0.2978);
});

test('rule 3 — a sale exactly at floor is "at or above", not below', () => {
  assert.strictEqual(c(0.204, 0.204, 0.177, 0.189).basis, 'estimate');
});

test('premium threshold is exclusive at exactly 1 + PREMIUM_OVER_FLOOR', () => {
  const at = 0.200 * (1 + PREMIUM_OVER_FLOOR);
  assert.strictEqual(c(0.180, 0.200, 0.183, at).isPremium, false, 'exactly at the line is plain');
  assert.strictEqual(c(0.180, 0.200, 0.183, at + 1e-6).isPremium, true, 'a hair over is premium');
});

test('premium is a property of the parcel, not of the side it settled on', () => {
  // Bid-side fill whose bid estimate (0.191) is under floor but whose ask
  // estimate is over the line. Testing the side-matched value would call this
  // plain; it disagreed on 7 of 50 sales in the 2026-09-18 feed.
  const r = c(0.183, 0.204, 0.191, 0.219);          // #9640
  assert.strictEqual(r.isPremium, true);
  assert.strictEqual(r.basis, 'estimate');
});

test('the offer floor does not make a parcel premium', () => {
  // applyOfferFloor lifted `on` to 0.216 (over the 0.2142 line) but modelOn is
  // 0.203. Liquidity is not a trait.
  assert.strictEqual(c(0.180, 0.204, 0.177, 0.203).isPremium, false);
});

test('no hedonic estimate — below floor falls back to the floor', () => {
  const r = c(0.180, 0.204, 0.21, null);            // estimate is v1's
  assert.strictEqual(r.basis, 'floor');
  assert.strictEqual(r.isPremium, false);
});

test('no hedonic estimate — at or above floor uses whatever estimate exists', () => {
  const r = c(0.250, 0.204, 0.300, null);
  assert.strictEqual(r.basis, 'estimate');
  near(r.vsReference, -0.1667);
});

test('no floor — cannot be "below floor", so the estimate is used', () => {
  assert.strictEqual(c(0.180, 0, 0.177, 0.203).basis, 'estimate');
});

test('premium but unpriceable — falls back to the floor rather than reporting nothing', () => {
  const r = c(0.180, 0.204, null, 0.500);
  assert.strictEqual(r.basis, 'floor');
  near(r.vsReference, -0.1176);
});

test('nothing priceable at all — reports no comparison rather than a wrong one', () => {
  const r = c(0.180, 0, null, null);
  assert.strictEqual(r.basis, null);
  assert.strictEqual(r.reference, null);
  assert.strictEqual(r.vsReference, null);
});

test('a zero or negative reference never divides', () => {
  for (const f of [0, -1]) for (const e of [0, null, -1]) {
    const r = decideBasis({ salePrice: 0.18, saleFloor: f, estimate: e, premiumEstimate: null });
    assert.strictEqual(r.vsReference, null);
  }
});
