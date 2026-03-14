// Shared constants and micro-components used across multiple files

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const CATEGORY_COLORS = {
  Mythical: '#ffe401',
  Rare: '#84488b',
  Premium: '#b0d6fa',
  'Uncommon': '#7ffcc4',
  Floor: 'inherit',
};

// Badge config for all special token types — shared between ParcelResult and WalletView
export const SPECIAL_TYPE_BADGES = {
  'Godmode':          { label: 'godmode',           color: '#f5eee8' },
  'Origin Daydream':  { label: 'origin daydream',  color: '#ffaa00' },
  'Origin Terraform': { label: 'origin terraform', color: '#f95738' },
  'Plague':           { label: 'plague',            color: '#da709a' },
  'X-Seed':           { label: 'x-seed',            color: '#62d840' },
  'Y-Seed':           { label: 'y-seed',            color: '#3dddb0' },
  'Lith0':            { label: 'lith0',             color: '#8e918c' },
  'Spine':            { label: 'spine',             color: '#ff4538' },
  '1of1':             { label: '1 of 1',            color: '#cb8175' },
  'Biome0':           { label: 'biome 0',           color: '#30e7ff' },
  'Lith0like':        { label: 'lith-0like',         color: '#9ff240' },
  'Matrix':           { label: 'matrix',             color: '#369e40' },
  'Mesa':             { label: 'mesa',               color: '#fc5602' },
  'gm':               { label: 'gm',                 color: '#f7c948' },
  'Synchro':          { label: 'synchro',            color: '#c4a675' },
  'BigGrass':         { label: 'big grass',         color: '#b0e111' },
  'LittleGrass':      { label: 'little grass',      color: '#a8c8a6' },
  'Heartbeat':        { label: 'heartbeat',          color: '#ee0000' },
  'Basement':         { label: 'basement',          color: '#bbbbbb' },
  'Penthouse':        { label: 'penthouse',         color: '#d77c11' },
  'S0':               { label: 's0',                color: '#9ebbc1' },
};

// Reusable badge chip — use type (key into SPECIAL_TYPE_BADGES) or config ({ color, label })
export function SpecialBadge({ type, config: cfg, opacity = 0.85 }) {
  const config = cfg ?? SPECIAL_TYPE_BADGES[type];
  if (!config) return null;
  return (
    <span className="text-xs px-1" style={{ color: config.color, border: `1px solid ${config.color}`, opacity }}>
      {config.label}
    </span>
  );
}

export function EthIcon({ width = 10, height = 16 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.8 }}>
      <path d="M5 0L0 8.15L5 11L10 8.15L5 0Z" />
      <path d="M0 9.1L5 16L10 9.1L5 12L0 9.1Z" />
    </svg>
  );
}
