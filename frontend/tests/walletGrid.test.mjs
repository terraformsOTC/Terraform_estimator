import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWalletGridTemplate, WALLET_GRID_COLUMNS } from '../src/lib/walletGrid.mjs';

test('column count is 5 — do not change without product sign-off', () => {
  assert.equal(WALLET_GRID_COLUMNS, 5);
});

test('grid always renders 5 columns regardless of parcel count', () => {
  // A wallet with fewer than 5 parcels should still lay out 5 slots so cards
  // stay a consistent size; extra slots are left empty.
  assert.equal(getWalletGridTemplate(), 'repeat(5, minmax(0, 1fr))');
  assert.equal(getWalletGridTemplate(1), 'repeat(5, minmax(0, 1fr))');
  assert.equal(getWalletGridTemplate(3), 'repeat(5, minmax(0, 1fr))');
  assert.equal(getWalletGridTemplate(100), 'repeat(5, minmax(0, 1fr))');
});

test('grid template uses minmax(0, 1fr) to prevent content overflow', () => {
  // If this assertion fails, the grid will overflow the viewport when a column's
  // content (e.g. a long zone/mode label) is wider than 1/5 of the container.
  assert.match(getWalletGridTemplate(), /minmax\(0,\s*1fr\)/);
});
