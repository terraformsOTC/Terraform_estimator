// Collection helper: set goals agree with detectSets, custom goals validate and
// expand, coverage skips the collector's own listings, and the shopping list
// buys the cheapest coverage within a budget.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRubric, evaluate, shoppingList, catalog, RubricError } = require('../src/collectionHelper');
const { detectSets, ZONE_MULTIPLES, BIOME_MULTIPLES } = require('../src/pricingModel');

let nextId = 1;
const parcel = (t = {}) => ({
  tokenId: t.tokenId ?? nextId++,
  traits: {
    zone: 'Alto', biome: 1, level: 5, chroma: 'Flow', mode: 'Terrain', specialType: null,
    isOneOfOne: false, isGodmode: false, isS0: false, isLith0like: false, isGm: false, mysteryValue: 50000,
    ...t,
  },
});
const listing = (price, t = {}, extra = {}) => ({ ...parcel(t), price, model: extra.model ?? price, discount: 0, seller: extra.seller ?? '0xseller' });

test('every set goal agrees with detectSets on what completes it', () => {
  const zones = Object.keys(ZONE_MULTIPLES);
  const biomes = Object.keys(BIOME_MULTIPLES).map(Number);
  const owned = [
    ...zones.map((zone, i) => parcel({ zone, biome: biomes[i % biomes.length], level: (i % 20) + 1 })),
    parcel({ specialType: 'X-Seed' }), parcel({ specialType: 'Y-Seed' }), parcel({ specialType: 'Plague' }),
    parcel({ specialType: 'Lith0' }), parcel({ specialType: 'Spine' }), parcel({ mode: 'Origin Terraform', biome: 0 }),
  ];
  const groups = buildRubric({ presets: catalog().presets.filter(p => p.category === 'sets').map(p => p.id) });
  const res = evaluate({ groups, owned, universe: owned, listings: [], ownWallets: new Set() });
  const fromDetect = new Map(detectSets(owned.map(o => o.traits)).map(s => [s.name, s]));
  for (const g of res.groups) {
    const s = fromDetect.get(g.label);
    assert.ok(s, `no detectSets entry for ${g.label}`);
    assert.equal(g.met === g.total, s.completed, `${g.label}: helper ${g.met}/${g.total}, detectSets completed=${s.completed}`);
    assert.equal(g.total - g.met, s.missingCount, `${g.label} missing count`);
  }
});

test('custom goals validate their fields and values', () => {
  assert.throws(() => buildRubric({ custom: [{ where: { colour: 'red' } }] }), RubricError);
  assert.throws(() => buildRubric({ custom: [{ where: { chroma: 'Neon' } }] }), RubricError);
  assert.throws(() => buildRubric({ custom: [{}] }), RubricError);
  assert.throws(() => buildRubric({ custom: [{ each: 'biome', where: { biome: 3 } }] }), RubricError);
  assert.throws(() => buildRubric({ presets: ['set:nope'] }), RubricError);
  assert.throws(() => buildRubric({ custom: Array(13).fill({ where: { chroma: 'Pulse' } }) }), RubricError);
  const [g] = buildRubric({ custom: [{ each: 'chroma', where: { zone: 'Alto' } }] });
  assert.equal(g.targets.length, 4);
  assert.equal(g.label, 'Every chroma · Alto');
});

test('custom "each" goals leave out combinations no parcel has', () => {
  const universe = [parcel({ chroma: 'Pulse', biome: 3 }), parcel({ chroma: 'Pulse', biome: 4 }), parcel({ chroma: 'Flow', biome: 5 })];
  const groups = buildRubric({ custom: [{ each: 'biome', where: { chroma: 'Pulse' } }] });
  const res = evaluate({ groups, owned: [universe[0]], universe, listings: [], ownWallets: new Set() });
  const g = res.groups[0];
  assert.equal(g.total, 2);           // biomes 3 and 4 exist in Pulse
  assert.equal(g.met, 1);
  assert.equal(g.nonexistent, 90);    // the other 90 biomes never occur in Pulse here
});

test('coverage reports supply, skips the collector\'s own listings, and lists the cheapest', () => {
  const owned = [parcel({ chroma: 'Flow' })];
  const universe = [...owned, parcel({ chroma: 'Hyper' }), parcel({ chroma: 'Hyper' }), parcel({ chroma: 'Pulse' })];
  const listings = [
    listing(0.9, { chroma: 'Hyper' }),
    listing(0.5, { chroma: 'Hyper' }, { seller: '0xMINE' }), // their own: never suggested
    listing(0.7, { chroma: 'Hyper' }),
  ];
  const res = evaluate({ groups: buildRubric({ presets: ['chroma'] }), owned, universe, listings, ownWallets: new Set(['0xmine']) });
  const hyper = res.groups[0].targets.find(t => t.id === 'chroma:Hyper');
  assert.equal(hyper.supply, 2);
  assert.equal(hyper.listed, 2);
  assert.deepEqual(hyper.cheapest.map(c => c.price), [0.7, 0.9]);
  const flow = res.groups[0].targets.find(t => t.id === 'chroma:Flow');
  assert.equal(flow.met, true);
  assert.equal(flow.cheapest, null);
  // A preset keeps every target, even one with no parcel in this universe (Plague).
  assert.equal(res.groups[0].total, 4);
  assert.equal(res.groups[0].targets.find(t => t.id === 'chroma:Plague').supply, 0);
});

