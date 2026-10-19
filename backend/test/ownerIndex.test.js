// Owner index: load from Alchemy's shape, move on transfers, and replay recent
// transfers over a snapshot that may trail the chain.

const test = require('node:test');
const assert = require('node:assert/strict');
const { OwnerIndex, REPLAY_MS } = require('../src/ownerIndex');

const owners = [
  { ownerAddress: '0xAAA', tokenBalances: [{ tokenId: '1' }, { tokenId: '2' }] },
  { ownerAddress: '0xBBB', tokenBalances: [{ tokenId: '0x3' }] },
];

test('loads owners and answers lookups case-insensitively', () => {
  const idx = new OwnerIndex();
  assert.equal(idx.ready(), false);
  idx.load(owners);
  assert.equal(idx.ready(), true);
  assert.equal(idx.ownerOf(3), '0xbbb');
  assert.equal(idx.countOf('0xaaa'), 2);
  assert.deepEqual(idx.tokensOf(['0xAAA', '0xbbb']), [1, 2, 3]);
});

test('a transfer moves the parcel between holders', () => {
  const idx = new OwnerIndex();
  idx.load(owners);
  idx.applyTransfer(2, '0xBBB');
  assert.equal(idx.countOf('0xaaa'), 1);
  assert.deepEqual(idx.tokensOf(['0xbbb']), [2, 3]);
});

test('a refresh replays recent transfers but not old ones', () => {
  const idx = new OwnerIndex();
  idx.load(owners);
  const now = Date.now();
  idx.applyTransfer(1, '0xCCC', now - 1000);               // just before the refresh: replayed
  idx.applyTransfer(2, '0xDDD', now - REPLAY_MS - 60_000); // long before: the snapshot knows better
  idx.load(owners, now);                                    // the snapshot still shows the old owners
  assert.equal(idx.ownerOf(1), '0xccc');
  assert.equal(idx.ownerOf(2), '0xaaa');
});
