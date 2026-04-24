import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWalletGridColumns, getWalletGridTemplate, WALLET_GRID_MAX_COLUMNS } from '../src/lib/walletGrid.mjs';

test('column cap is 5 — do not raise without product sign-off', () => {
  assert.equal(WALLET_GRID_MAX_COLUMNS, 5);
});

test('getWalletGridColumns never exceeds the cap', () => {
  for (const n of [5, 6, 12, 100, 9999]) {
    assert.ok(getWalletGridColumns(n) <= WALLET_GRID_MAX_COLUMNS,
      `count=${n} returned ${getWalletGridColumns(n)}`);
  }
});

test('getWalletGridColumns uses parcel count when below the cap', () => {
  assert.equal(getWalletGridColumns(1), 1);
  assert.equal(getWalletGridColumns(3), 3);
  assert.equal(getWalletGridColumns(5), 5);
});

test('getWalletGridColumns handles edge cases safely', () => {
  assert.equal(getWalletGridColumns(0), 1);
  assert.equal(getWalletGridColumns(-1), 1);
  assert.equal(getWalletGridColumns(NaN), 1);
  assert.equal(getWalletGridColumns(undefined), 1);
});

test('getWalletGridTemplate uses minmax(0, 1fr) to prevent content overflow', () => {
  // If this assertion fails, the grid will overflow the viewport when a column's
  // content (e.g. a long zone/mode label) is wider than 1/Nth of the container.
  const template = getWalletGridTemplate(5);
  assert.match(template, /minmax\(0,\s*1fr\)/,
    `template "${template}" must use minmax(0, 1fr), not plain 1fr`);
});

test('getWalletGridTemplate renders correct column count', () => {
  assert.equal(getWalletGridTemplate(3), 'repeat(3, minmax(0, 1fr))');
  assert.equal(getWalletGridTemplate(100), 'repeat(5, minmax(0, 1fr))');
});