test('the shopping list prefers one parcel that fills several goals over two singles', () => {
  const unmet = buildRubric({ presets: ['chroma', 'mode'] })
    .flatMap(g => g.targets)
    .filter(t => ['chroma:Hyper', 'mode:Daydream'].includes(t.id));
  const market = [
    listing(0.3, { chroma: 'Hyper' }),
    listing(0.3, { mode: 'Daydream' }),
    listing(0.5, { chroma: 'Hyper', mode: 'Daydream' }),
  ];
  const plan = shoppingList(unmet, market);
  assert.equal(plan.picks.length, 1);
  assert.equal(plan.picks[0].price, 0.5);
  assert.equal(plan.filled, 2);
});

test('the shopping list respects the budget, max price and premium over model', () => {
  const unmet = buildRubric({ presets: ['chroma'] }).flatMap(g => g.targets).filter(t => t.id !== 'chroma:Flow');
  const market = [
    listing(0.4, { chroma: 'Pulse' }, { model: 0.5 }),
    listing(1.2, { chroma: 'Hyper' }, { model: 1.0 }),   // above model
    listing(3.0, { chroma: 'Plague' }, { model: 4.0 }),
  ];
  let plan = shoppingList(unmet, market, { budget: 1.0 });
  assert.deepEqual(plan.picks.map(p => p.price), [0.4]);
  assert.equal(plan.unfilledOverBudget, 2);

  plan = shoppingList(unmet, market, { maxPremium: 0 });          // at or below model
  assert.deepEqual(plan.picks.map(p => p.price).sort(), [0.4, 3.0]);
  assert.equal(plan.unfilledNoListing, 1);

  plan = shoppingList(unmet, market, { maxPremium: 0.25 });       // up to 25% over: Hyper qualifies
  assert.equal(plan.picks.length, 3);

  plan = shoppingList(unmet, market, { maxPrice: 2 });
  assert.deepEqual(plan.picks.map(p => p.price).sort(), [0.4, 1.2]);
});

test('the wishlist marks every listing that fills an unmet goal, at any price, with the goals it fills', () => {
  const groups = buildRubric({ presets: ['set:full-zone', 'set:polychrome-set'], custom: [{ each: 'biome', where: { chroma: 'Pulse' } }] });
  const universe = [parcel({ zone: 'Shahra', biome: 3, chroma: 'Pulse' }), parcel({ zone: 'Alto', biome: 4 })];
  const res = evaluate({
    groups,
    owned: [parcel({ zone: 'Alto' })],
    universe,
    listings: [
      listing(50, { tokenId: 9001, zone: 'Shahra', biome: 3, chroma: 'Pulse' }, { model: 1 }), // far over model: still marked
      listing(1, { tokenId: 9002, zone: 'Alto', biome: 4 }),                                    // Alto is already held
      listing(2, { tokenId: 9003, zone: 'Shahra' }, { seller: '0xMINE' }),                    // their own listing
    ],
    ownWallets: new Set(['0xmine']),
    options: { maxPrice: 1 },
  });
  assert.equal(res.wishlist.length, 1);
  const [w] = res.wishlist;
  assert.equal(w.tokenId, 9001);
  assert.equal(w.price, 50);
  const shahra = w.fills.find(f => f.id === 'zone:Shahra');
  assert.deepEqual(shahra.groups, ['Full zone', 'Polychrome set']);
  const pulse = w.fills.find(f => f.label === 'Biome 3');
  assert.deepEqual(pulse.groups, ['Every biome · Pulse']);
  assert.equal(res.shoppingList.picks.length, 0); // the list keeps its price limits
});

test('a target shared by two groups is filled once', () => {
  const groups = buildRubric({ presets: ['set:full-zone', 'set:polychrome-set'] });
  const res = evaluate({ groups, owned: [], universe: [parcel({ zone: 'Shahra' })], listings: [listing(1, { zone: 'Shahra' })], ownWallets: new Set() });
  assert.equal(res.shoppingList.picks.length, 1);
  assert.deepEqual(res.shoppingList.picks[0].fills, ['zone:Shahra']);
});
