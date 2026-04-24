// Grid layout helpers for the collector/wallet view.
// Extracted so layout contracts (column cap, overflow safety) are covered by tests
// and can't regress from unrelated formatting changes.

export const WALLET_GRID_MAX_COLUMNS = 5;

export function getWalletGridColumns(parcelCount) {
  if (!Number.isFinite(parcelCount) || parcelCount <= 0) return 1;
  return Math.min(WALLET_GRID_MAX_COLUMNS, parcelCount);
}

// minmax(0, 1fr) prevents long zone/mode strings inside a card from pushing
// their column wider than 1/Nth of the container, which would overflow the window.
export function getWalletGridTemplate(parcelCount) {
  const cols = getWalletGridColumns(parcelCount);
  return `repeat(${cols}, minmax(0, 1fr))`;
}
