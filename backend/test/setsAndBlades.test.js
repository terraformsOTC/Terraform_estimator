// Wallet set chips (detectSets members) and the blade filter (James, 2026-11-10).
const test = require('node:test');
const assert = require('node:assert');
const { detectSets } = require('../src/pricingModel');
const { createSalesHistory } = require('../src/salesHistory');
const { bladeOf } = require('../src/collectionHelper');

const P = [
  { tokenId: 10, zone: 'Alto', biome: 39, level: 5, mode: 'Terrain', specialType: null },
  { tokenId: 11, zone: '[BLOOD]', biome: 26, level: 6, mode: 'Daydream', specialType: null },
  { tokenId: 12, zone: 'Holo', biome: 0, level: 7, mode: 'Terrain', specialType: null },
  { tokenId: 13, zone: 'Holo', biome: 50, level: 8, mode: 'Origin Daydream', specialType: null },
  { tokenId: 14, zone: 'Holo', biome: 50, level: 9, mode: 'Terrain', specialType: 'Plague' },
];
const byName = sets => Object.fromEntries(sets.map(s => [s.name, s]));

test('set members: the parcels that count toward each set', () => {
  const s = byName(detectSets(P, { members: true }));
  assert.deepStrictEqual(s['Chess biomes'].tokenIds, [10, 11]);
  assert.deepStrictEqual(s['Blocky biomes'].tokenIds, [12]);
  assert.deepStrictEqual(s['[DUOTONE]'].tokenIds, [11]);
  assert.deepStrictEqual(s['Polychrome set'].tokenIds, [10, 12, 13, 14]);
  // Grails: a special type, biome 0 or an origin each count.
  assert.deepStrictEqual(s['Grails'].tokenIds, [12, 13, 14]);
  assert.strictEqual(s['Chess biomes'].coversAll, false);
});

test('sets every parcel counts toward report coversAll, no member list', () => {
  const s = byName(detectSets(P, { members: true }));
  for (const name of ['Full level', 'Full zone', 'Full biome']) {
    assert.strictEqual(s[name].coversAll, true, name);
    assert.strictEqual(s[name].tokenIds, null, name);
  }
});

test('without members, detectSets is unchanged (no tokenIds on /collectors)', () => {
  for (const set of detectSets(P)) {
    assert.ok(!('tokenIds' in set) && !('coversAll' in set), set.name);
  }
});

test('bladeOf: (biome + seed) % 27, none for origins or seeds above 9950', () => {
  assert.strictEqual(bladeOf({ mode: 'Terrain', biome: 39, seed: 1000 }), (39 + 1000) % 27);
  assert.strictEqual(bladeOf({ mode: 'Daydream', biome: 0, seed: 9950 }), 9950 % 27);
  assert.strictEqual(bladeOf({ mode: 'Terrain', biome: 0, seed: 9951 }), null);
  assert.strictEqual(bladeOf({ mode: 'Origin Daydream', biome: 5, seed: 100 }), null);
  assert.strictEqual(bladeOf({ mode: 'Terrain', biome: 5, seed: null }), null);
});

test('sales history filters and facets by blade', () => {
  const T = {
    1: { tokenId: 1, zone: 'Alto', biome: 42, level: 10, chroma: 'Flow', mode: 'Terrain', blade: 3 },
    2: { tokenId: 2, zone: 'Holo', biome: 42, level: 17, chroma: 'Pulse', mode: 'Daydream', blade: 7 },
    3: { tokenId: 3, zone: 'Alto', biome: 65, level: 4, chroma: 'Flow', mode: 'Origin Daydream', blade: null },
  };
  const h = createSalesHistory({
    history: {
      exportedAt: '2026-09-24T00:00:00Z',
      currencies: ['ETH'], kinds: ['single'], addresses: ['0xa', '0xb'],
      rows: [[1000, 1, 0.2, 0, 1, 0, 0, 1, '0x01'], [2000, 2, 0.3, 0, 1, 0, 1, 0, '0x02'], [3000, 3, 0.4, 0, 1, 0, 0, 1, '0x03']],
    },
    floorIndex: { days: { '1970-01-01': 0.2 } },
    getSnapshotTraits: id => (T[id] ? { ...T[id], specialType: null, isOneOfOne: false, isS0: false, isGodmode: false } : null),
    floorHistory: () => [],
  });
  assert.strictEqual(h.query({ blade: '3' }).total, 1);
  assert.strictEqual(h.query({ blade: '3,7' }).total, 2);
  assert.strictEqual(h.query({ blade: '3', zone: 'Holo' }).total, 0);
  const facets = h.query({}).facets;
  assert.strictEqual(facets.blade['3'], 1);
  assert.strictEqual(facets.blade['7'], 1);
});
