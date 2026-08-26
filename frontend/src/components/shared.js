// Shared constants and micro-components used across multiple files

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Parcel SVGs go through the app's own /img proxy instead of straight to the
// backend: same origin (the browser reuses the page's connection) and cached on
// Vercel's edge network, which the Render origin is not. Bytes are identical.
// See src/app/img/[tokenId]/route.js.
export const parcelImage = (tokenId) => `/img/${tokenId}`;

// The estimate, as the model actually produces it: a range, not a point.
//
// The two ends are the same parcel priced on the two sides it can change hands
// on — an accepted offer (what a seller nets) and a taken listing (what a buyer
// pays). The gap between them is one fitted coefficient, so the range is always
// the same relative width; it is one quantity with a width, not two competing
// estimates. Tier-2 parcels (Godmode, Plague, the seeds, Lith0) have too few
// settled sales to split, so they collapse to a single number and render as one.
export function HedonicEstimate({ pricingV2, fallback, floor, ethUsd, note }) {
  const collapsed = !pricingV2 || pricingV2.tier === 'tier2' || pricingV2.off === pricingV2.on;
  const low = pricingV2 ? pricingV2.off : fallback;
  const high = pricingV2 ? pricingV2.on : fallback;

  return (
    <div>
      <p className="text-xs opacity-60 uppercase tracking-widest mb-1">estimated value</p>
      <div className="flex items-center gap-2 flex-wrap">
        <EthIcon />
        <span className="text-3xl">
          {collapsed ? high.toFixed(3) : `${low.toFixed(3)} – ${high.toFixed(3)}`}
        </span>
      </div>
      {!collapsed && (
        <p className="text-xs opacity-55 mt-1">liquidation → listed price</p>
      )}
      {floor != null && (
        <p className="text-xs opacity-55 mt-1">
          floor: {floor} ETH{ethUsd ? ` / $${Math.round(floor * ethUsd).toLocaleString()}` : ''}
        </p>
      )}
      {collapsed && pricingV2?.tierReason && (
        <p className="text-xs opacity-45 mt-1">
          {pricingV2.tierReason} — too few settled sales to price a range.
        </p>
      )}
      {note}
    </div>
  );
}

// Used by secondary pages (bargains, glossary) that don't manage wallet state themselves.
// Connects via MetaMask and redirects to the main page with the address in the URL.
export async function connectAndRedirect() {
  if (typeof window.ethereum === 'undefined') return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts[0]) window.location.href = `/?address=${accounts[0]}`;
  } catch (err) {
    // 4001 = user rejected — silent. Other codes are infrastructure failures worth logging.
    if (err?.code !== 4001) console.warn('[connectAndRedirect]', err?.message || err);
  }
}

export function Footer() {
  return (
    <footer className="px-6 mt-16 mb-6 text-xs opacity-40">
      Built with enthusiasm by{' '}
      <a href="https://x.com/TerraformsOTC" target="_blank" rel="noopener noreferrer">
        TerraformsOTC
      </a>
      {' '}and Claude. Want help buying or selling a parcel? Contact{' '}
      <a href="mailto:terraformsotc@protonmail.com">
        terraformsotc@protonmail.com
      </a>
    </footer>
  );
}

export function MysteryBadge({ outlier, opacity = 0.8 }) {
  if (!outlier) return null;
  const color = outlier === 'high' ? '#ffd700' : '#f87171';
  return (
    <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity }}>
      {outlier === 'high' ? 'high ???' : 'low ???'}
    </span>
  );
}


