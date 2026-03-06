// Shared constants and micro-components used across multiple files

export const CATEGORY_COLORS = {
  Grail: '#ffd700',
  Rare: '#c084fc',
  Premium: '#60a5fa',
  'Uncommon': '#34d399',
  Floor: 'inherit',
};

// Badge config for all special token types — shared between ParcelResult and WalletView
export const SPECIAL_TYPE_BADGES = {
  'Origin Daydream':  { label: 'origin daydream',  color: '#fb923c' },
  'Origin Terraform': { label: 'origin terraform', color: '#fb923c' },
  'Plague':           { label: 'plague',            color: '#e879f9' },
  'X-Seed':           { label: 'x-seed',            color: '#4ade80' },
  'Y-Seed':           { label: 'y-seed',            color: '#2dd4bf' },
  'Lith0':            { label: 'lith0',             color: '#a5b4fc' },
  'Spine':            { label: 'spine',             color: '#f87171' },
  '1of1':             { label: '1 of 1',            color: '#ffd700' },
  'Biome0':           { label: 'biome 0',           color: '#22d3ee' },
  'BigGrass':         { label: 'big grass',         color: '#86efac' },
  'LittleGrass':      { label: 'little grass',      color: '#d9f99d' },
};

export function EthIcon({ width = 10, height = 16 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.8 }}>
      <path d="M5 0L0 8.15L5 11L10 8.15L5 0Z" />
      <path d="M0 9.1L5 16L10 9.1L5 12L0 9.1Z" />
    </svg>
  );
}
