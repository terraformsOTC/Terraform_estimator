// Collector grid always renders 5 columns regardless of parcel count so cards
// stay a consistent size — a wallet with 3 parcels fills 3 of 5 slots, leaving
// 2 empty. minmax(0, 1fr) prevents long zone/mode labels inside a card from
// pushing their column wider than 1/5 of the container, which would overflow.

export const WALLET_GRID_COLUMNS = 5;

export function getWalletGridTemplate() {
  return `repeat(${WALLET_GRID_COLUMNS}, minmax(0, 1fr))`;
}
