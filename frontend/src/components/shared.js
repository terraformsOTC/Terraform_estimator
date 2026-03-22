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
  'Unminted':         { label: 'unminted',          color: '#a78bfa' },
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

// Shared badge stack — renders all applicable special badges for a parcel.
// Used in ParcelResult (special + standard views) and WalletView (card grid).
export function BadgeStack({ traits, opacity = 0.85 }) {
  const { mode, specialType, biome, level, zone, chroma, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryOutlier, mysteryValue } = traits;
  const isTerrain = mode === 'Terrain';
  return (
    <>
      {isGodmode                                        && <SpecialBadge type="Godmode" opacity={opacity} />}
      {isOneOfOne && specialType !== '1of1'             && <SpecialBadge type="1of1" opacity={opacity} />}
      {isS0                                             && <SpecialBadge type="S0" opacity={opacity} />}
      {biome === 0 && specialType !== 'Lith0'           && <SpecialBadge type="Biome0" opacity={opacity} />}
      {isLith0like                                      && <SpecialBadge type="Lith0like" opacity={opacity} />}
      {isGm                                             && <SpecialBadge type="gm" opacity={opacity} />}
      {isTerrain && biome === 42                        && <SpecialBadge type="BigGrass" opacity={opacity} />}
      {isTerrain && biome === 65                        && <SpecialBadge type="LittleGrass" opacity={opacity} />}
      {isTerrain && zone === '[BLOOD]' && chroma === 'Pulse' && <SpecialBadge type="Heartbeat" opacity={opacity} />}
      {isTerrain && biome === 58 && zone === 'Intro Forest'  && <SpecialBadge type="Matrix" opacity={opacity} />}
      {isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000 && <SpecialBadge type="Mesa" opacity={opacity} />}
      {level === 1                                      && <SpecialBadge type="Basement" opacity={opacity} />}
      {level === 20                                     && <SpecialBadge type="Penthouse" opacity={opacity} />}
    </>
  );
}

// ─── Shared trait row components ─────────────────────────────────────────────
// Used in both ParcelResult and UnmintedResult

export function TraitRow({ label, value, category }) {
  const color = CATEGORY_COLORS[category] || 'inherit';
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
          {category}
        </span>
      </div>
    </div>
  );
}

export function SimpleRow({ label, value }) {
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function MysteryRow({ value, outlier }) {
  const isHigh = outlier === 'high';
  const isLow  = outlier === 'low';
  const accent = isHigh ? '#ffd700' : isLow ? '#f87171' : null;
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm" style={{ opacity: accent ? 0.8 : 0.5 }}>???</span>
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ opacity: accent ? 1 : 0.5 }}>{value.toLocaleString()}</span>
        {accent && (
          <span className="text-xs px-1" style={{ color: accent, border: `1px solid ${accent}`, opacity: 0.85 }}>
            {isHigh ? 'high ???' : 'low ???'}
          </span>
        )}
      </div>
    </div>
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
