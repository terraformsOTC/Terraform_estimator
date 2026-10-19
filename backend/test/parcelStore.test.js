// Parcel store: decoding, read sharing, refresh, warm-up, and the change-event
// poller. Offline — the RPC is a stub.

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { ethers } = require('ethers');
const { ParcelStore, decodeTokenURI, parcelIdsFromLogs, startParcelEventPoller, TOPIC } = require('../src/parcelStore');

const quiet = { log() {}, warn() {} };

function tokenURI({ name = 'Level 1 at {0, 0}', mode = 'Terrain', svg = '<svg>x</svg>', utf8 = false } = {}) {
  const image = utf8
    ? `data:image/svg+xml,${encodeURIComponent(svg)}`
    : `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const json = { name, attributes: [{ trait_type: 'Mode', value: mode }], image };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(json)).toString('base64')}`;
}

test('decodeTokenURI keeps name and attributes and gzips the SVG', () => {
  const doc = decodeTokenURI(tokenURI({ name: 'Level 7 at {0, 15}', mode: 'Daydream', svg: '<svg>hi</svg>' }));
  assert.equal(doc.name, 'Level 7 at {0, 15}');
  assert.deepEqual(doc.attributes, [{ trait_type: 'Mode', value: 'Daydream' }]);
  assert.equal(zlib.gunzipSync(doc.svgGz).toString(), '<svg>hi</svg>');
  assert.equal(zlib.gunzipSync(decodeTokenURI(tokenURI({ svg: '<svg>&</svg>', utf8: true })).svgGz).toString(), '<svg>&</svg>');
  assert.throws(() => decodeTokenURI('ipfs://x'), /Unexpected tokenURI format/);
});

test('concurrent gets share one read, and later gets are served from memory', async () => {
  let reads = 0;
  const store = new ParcelStore({ fetchTokenURI: async () => { reads++; return tokenURI(); }, log: quiet });
  const [a, b] = await Promise.all([store.get(42), store.get('42')]);
  assert.equal(a, b);
  await store.get(42);
  assert.equal(reads, 1);
});

test('invalid ids are rejected without a read', async () => {
  let reads = 0;
  const store = new ParcelStore({ fetchTokenURI: async () => { reads++; return tokenURI(); }, log: quiet });
  for (const bad of [0, 9912, 'abc', 1.5, -3]) await assert.rejects(store.get(bad), /Invalid token ID/);
  assert.equal(reads, 0);
});

test('a failed read is not held, so the next request retries', async () => {
  let fail = true;
  const store = new ParcelStore({
    fetchTokenURI: async () => { if (fail) throw new Error('rpc down'); return tokenURI(); },
    log: quiet,
  });
  await assert.rejects(store.get(7), /rpc down/);
  fail = false;
  assert.equal((await store.get(7)).attributes[0].value, 'Terrain');
});

test('refresh replaces what is held (a parcel that was terraformed)', async () => {
  let mode = 'Daydream';
  const store = new ParcelStore({ fetchTokenURI: async () => tokenURI({ mode }), log: quiet });
  assert.equal((await store.get(8293)).attributes[0].value, 'Daydream');
  mode = 'Terraform';
  store.refresh([8293, 0, 99999]); // out-of-range ids are ignored
  await store.inFlight.get(8293);
  assert.equal((await store.get(8293)).attributes[0].value, 'Terraform');
});

test('warm reads every parcel, retrying failures once', async () => {
  const failedOnce = new Set();
  const store = new ParcelStore({
    totalSupply: 25,
    fetchTokenURI: async (id) => {
      if (id % 5 === 0 && !failedOnce.has(id)) { failedOnce.add(id); throw new Error('blip'); }
      return tokenURI({ name: `#${id}` });
    },
    log: quiet,
  });
  const stats = await store.warm({ concurrency: 4, delayMs: 0 });
  assert.equal(stats.held, 25);
  assert.equal((await store.get(10)).name, '#10');
  assert.equal(store.warming, null);
});

test('parcelIdsFromLogs reads each event where it carries the tokenId', () => {
  const word = (n) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
  const addr = word(0x1234);
  const logs = [
    { topics: [TOPIC.daydreaming], data: word(115) },
    { topics: [TOPIC.terraformed], data: word(8293) + addr.slice(2) },
    { topics: [TOPIC.transfer, addr, addr, word(6)], data: '0x' },
    { topics: [TOPIC.parcelModified], data: word(42) + word(1).slice(2) },
    { topics: [TOPIC.attunementSet, word(77)], data: word(3) },
    { topics: [TOPIC.daydreaming], data: word(20000) },      // out of range
    { topics: [ethers.id('Approval(address,address,uint256)'), addr, addr, word(9)], data: '0x' },
  ];
  const { changed, antenna, transferred } = parcelIdsFromLogs(logs);
  assert.deepEqual([...changed].sort((a, b) => a - b), [42, 77, 115, 8293]);
  assert.deepEqual([...antenna].sort((a, b) => a - b), [42, 77]);
  assert.deepEqual([...transferred], [6]);
});

test('poller starts at head, then reads each new range once', async () => {
  const heads = [100, 105, 105, 110];
  const ranges = [];
  const seen = [];
  const provider = {
    getBlockNumber: async () => heads.shift(),
    getLogs: async ({ fromBlock, toBlock }) => { ranges.push([fromBlock, toBlock]); return []; },
  };
  const poller = startParcelEventPoller({ provider, addresses: [], intervalMs: 1e9, onLogs: r => seen.push(r), log: quiet });
  await new Promise(r => setImmediate(r)); // the first tick (baseline) runs on start
  await poller.tick(); // 101..105
  await poller.tick(); // head unchanged: no read
  await poller.tick(); // 106..110
  poller.stop();
  assert.deepEqual(ranges, [[101, 105], [106, 110]]);
  assert.equal(seen.length, 2);
});

test('poller skips ahead past a long stall and asks for a re-warm', async () => {
  const heads = [100, 1000];
  const ranges = [];
  let gaps = 0;
  const provider = {
    getBlockNumber: async () => heads.shift(),
    getLogs: async ({ fromBlock, toBlock }) => { ranges.push([fromBlock, toBlock]); return []; },
  };
  const poller = startParcelEventPoller({ provider, addresses: [], intervalMs: 1e9, maxSpan: 100, onLogs: () => {}, onGap: () => gaps++, log: quiet });
  await new Promise(r => setImmediate(r));
  await poller.tick();
  poller.stop();
  assert.equal(gaps, 1);
  assert.deepEqual(ranges, [[901, 1000]]);
});

test('a failed log read is retried from the same block', async () => {
  const heads = [100, 105, 108];
  const ranges = [];
  let fail = true;
  const provider = {
    getBlockNumber: async () => heads.shift(),
    getLogs: async ({ fromBlock, toBlock }) => {
      ranges.push([fromBlock, toBlock]);
      if (fail) { fail = false; throw new Error('range beyond head'); }
      return [];
    },
  };
  const poller = startParcelEventPoller({ provider, addresses: [], intervalMs: 1e9, onLogs: () => {}, log: quiet });
  await new Promise(r => setImmediate(r));
  await poller.tick();
  await poller.tick();
  poller.stop();
  assert.deepEqual(ranges, [[101, 105], [101, 108]]);
});
