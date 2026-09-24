// The sales-history feed: filter rule, facet counts, totals, and the live merge.
const test = require('node:test');
const assert = require('node:assert');
const { createSalesHistory, parseFilters } = require('../src/salesHistory');

const T = {
  1: { tokenId: 1, zone: 'Alto', biome: 42, level: 10, chroma: 'Flow', mode: 'Terrain' },
  2: { tokenId: 2, zone: 'Holo', biome: 42, level: 17, chroma: 'Pulse', mode: 'Daydream' },
  3: { tokenId: 3, zone: 'Alto', biome: 65, level: 4, chroma: 'Flow', mode: 'Terrain' },
};
const history = {
  exportedAt: '2026-09-24T00:00:00Z',
  currencies: ['ETH', 'WETH', 'BETH'],
  kinds: ['single', 'sweep', 'bundle'],
  addresses: ['0xa', '0xb', '0xc'],
  // unix, tokenId, price, currency, legs, kind, buyer, seller, tx
  rows: [
    [1000, 1, 0.20, 0, 1, 0, 0, 1, '0x01'],
    [2000, 2, 0.30, 1, 1, 0, 1, 2, '0x02'],
    [3000, 3, 0.90, 0, 2, 2, 2, 0, '0x03'],   // a bundle order: total repeated
    [3000, 1, 0.90, 0, 2, 2, 2, 0, '0x03'],
  ],
};
const make = () => createSalesHistory({
  history,
  floorIndex: { days: { '1970-01-01': 0.2 } },
  getSnapshotTraits: (id) => (T[id] ? { ...T[id], specialType: null, isOneOfOne: false, isS0: false, isGodmode: false } : null),
  floorHistory: () => [],
});

test('newest first, every sale priced at its day’s floor', () => {
  const r = make().query({});
  assert.deepStrictEqual(r.sales.map((s) => s.closingDate), [3000, 3000, 2000, 1000]);
  const single = r.sales.find((s) => s.txHash === '0x01');
  assert.strictEqual(single.floorAtSaleSource, 'index');
  assert.ok(single.estimate > 0);
  assert.strictEqual(single.seller, '0xb');
  assert.strictEqual(single.winner, '0xa');
});

test('OR within an attribute, AND across attributes', () => {
  const h = make();
  assert.strictEqual(h.query({ zone: 'Alto' }).total, 3);
  assert.strictEqual(h.query({ zone: 'Alto,Holo' }).total, 4);
  assert.strictEqual(h.query({ zone: 'Alto', biome: '42' }).total, 2);
  assert.strictEqual(h.query({ zone: 'Alto', mode: 'Daydream' }).total, 0);
});

test('facets count each attribute under the other filters only', () => {
  const r = make().query({ zone: 'Alto' });
  // The zone list still offers Holo, though Holo is not selected.
  assert.deepStrictEqual(r.facets.zone, { Alto: 3, Holo: 1 });
  // Biomes are counted within Alto.
  assert.deepStrictEqual(r.facets.biome, { 42: 2, 65: 1 });
});

test('a bundle order counts once toward volume and never toward over/under', () => {
  const r = make().query({});
  const bundle = r.sales.filter((s) => s.kind === 'bundle');
  assert.strictEqual(bundle.length, 2);
  assert.ok(bundle.every((s) => s.vsReference === null));
  assert.strictEqual(r.summary.volume, 0.2 + 0.3 + 0.9);
});

test('live sales newer than the export merge in once', () => {
  const h = make();
  const live = {
    fetchedAt: 5,
    sales: [
      { txHash: '0x09', tokenId: 2, salePrice: 0.4, currency: 'ETH', closingDate: 4000, traits: T[2], basis: 'estimate', reference: 0.3, vsReference: 0.33 },
      { txHash: '0x02', tokenId: 2, salePrice: 0.3, currency: 'WETH', closingDate: 2000, traits: T[2] },
    ],
  };
  const r = h.query({}, live);
  assert.strictEqual(r.total, 5);
  assert.strictEqual(r.sales[0].source, 'live');
  assert.strictEqual(r.liveSalesAdded, 1);
});

test('pagination and bad input are clamped', () => {
  const h = make();
  assert.strictEqual(h.query({ limit: '2', offset: '1' }).sales.length, 2);
  assert.strictEqual(h.query({ limit: '9999' }).limit, 200);
  assert.strictEqual(h.query({ offset: '-5' }).offset, 0);
  assert.deepStrictEqual(parseFilters({ biome: 'x,42', level: '' }), { biome: new Set([42]) });
});
