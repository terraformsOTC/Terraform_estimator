// The live floor (security scan F3): fallback source, retry backoff, age limit.
const test = require('node:test');
const assert = require('node:assert');
const { createFloorSource } = require('../src/floorPrice');

const MIN = 60 * 1000;
function setup({ alchemy, opensea }) {
  let t = 1_000_000;
  const calls = { alchemy: 0, opensea: 0 };
  const live = [];
  const src = createFloorSource({
    sources: [
      { name: 'alchemy', fetch: async () => { calls.alchemy++; return alchemy(); } },
      { name: 'opensea', fetch: async () => { calls.opensea++; return opensea(); } },
    ],
    fallbackPrice: 0.2,
    now: () => t,
    onLive: (time, price, source) => live.push({ time, price, source }),
    log: { warn() {} },
  });
  return { src, calls, live, advance: (ms) => { t += ms; } };
}
const fail = () => { throw new Error('down'); };

test('Alchemy answers: live, reused for the TTL', async () => {
  const s = setup({ alchemy: () => 0.25, opensea: () => 0.3 });
  const a = await s.src.get();
  assert.deepStrictEqual([a.price, a.isLive, a.source], [0.25, true, 'alchemy']);
  s.advance(4 * MIN);
  await s.src.get();
  assert.strictEqual(s.calls.alchemy, 1, 'served from cache inside the TTL');
  assert.strictEqual(s.calls.opensea, 0);
  assert.strictEqual(s.live.length, 1);
});

test('Alchemy down: OpenSea\'s own floor, still live', async () => {
  const s = setup({ alchemy: fail, opensea: () => 0.21 });
  const a = await s.src.get();
  assert.deepStrictEqual([a.price, a.isLive, a.source, a.refreshFailing], [0.21, true, 'opensea', false]);
});

test('an invalid price counts as a failure (no zero, NaN or non-number floor)', async () => {
  const s = setup({ alchemy: () => 0, opensea: () => 0.22 });
  assert.strictEqual((await s.src.get()).source, 'opensea');
  const s2 = setup({ alchemy: () => 'x', opensea: () => NaN });
  const b = await s2.src.get();
  assert.deepStrictEqual([b.price, b.isLive, b.source], [0.2, false, 'fallback']);
});

test('both down: last floor served, one retry a minute, not one per request', async () => {
  let up = true;
  const s = setup({ alchemy: () => (up ? 0.25 : fail()), opensea: () => (up ? 0.25 : fail()) });
  await s.src.get();
  up = false;
  s.advance(6 * MIN);                       // past the TTL: refresh fails
  const a = await s.src.get();
  assert.deepStrictEqual([a.price, a.isLive, a.refreshFailing], [0.25, true, true]);
  const before = s.calls.alchemy;
  for (let i = 0; i < 20; i++) { s.advance(1000); await s.src.get(); }   // 20 s of requests
  assert.strictEqual(s.calls.alchemy, before, 'no retries inside the backoff');
  s.advance(60 * 1000);
  await s.src.get();
  assert.strictEqual(s.calls.alchemy, before + 1, 'one retry once the backoff has passed');
});

test('after two hours without a refresh the floor is no longer live', async () => {
  let up = true;
  const s = setup({ alchemy: () => (up ? 0.25 : fail()), opensea: fail });
  await s.src.get();
  up = false;
  s.advance(119 * MIN);
  assert.strictEqual((await s.src.get()).isLive, true);
  s.advance(2 * MIN);
  const a = await s.src.get();
  assert.deepStrictEqual([a.price, a.isLive, a.source], [0.25, false, 'alchemy'], 'the last real floor, marked not live');
  up = true;
  s.advance(MIN);
  const b = await s.src.get();
  assert.deepStrictEqual([b.isLive, b.refreshFailing], [true, false], 'recovers on the next good refresh');
});

test('never refreshed: the hardcoded fallback, not live', async () => {
  const s = setup({ alchemy: fail, opensea: fail });
  const a = await s.src.get();
  assert.deepStrictEqual([a.price, a.isLive, a.source, a.fetchedAt], [0.2, false, 'fallback', null]);
});

test('concurrent requests share one refresh', async () => {
  let resolve;
  const s = setup({ alchemy: () => new Promise((r) => { resolve = r; }), opensea: () => 0.3 });
  const all = Promise.all([s.src.get(), s.src.get(), s.src.get()]);
  await new Promise((r) => setImmediate(r));
  resolve(0.24);
  const res = await all;
  assert.strictEqual(s.calls.alchemy, 1);
  assert.ok(res.every((r) => r.price === 0.24));
});
