// Collection helper: set goals agree with detectSets, custom goals validate and
// expand, coverage skips the collector's own listings, and the shopping list
// buys the cheapest coverage within a budget.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRubric, evaluate, shoppingList, catalog, bladeOf, glyphSetOf, RubricError } = require('../src/collectionHelper');
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

test("another collector's parcels are marked the same way, listed or not", () => {
  const groups = buildRubric({ presets: ['set:full-zone'] });
  const universe = [parcel({ zone: 'Shahra' }), parcel({ zone: 'Alto' })];
  const res = evaluate({
    groups,
    owned: [parcel({ tokenId: 9100, zone: 'Alto' })],
    universe,
    listings: [],
    ownWallets: new Set(),
    held: [
      parcel({ tokenId: 9101, zone: 'Shahra' }), // a gap
      parcel({ tokenId: 9102, zone: 'Alto' }),   // already held by the group
      { tokenId: 9100, traits: parcel({ zone: 'Shahra' }).traits }, // the group's own parcel
      { tokenId: 9103, traits: null },           // traits not loaded yet
    ],
  });
  assert.deepEqual(res.held.map(h => h.tokenId), [9101]);
  assert.deepEqual(res.held[0].fills.map(f => [f.id, f.groups]), [['zone:Shahra', ['Full zone']]]);
  assert.deepEqual(evaluate({ groups, owned: [], universe, listings: [], ownWallets: new Set() }).held, []);
});

test('special traits can be picked one at a time into one group', () => {
  const [g] = buildRubric({ presets: ['trait:mesa', 'trait:penthouse', 'trait:mesa'] });
  assert.equal(g.id, 'specials');
  assert.deepEqual(g.targets.map(t => t.id), ['trait:mesa', 'trait:penthouse']);
  const all = buildRubric({ presets: ['trait:mesa', 'specials', 'trait:gm'] });
  assert.equal(all.length, 1);
  assert.equal(all[0].targets.length, catalog().fields.trait.length);
  assert.throws(() => buildRubric({ presets: ['trait:origin-daydream'] }), RubricError); // a mode, not a special
  assert.throws(() => buildRubric({ presets: ['trait:nope'] }), RubricError);
  const res = evaluate({ groups: [g], owned: [parcel({ level: 20 })], universe: [parcel({ level: 20 }), parcel({ level: 1 })], listings: [], ownWallets: new Set() });
  assert.equal(res.groups[0].met, 1);
  assert.equal(res.groups[0].total, 2);
  assert.ok(catalog().fields.trait.every(t => ['special', 'visual', 'level'].includes(t.group)));
});

test('a target shared by two groups is filled once', () => {
  const groups = buildRubric({ presets: ['set:full-zone', 'set:polychrome-set'] });
  const res = evaluate({ groups, owned: [], universe: [parcel({ zone: 'Shahra' })], listings: [listing(1, { zone: 'Shahra' })], ownWallets: new Set() });
  assert.equal(res.shoppingList.picks.length, 1);
  assert.deepEqual(res.shoppingList.picks[0].fills, ['zone:Shahra']);
});

test('catalog combos hold only the combinations some parcel has', () => {
  const universe = [
    parcel({ zone: 'Holo', biome: 3, chroma: 'Plague' }),
    parcel({ zone: 'Holo', biome: 3, chroma: 'Plague' }),                  // the same combination: one row
    parcel({ zone: 'Shahra', biome: 7, level: 20, specialType: 'Spine' }),
    { tokenId: 9200, traits: null },                                       // traits not loaded yet
  ];
  const { fields, combos } = catalog(universe);
  const read = row => Object.fromEntries(combos.fields.map((f, i) => [f,
    f === 'trait' ? fields.trait.filter((_, b) => row[i] & (1 << b)).map(t => t.id) : fields[f][row[i]]]));
  assert.deepEqual(combos.rows.map(read), [
    { zone: 'Holo', biome: 3, level: 5, chroma: 'Plague', mode: 'Terrain', trait: [] },
    { zone: 'Shahra', biome: 7, level: 20, chroma: 'Flow', mode: 'Terrain', trait: ['spine', 'penthouse'] },
  ]);
  assert.equal(catalog().combos, undefined); // no parcels given, so no claim about what exists
});

test('blades and origin glyph sets follow the renderer', () => {
  // Blade (biome + seed) % 27 on non-origin parcels up to seed 9950.
  assert.equal(bladeOf(parcel({ biome: 3, seed: 30 }).traits), 6);
  assert.equal(bladeOf(parcel({ biome: 3, seed: 9951 }).traits), null);               // Y-seed: glyphs instead
  assert.equal(bladeOf(parcel({ biome: 3, seed: 30, mode: 'Origin Daydream' }).traits), null);
  assert.equal(bladeOf(parcel({ biome: 3 }).traits), null);                           // no seed known
  // Glyph set seed % 28 on origins up to seed 9000; above, an X-seed (all 28).
  assert.equal(glyphSetOf(parcel({ seed: 61, mode: 'Origin Terraform' }).traits), 5);
  assert.equal(glyphSetOf(parcel({ seed: 9001, mode: 'Origin Daydream' }).traits), null);
  assert.equal(glyphSetOf(parcel({ seed: 61, mode: 'Daydream' }).traits), null);
});

