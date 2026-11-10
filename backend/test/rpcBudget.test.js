// Security scan finding 4: the shared RPC cap (rpcLimiter.js) and /wallet's
// owner-index path (walletTokens.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { RpcLimiter, CappedJsonRpcProvider } = require('../src/rpcLimiter');
const { walletTokenIds } = require('../src/walletTokens');
const { OwnerIndex } = require('../src/ownerIndex');

const tick = () => new Promise(r => setImmediate(r));

test('limiter: never more than maxInFlight at once, queue served in order', async () => {
  const lim = new RpcLimiter({ maxInFlight: 3, maxQueued: 100 });
  let running = 0, peak = 0;
  const order = [];
  const gates = [];
  const jobs = Array.from({ length: 10 }, (_, i) => lim.run(async () => {
    running++; peak = Math.max(peak, running); order.push(i);
    await new Promise(r => gates.push(r));
    running--;
    return i;
  }));
  await tick();
  assert.equal(running, 3);
  while (gates.length || running) { gates.shift()?.(); await tick(); }
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(peak, 3);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(lim.active, 0);
  assert.equal(lim.waiting.length, 0);
});

test('limiter: refuses at once past maxQueued, and a failing call frees its slot', async () => {
  const lim = new RpcLimiter({ maxInFlight: 1, maxQueued: 2 });
  let release;
  const first = lim.run(() => new Promise(r => { release = r; }));
  const queued = [lim.run(async () => 'a'), lim.run(async () => 'b')];
  await assert.rejects(lim.run(async () => 'c'), e => e.code === 'RPC_BUSY');
  assert.equal(lim.stats.rejected, 1);
  release('x');
  assert.equal(await first, 'x');
  assert.deepEqual(await Promise.all(queued), ['a', 'b']);
  await assert.rejects(lim.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(lim.active, 0);
  assert.equal(await lim.run(async () => 'after'), 'after');
});

test('provider: every HTTP request goes through the cap', async () => {
  let inFlight = 0, peak = 0, requests = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      requests++; inFlight++; peak = Math.max(peak, inFlight);
      setTimeout(() => {
        inFlight--;
        const reply = p => ({ jsonrpc: '2.0', id: p.id, result: p.method === 'eth_chainId' ? '0x1' : '0x' + (5).toString(16).padStart(64, '0') });
        const parsed = JSON.parse(body);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(reply) : reply(parsed)));
      }, 30);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const lim = new RpcLimiter({ maxInFlight: 2, maxQueued: 100 });
  // batchMaxCount 1: one HTTP request per call, so the cap is what limits them.
  const provider = new CappedJsonRpcProvider(url, lim, 1, { staticNetwork: true, batchMaxCount: 1 });
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => provider.call({ to: '0x' + '11'.repeat(20), data: '0x' })));
    assert.equal(results.length, 12);
    assert.equal(requests, 12);
    assert.equal(peak, 2);
    assert.equal(lim.stats.started, 12);
  } finally {
    provider.destroy();
    server.close();
  }
});

// A fake contract over a fixed chain state, counting its calls.
function fakeChain(holdings) {
  const calls = { balanceOf: 0, tokenOfOwnerByIndex: 0 };
  const lc = Object.fromEntries(Object.entries(holdings).map(([a, ids]) => [a.toLowerCase(), ids]));
  return {
    calls,
    contract: {
      balanceOf: async a => { calls.balanceOf++; return BigInt((lc[a.toLowerCase()] || []).length); },
      tokenOfOwnerByIndex: async (a, i) => { calls.tokenOfOwnerByIndex++; return BigInt(lc[a.toLowerCase()][i]); },
    },
  };
}
const deps = (extra) => ({ withTimeout: p => p, maxPerWallet: 500, maxTotal: 1000, log: { warn() {} }, ...extra });
const indexOf = (owners) => {
  const idx = new OwnerIndex();
  idx.load(Object.entries(owners).map(([ownerAddress, ids]) => ({ ownerAddress, tokenBalances: ids.map(id => ({ tokenId: String(id) })) })));
  return idx;
};

test('wallet: answered from the owner index with one balanceOf per wallet', async () => {
  const chain = fakeChain({ '0xAAA': [30, 10, 20], '0xBBB': [5] });
  const wallets = [{ address: '0xAAA' }, { address: '0xBBB' }];
  const r = await walletTokenIds(wallets, deps({ contract: chain.contract, ownerIndex: indexOf({ '0xaaa': [10, 20, 30], '0xbbb': [5] }) }));
  assert.deepEqual(r.tokenIds, [10, 20, 30, 5]);
  assert.equal(r.holderOf.get(5), '0xBBB');
  assert.deepEqual(chain.calls, { balanceOf: 2, tokenOfOwnerByIndex: 0 });
  assert.deepEqual(wallets.map(w => [w.totalParcels, w.fetchCount, w.source]), [[3, 3, 'index'], [1, 1, 'index']]);
});

test('wallet: falls back to the chain where the index disagrees, or is not loaded', async () => {
  // 0xAAA just received #40 and the poller hasn't moved it yet.
  const chain = fakeChain({ '0xAAA': [10, 20, 30, 40], '0xBBB': [5] });
  const wallets = [{ address: '0xAAA' }, { address: '0xBBB' }];
  const r = await walletTokenIds(wallets, deps({ contract: chain.contract, ownerIndex: indexOf({ '0xaaa': [10, 20, 30], '0xbbb': [5] }) }));
  assert.deepEqual(r.tokenIds.slice().sort((a, b) => a - b), [5, 10, 20, 30, 40]);
  assert.deepEqual(wallets.map(w => w.source), ['chain', 'index']);
  assert.equal(chain.calls.tokenOfOwnerByIndex, 4);

  const cold = fakeChain({ '0xAAA': [7, 8] });
  const w2 = [{ address: '0xAAA' }];
  const r2 = await walletTokenIds(w2, deps({ contract: cold.contract, ownerIndex: new OwnerIndex() }));
  assert.deepEqual(r2.tokenIds, [7, 8]);
  assert.equal(w2[0].source, 'chain');
});

test('wallet: caps per wallet and in total, and counts a parcel once', async () => {
  const many = Array.from({ length: 8 }, (_, i) => i + 1);
  const chain = fakeChain({ '0xAAA': many, '0xBBB': [100, 101, 102] });
  const wallets = [{ address: '0xAAA' }, { address: '0xBBB' }];
  const r = await walletTokenIds(wallets, deps({ contract: chain.contract, ownerIndex: indexOf({ '0xaaa': many, '0xbbb': [100, 101, 102] }), maxPerWallet: 5, maxTotal: 7 }));
  assert.deepEqual(wallets.map(w => [w.totalParcels, w.fetchCount]), [[8, 5], [3, 2]]);
  assert.deepEqual(r.tokenIds, [1, 2, 3, 4, 5, 100, 101]);
});
