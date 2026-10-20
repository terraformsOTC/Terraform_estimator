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
// caller always supplies the ASK-side estimate as the site displayed it (`on`,
// offer floor included) — never the bid side, which carries the distortion of
// sellers dumping into WETH bids.
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

// ─── the estimate itself: what the site displayed when the parcel sold ────────
const { bidAt, computeRecentSales } = require('../src/sales');
const { estimateHedonic, applyOfferFloor } = require('../src/hedonicModel');

test('bidAt — the bid standing then: nearest earlier sample that has one, 72h back', () => {
  const h = [
    { ts: 1000, floor: 0.30 },                 // before bids were recorded
    { ts: 2000, floor: 0.30, bid: 0.25 },
    { ts: 3000, floor: 0.31 },                 // a sample without a bid is skipped
    { ts: 4000, floor: 0.31, bid: 0.27 },
  ];
  assert.strictEqual(bidAt(h, 500), null, 'before any sample');
  assert.strictEqual(bidAt(h, 1500), null, 'before bids were recorded');
  assert.strictEqual(bidAt(h, 2000), 0.25);
  assert.strictEqual(bidAt(h, 3500), 0.25);
  assert.strictEqual(bidAt(h, 4100), 0.27);
  assert.strictEqual(bidAt(h, 4000 + 72 * 3600 + 1), null, 'nothing recorded within 72h');
  assert.strictEqual(bidAt([], 4000), null);
});

// #850, 2026-10-20: in "best terrain parcels listed" at 0.2809354, -10.2% against
// the displayed 0.313 (a 0.27 bid lifting the estimate). It sold at that price and
// the feed read +4.8%, measured against the ask before the offer floor.
const T850 = {
  tokenId: 850, zone: '[MENU]', level: 11, biome: 30, chroma: 'Flow', mode: 'Terrain',
  specialType: null, isOneOfOne: false, isGodmode: false, isS0: false, isLith0like: false,
  isGm: false, mysteryValue: 37082, mysteryOutlier: null,
};
const SALE_850 = { floor: 0.28085, bid: 0.27, price: 0.2809354, ts: 1792505531 };

function feedFor({ offerAt, topOffer }) {
  const { floor, ts } = SALE_850;
  const event = {
    event_type: 'sale', nft: { identifier: '850' }, closing_date: ts,
    payment: { quantity: '280935400000000000', decimals: 18, symbol: 'ETH' },
    transaction: '0x434d', seller: '0xb65a', winner_account: { address: '0x2ee8' },
  };
  return computeRecentSales({
    apiKey: 'k',
    fetchWithRetry: async () => ({ ok: true, json: async () => ({ asset_events: [event] }) }),
    getParcelTraits: async () => T850,
    getFloorPrice: async () => ({ price: floor, isLive: true }),
    floorAt: () => floor,
    offerAt,
    topOffer,
  });
}

test('#850 — a sale reads the same figure its listing did', async () => {
  const { floor, bid, price, ts } = SALE_850;
  // Scored as computeAllListings scores a listing: against the displayed ask.
  const shown = applyOfferFloor(estimateHedonic(T850, floor), bid).on;
  const listingDiscount = (shown - price) / shown;
  assert.ok(shown > estimateHedonic(T850, floor).on, 'the case needs the offer floor to bind');

  // The offer standing now differs; the one standing at the sale is what counts.
  const { sales: [sale] } = await feedFor({ offerAt: (t) => (t === ts ? bid : null), topOffer: 0.29 });
  assert.strictEqual(sale.reference, shown);
  near(sale.vsReference, -listingDiscount);
  assert.ok(sale.vsReference < 0, 'sold at the discount it was listed at');
});

test('no bid recorded within 72h of a sale — the offer standing now stands in', async () => {
  const { floor, bid } = SALE_850;
  const { sales: [sale] } = await feedFor({ offerAt: () => null, topOffer: bid });
  assert.strictEqual(sale.reference, applyOfferFloor(estimateHedonic(T850, floor), bid).on);
});
