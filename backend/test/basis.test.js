// Pins the sales-feed comparison protocol. These rules have been reworked three
// times; the failure mode each time was a case nobody thought to check, so the
// edge cases below matter as much as the three headline rules.
const test = require('node:test');
const assert = require('node:assert');
const { decideBasis, PREMIUM_OVER_FLOOR } = require('../src/sales');

const near = (got, want) => assert.ok(
  want === null ? got === null : Math.abs(got - want) < 0.0005,
  `expected ${want}, got ${got}`);

// One estimate does both jobs: it decides premium AND is what the percentage is
// measured against. Passing two different numbers is what produced #884. The
// caller always supplies the ASK-side estimate (modelOn) — never the bid side,
// which carries the distortion of sellers dumping into WETH bids.
const c = (salePrice, saleFloor, estimate) =>
  decideBasis({ salePrice, saleFloor, estimate });

test('rule 1 — below floor, plain parcel, measured against floor', () => {
  const r = c(0.180, 0.204, 0.177);                 // #2427, 2026-09-18
  assert.strictEqual(r.basis, 'floor');
  assert.strictEqual(r.isPremium, false);
  near(r.vsReference, -0.1176);
});

test('rule 2 — below floor, premium parcel, measured against estimate', () => {
  const r = c(0.203, 0.204, 0.319);                 // #2299, 2026-09-18
  assert.strictEqual(r.basis, 'estimate');
  assert.strictEqual(r.isPremium, true);
  near(r.vsReference, -0.3636);
});

test('rule 3 — at or above floor, measured against estimate', () => {
  const r = c(0.750, 0.204, 1.068);                 // #295, 2026-09-18
  assert.strictEqual(r.basis, 'estimate');
  near(r.vsReference, -0.2978);
});

test('rule 3 — a sale exactly at floor is "at or above", not below', () => {
  assert.strictEqual(c(0.204, 0.204, 0.177).basis, 'estimate');
});

test('premium threshold is exclusive at exactly 1 + PREMIUM_OVER_FLOOR', () => {
  const at = 0.200 * (1 + PREMIUM_OVER_FLOOR);
  assert.strictEqual(c(0.180, 0.200, at).isPremium, false, 'exactly at the line is plain');
  assert.strictEqual(c(0.180, 0.200, at + 1e-6).isPremium, true, 'a hair over is premium');
});

test('#884 — a below-floor sale never reads as a premium', () => {
  // Sold 0.200 under a 0.204 floor. It was called premium on its ask-side
  // estimate (0.216) and then measured against its bid-side estimate (0.188),
  // reading +6.4%. One estimate does both jobs now, so it cannot recur.
  // 0.216 is its ask-side estimate; the +6.4% came from measuring against the
  // 0.188 bid-side one. Ask-anchored it is premium, and still a discount.
  const r = c(0.200, 0.204, 0.216);
  assert.strictEqual(r.isPremium, true);
  assert.strictEqual(r.basis, 'estimate');
  near(r.vsReference, -0.0741);
});

test('INVARIANT — no sale below floor can ever show a premium', () => {
  // The guarantee is arithmetic: premium requires estimate > floor * 1.05, and a
  // below-floor sale is under floor, so it is necessarily under that estimate.
  // Swept rather than argued, because this is the rule that keeps getting broken.
  let checked = 0;
  for (let floor = 0.05; floor <= 2.0; floor += 0.05) {
    for (let pf = 0.01; pf < 1.0; pf += 0.01) {          // sale as a fraction of floor
      const salePrice = floor * pf;
      for (let ef = 0.1; ef <= 6.0; ef += 0.1) {         // estimate as a multiple of floor
        const r = decideBasis({ salePrice, saleFloor: floor, estimate: floor * ef });
        assert.ok(r.vsReference <= 0,
          `below-floor sale showed +${(r.vsReference * 100).toFixed(2)}% ` +
          `(sale ${salePrice}, floor ${floor}, estimate ${floor * ef}, basis ${r.basis})`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100000, `expected a wide sweep, only checked ${checked}`);
});

test('INVARIANT — the premium test and the reference are the same number', () => {
  // If a sale is measured against the estimate, that estimate is what decided
  // premium. Mismatching the two is the #884 bug.
  for (const [p, f, e] of [[0.200, 0.204, 0.188], [0.203, 0.204, 0.319], [0.750, 0.204, 1.068]]) {
    const r = decideBasis({ salePrice: p, saleFloor: f, estimate: e });
    if (r.basis === 'estimate' && r.reference !== f) assert.strictEqual(r.reference, e);
    if (r.isPremium) assert.ok(e > f * (1 + PREMIUM_OVER_FLOOR));
  }
});

test('no hedonic estimate — below floor falls back to the floor', () => {
  const r = c(0.180, 0.204, 0.21);                  // estimate is v1's
  assert.strictEqual(r.basis, 'floor');
  assert.strictEqual(r.isPremium, false);
});

test('no hedonic estimate — at or above floor uses whatever estimate exists', () => {
  const r = c(0.250, 0.204, 0.300);
  assert.strictEqual(r.basis, 'estimate');
  near(r.vsReference, -0.1667);
});

test('no floor — cannot be "below floor", so the estimate is used', () => {
  assert.strictEqual(c(0.180, 0, 0.177).basis, 'estimate');
});

test('unpriceable — falls back to the floor rather than reporting nothing', () => {
  const r = c(0.180, 0.204, null);
  assert.strictEqual(r.basis, 'floor');
  near(r.vsReference, -0.1176);
});

test('nothing priceable at all — reports no comparison rather than a wrong one', () => {
  const r = c(0.180, 0, null);
  assert.strictEqual(r.basis, null);
  assert.strictEqual(r.reference, null);
  assert.strictEqual(r.vsReference, null);
});

test('a zero or negative reference never divides', () => {
  for (const f of [0, -1]) for (const e of [0, null, -1]) {
    const r = decideBasis({ salePrice: 0.18, saleFloor: f, estimate: e });
    assert.strictEqual(r.vsReference, null);
  }
});

test('INVARIANT — a valuable parcel dumped into a bid shows its full discount', () => {
  // The reason the bid side is excluded. A parcel worth 0.320 listed, whose
  // bid-side estimate is 0.278, sold at 0.177 into a WETH bid. Anchored to the
  // bid it reads -36.3%; anchored to the ask, -44.7%. The larger figure is the
  // true one — the seller accepted a bid, they did not revalue the parcel.
  const asAsk = decideBasis({ salePrice: 0.177, saleFloor: 0.204, estimate: 0.320 });
  const asBid = decideBasis({ salePrice: 0.177, saleFloor: 0.204, estimate: 0.278 });
  near(asAsk.vsReference, -0.4469);
  assert.ok(asAsk.vsReference < asBid.vsReference,
    'the ask anchor must report the deeper discount, not flatter it');
});