// Maps on-chain zone name → slug at https://www.terraformlore.xyz/zones/<slug>.
// Zones not in this map have no lore page (e.g. [HOME], Valeria, Dynacrypts,
// Cradle, pfpfpfpbbx80, [BOSS], [WEN]) — getZoneLoreUrl returns null for them.
// Slugs match the lore site's URL structure scraped 2026-05-15; most are
// lowercase(strip-brackets, spaces→hyphens), but Kippsun is spelled "kippsunn".
const ZONE_LORE_SLUGS = {
  'Shahra': 'shahra', 'Antenna': 'antenna', 'Aetherking': 'aetherking',
  'Gemina': 'gemina', '[SOON]': 'soon', 'Dread': 'dread', '[SUN]': 'sun',
  'Royal': 'royal', 'Killscreen': 'killscreen', '[NOV]': 'nov', 'Avidana': 'avidana',
  'Mould': 'mould', 'First Earth': 'first-earth', 'Tetsu': 'tetsu', 'Aria': 'aria', 'Xleph': 'xleph',
  'Uwo': 'uwo', 'Mori': 'mori', 'Radiant': 'radiant', 'Venmon': 'venmon', 'Promiselands': 'promiselands',
  'Greysunn': 'greysunn', 'Treasure': 'treasure',
  'Dhampir': 'dhampir', 'Rocket': 'rocket', 'Mt Zuka': 'mt-zuka', 'Jadeite': 'jadeite',
  'Intro Forest': 'intro-forest',
  'Bubble': 'bubble', 'Kippsun': 'kippsunn', 'Everglades': 'everglades',
  'Muxtai X1': 'muxtai-x1', 'Toad': 'toad', 'Angel': 'angel',
  'Pepo': 'pepo', 'Wastelands': 'wastelands', '[BLOOD]': 'blood',
  'Blushing': 'blushing', 'Ender': 'ender', 'Akileaf': 'akileaf',
  '[NEON]': 'neon', 'Calyx': 'calyx', 'Zerinia': 'zerinia', 'Palace': 'palace',
  '[CUR2]': 'cur2', '[DARK]': 'dark', 'Warp': 'warp', 'Blossom': 'blossom', 'Linosim': 'linosim',
  '[HYCA]': 'hyca', '[YUNA]': 'yuna', '[MENU]': 'menu', 'Alto': 'alto', 'Kairo': 'kairo',
  '[MOON]': 'moon', '[SEP]': 'sep', 'Shiro': 'shiro', 'Mirage': 'mirage', 'Grove': 'grove',
  'Hyphae': 'hyphae', 'Mecha': 'mecha', 'Riso': 'riso', 'Exduo': 'exduo', 'Arc': 'arc',
  'Nightrose': 'nightrose', 'Hypermage': 'hypermage', 'Holo': 'holo', 'Ouallada': 'ouallada',
};

export function getZoneLoreUrl(zone) {
  const slug = ZONE_LORE_SLUGS[zone];
  return slug ? `https://www.terraformlore.xyz/zones/${slug}` : null;
}

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
  'Unminted':         { label: 'unminted',          color: '#eee8de' },
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
export function AutoBadgeStack({ traits, opacity = 0.85 }) {
  const { mode, specialType, biome, level, zone, chroma, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryOutlier, mysteryValue } = traits;
  const isTerrain = mode === 'Terrain';
  return (
    <>
      {isGodmode                                        && <SpecialBadge type="Godmode" opacity={opacity} />}
      {isOneOfOne && specialType && specialType !== '1of1' && <SpecialBadge type="1of1" opacity={opacity} />}
      {isS0                                             && <SpecialBadge type="S0" opacity={opacity} />}
      {biome === 0 && specialType !== 'Lith0'           && <SpecialBadge type="Biome0" opacity={opacity} />}
      {isLith0like                                      && <SpecialBadge type="Lith0like" opacity={opacity} />}
      {isGm                                             && <SpecialBadge type="gm" opacity={opacity} />}
      {isTerrain && biome === 42                        && <SpecialBadge type="BigGrass" opacity={opacity} />}
      {isTerrain && biome === 65                        && <SpecialBadge type="LittleGrass" opacity={opacity} />}
      {isTerrain && zone === '[BLOOD]' && chroma === 'Pulse' && <SpecialBadge type="Heartbeat" opacity={opacity} />}
      {isTerrain && biome === 58 && zone === 'Intro Forest'  && <SpecialBadge type="Matrix" opacity={opacity} />}
      {/* 30000: manually determined from parcel animations — independent of MYSTERY_P5 (20000) */}
      {isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000 && <SpecialBadge type="Mesa" opacity={opacity} />}
      {level === 1                                      && <SpecialBadge type="Basement" opacity={opacity} />}
      {level === 20                                     && <SpecialBadge type="Penthouse" opacity={opacity} />}
    </>
  );
}

