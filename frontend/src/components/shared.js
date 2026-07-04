// Shared constants and micro-components used across multiple files

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

export function pickRandomWhale() {
  return WHALE_WALLETS[Math.floor(Math.random() * WHALE_WALLETS.length)];
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

export const WHALE_WALLETS = [
  '0x9ddbdcd3c5123e673e4b96992101f8ceafcd95a0',
  '0xb88f61e6fbda83fbfffabe364112137480398018',
  '0x3f51e7af7cf3e4be9af7b8f58324d0b085f4e4d9',
  '0x5f298bd43168b7d3cbb71b1ea017ddbe250220ae',
  '0x43b3A12cdc49003c9537D0aB92800a97C0a8959E',
  '0x1Ab786Ea6828FF401477d6d351408CDE2ff0B938',
  '0xc21870affbef7df68ec74c91389daae6beeac0ec',
  '0x113d754ff2e6ca9fd6ab51932493e4f9dabdf596',
  '0xbc49de68bcbd164574847a7ced47e7475179c76b',
  '0x717a578E4A157Ea52EE989be75f15957F294d1A9',
  '0xec7be1863da9a3f7108103b6e5d8a358b608aa45',
  '0xaaA3F05f25EeD87eE3a268F4582Ec914e6245577',
  '0xb5e1532b054226d92913b40da22a01b7900ec96e',
  '0xAc6745E88C85a44A6D8bDdc11DE2C93A94ef900C',
  '0x3833a533f811a20b30b9694e8045ea575c0ae1f6',
  '0x1ff2875cd548eeae6d22f26bae2d72a50fd143c7',
  '0x821372752c0a7D9Bfc7a78F11E4aAD3147A8db22',
  '0x2E0D63fFCB08eA20fF3AcDbB72dfEc97343885d2',
  '0x69a949D2330bFaC2FDBEE90ccfA9923343326B19',
  '0x9aF256B6A43d8A2B7c427DF049D2d32B700B9998',
  '0x8A5a244B08678a7DE0605494fe4E76C552935d38',
  '0x0b4c12293d4136a6fa4abb9a1610c5d2ec920df9',
  '0xb270e2b81437b7945f906cd88419da8864ce3803',
  '0x6bdac4f8dfda978b26df826ae4ef57f6d3b4f6b7',
  '0xe553fe5b71a236a8d6b03cbddde8be48c5fc5402',
  '0x0c78a025d8bf74298c19f569a8b41f74c3863296',
  '0x3FD272470965E7dDcE30c97feDE93e11839f3ac3',
  '0x99e2e69f98b164c399cc12d8382a82135eea6364',
  '0xDe8Ed5A0f5F94548D62873A5dEe1eE79992e016a',
  '0xFb7Ad45dF71dc18237FC30f2E4654E733D4503C3',
  '0xa9ee02564d0ab84b77efb4a4eaa16f6b7bf30a44',
  '0x35cbedc3412d3c93dec4afa60ddf38c2a9c38865',
  '0xd3c3678b3f70e43162aaf21039c4669a0dd78c81',
  '0x2C0a5Ed29d463f6c6180fF4DAdAb248158b6DA5B',
  '0x0B119DDa8918c8bd6EB5F316fA23A553777e1aA9',
  '0x6b34dd13CE75a1aB05B9bdE8C3b31AcA77184329',
  '0x56ca0b9cfc2e88b5fadf1b37c77908265148ef2b',
  '0x03f0e71ac43276FCF0b327b1AbE8CDF5974aeCC1',
  '0x9039c742b908c2dded0ae499501bbae9286e1995',
  '0xfcd457b27ee149e74a080b2a4e482d9a5dbaf3d9',
  '0x012E168ACb9fdc90a4ED9fd6cA2834D9bF5b579e',
  '0x55313b424de97716c9dfc7f6f97dcaab0234274d',
  '0xc229d7D3dD662A1b107E29AA84bb0C8Ff609CF3A',
  '0xD72bb0961368F1A5c566E0ac3AFCA62afFa20F14',
  '0x27d558d7da6853eac80081d624d058a559284855',
  '0x4ca1cb4bc1d4b24806fdf27d2b4be0a1045f463e',
  '0x578f9b95723ae641d6c9d37d5a47f42f3895eb02',
  '0xaF8738a35eB57A2C69EeFD4ED48947aB45FcF765',
  '0xda930d632c17719b7d1f75a8cb986b7417c7ba75',
  '0xcb14228737c6b38C0d060bf7Cf5FF8f9090936fc',
].map(a => a.toLowerCase());

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

export function getMoneySwordMultiplier(pricing, level) {
  if (!pricing) return 1.0;
  if (pricing.isSpecial) return 1.35;
  const levelCat = getLevelCategory(level);
  const topCat = [pricing.zoneCategory, pricing.biomeCategory, levelCat]
    .filter(Boolean)
    .sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))[0];
  if (topCat === 'Mythical') return 1.5;
  if (topCat === 'Rare')     return 1.4;
  if (topCat === 'Premium')  return 1.3;
  return 1.2;
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