test('picked zones, biomes, levels, blades and glyph sets each make one group', () => {
  const groups = buildRubric({ presets: ['zone:Holo', 'biome:30', 'zone:Shiro', 'level:20', 'blade:6', 'glyph:5', 'zone:Holo'] });
  assert.deepEqual(groups.map(g => [g.id, g.targets.map(t => t.id)]), [
    ['zones', ['zone:Holo', 'zone:Shiro']],
    ['biomes', ['biome:30']],
    ['levels', ['level:20']],
    ['blades', ['blade:6']],
    ['glyphs', ['glyph:5']],
  ]);
  // The "all" preset makes a picked group whole, before or after the picks.
  assert.equal(buildRubric({ presets: ['blade:6', 'blades'] })[0].targets.length, 27);
  assert.equal(buildRubric({ presets: ['glyphs', 'glyph:5'] })[0].targets.length, 28);
  for (const bad of ['zone:Atlantis', 'biome:92', 'level:21', 'blade:27', 'glyph:-1', 'glyph:', 'biome:1.5']) {
    assert.throws(() => buildRubric({ presets: [bad] }), RubricError, bad);
  }
  // A picked zone is the same target as Full zone's: one listing fills both.
  const res = evaluate({
    groups: buildRubric({ presets: ['zone:Holo', 'set:full-zone'] }),
    owned: [], universe: [parcel({ zone: 'Holo' })], listings: [listing(1, { zone: 'Holo' })], ownWallets: new Set(),
  });
  assert.deepEqual(res.wishlist[0].fills.map(f => [f.id, f.groups]), [['zone:Holo', ['Zones', 'Full zone']]]);
});

test('a mode scope counts only parcels in those modes', () => {
  const groups = buildRubric({ presets: ['zone:Holo', 'mode'] });
  const universe = [parcel({ zone: 'Holo', mode: 'Terrain' }), parcel({ zone: 'Holo', mode: 'Daydream' })];
  const owned = [parcel({ zone: 'Holo', mode: 'Daydream' })];
  const listings = [listing(0.5, { zone: 'Holo', mode: 'Daydream' }), listing(0.9, { zone: 'Holo', mode: 'Terrain' })];
  const any = evaluate({ groups, owned, universe, listings, ownWallets: new Set() });
  assert.equal(any.groups[0].met, 1); // the Daydream Holo counts
  const terrain = evaluate({ groups, owned, universe, listings, ownWallets: new Set(), modes: ['Terrain'] });
  assert.deepEqual([terrain.groups[0].met, terrain.groups[0].total], [0, 1]); // it doesn't now
  assert.deepEqual(terrain.wishlist.map(w => w.price), [0.9]);                // only the Terrain listing
  // "Every mode" keeps only the modes in scope; the rest are left out, not unmet.
  assert.deepEqual([terrain.groups[1].total, terrain.groups[1].nonexistent], [1, 4]);
});

test('the wishlist marks only listings within its price against the model', () => {
  const groups = buildRubric({ presets: ['zone:Holo', 'zone:Shiro', 'zone:Cradle'] });
  const listings = [
    listing(0.9, { zone: 'Holo' }, { model: 1 }),    // 10% under
    listing(1.1, { zone: 'Shiro' }, { model: 1 }),   // 10% over
    { ...listing(1, { zone: 'Cradle' }), model: null }, // the model can't price it
  ];
  const marked = wprem => evaluate({ groups, owned: [], universe: [], listings, ownWallets: new Set(), options: { wishlistPremium: wprem } });
  assert.deepEqual(marked(null).wishlist.map(w => w.price), [0.9, 1, 1.1]);
  assert.deepEqual(marked(0.25).wishlist.map(w => w.price), [0.9, 1.1]);
  assert.deepEqual(marked(0).wishlist.map(w => w.price), [0.9]);
  assert.deepEqual(marked(-0.1).wishlist.map(w => w.price), [0.9]);
  assert.equal(marked(-0.2).wishlistCount, 0);
});

test('catalog supply counts each value by mode', () => {
  const { supply } = catalog([
    parcel({ zone: 'Holo', biome: 3, level: 2, seed: 30 }),
    parcel({ zone: 'Holo', biome: 3, level: 2, seed: 61, mode: 'Origin Daydream' }),
  ]);
  assert.deepEqual(supply.modes, ['Terrain', 'Daydream', 'Terraform', 'Origin Daydream', 'Origin Terraform']);
  assert.deepEqual(supply.zone.Holo, [1, 0, 0, 1, 0]);
  assert.deepEqual(supply.blade[6], [1, 0, 0, 0, 0]);
  assert.deepEqual(supply.glyph[5], [0, 0, 0, 1, 0]);
  assert.equal(supply.blade.length + supply.glyph.length, 27 + 28);
});