export function hasBadges(traits) {
  const { mode, specialType, biome, level, zone, chroma, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryValue } = traits;
  const isTerrain = mode === 'Terrain';
  return isGodmode
    || isOneOfOne
    || isS0
    || (biome === 0 && specialType !== 'Lith0')
    || isLith0like
    || isGm
    || (isTerrain && biome === 42)
    || (isTerrain && biome === 65)
    || (isTerrain && zone === '[BLOOD]' && chroma === 'Pulse')
    || (isTerrain && biome === 58 && zone === 'Intro Forest')
    || (isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000)
    || level === 1
    || level === 20;
}

export function getLevelCategory(level) {
  if (level === 1 || level === 20) return 'Mythical';
  if (level === 2 || level === 3 || level === 18 || level === 19) return 'Rare';
  return null;
}

const CATEGORY_ORDER = { Mythical: 0, Rare: 1, Premium: 2, Uncommon: 3, Floor: 4 };


// ─── Shared trait row components ─────────────────────────────────────────────
// Used in both ParcelResult and UnmintedResult

export function TraitRow({ label, value, category }) {
  const color = CATEGORY_COLORS[category] || 'inherit';
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        {category && category !== 'Floor' && (
          <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
            {category}
          </span>
        )}
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

// ─── Feed table helpers (sales + listings) ───────────────────────────────────

export function shortAddr(a) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// From / To (sales) and Owner (listings). Shows the ENS name when the backend
// reverse-resolved one, else a truncated address. Links to the estimator's
// wallet view (/?address=…).
export function WalletLink({ address, ens, opacity = 0.9 }) {
  if (!address) return <span className="opacity-30">—</span>;
  return (
    <a
      href={`/?address=${address}`}
      className="no-underline hover:underline whitespace-nowrap"
      style={{ opacity }}
      title={address}
    >
      {ens || shortAddr(address)}
    </a>
  );
}

// Stacked L / Z / B / C property block used in both feed tables. Trait values are
// tinted by rarity category (zone/biome/level); special + auto badges (godmode,
// plague, basement, biome0, …) — and the mystery outlier flag for listings —
// wrap underneath so no rarity signal is lost in the compact layout.
export function PropertyStack({ traits, pricing, showMystery = false, opacity = 0.85 }) {
  const { zone, biome, level, chroma, mode, specialType } = traits || {};
  const { zoneCategory, biomeCategory } = pricing || {};
  const levelCategory = getLevelCategory(level);
  const catColor = (cat) => (cat && cat !== 'Floor' ? CATEGORY_COLORS[cat] : undefined);

  const specialBadge = SPECIAL_TYPE_BADGES[
    mode === 'Origin Daydream' ? 'Origin Daydream'
    : mode === 'Origin Terraform' ? 'Origin Terraform'
    : specialType
  ];

  const Row = ({ k, color, children }) => (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="opacity-40 inline-block" style={{ width: '0.75rem' }}>{k}</span>
      <span style={color ? { color } : undefined}>{children}</span>
    </div>
  );

  const showBadgeRow = specialBadge || hasBadges(traits) || (showMystery && traits?.mysteryOutlier);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 text-xs leading-tight">
        <Row k="L" color={catColor(levelCategory)}>{level}</Row>
        <Row k="Z" color={catColor(zoneCategory)}>{zone}</Row>
        <Row k="B" color={catColor(biomeCategory)}>{biome}</Row>
        <Row k="C">{chroma || 'Flow'}</Row>
      </div>
      {showBadgeRow && (
        <div className="flex items-center gap-1 flex-wrap">
          {specialBadge && <SpecialBadge config={specialBadge} opacity={opacity} />}
          <AutoBadgeStack traits={traits} opacity={opacity} />
          {showMystery && <MysteryBadge outlier={traits?.mysteryOutlier} opacity={opacity} />}
        </div>
      )}
    </div>
  );
}
