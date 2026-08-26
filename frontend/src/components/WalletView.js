'use client';

import { useMemo, useState, useEffect } from 'react';
import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, AutoBadgeStack, MysteryBadge, parcelImage, getLevelCategory } from './shared';
import { getWalletGridTemplate } from '@/lib/walletGrid.mjs';
import {
  EMPTY_FILTERS,
  ParcelFilterPanel,
  ActiveFilterChips,
  buildFilterOptions,
  matchesFilters,
  toggleFilterValue,
  hasActiveFilters,
  countActiveFilters,
} from './ParcelFilters';

const ATTAINABILITY_COLORS = {
  'Easy': '#34d399',
  'Medium': '#60a5fa',
  'Very difficult': '#c084fc',
};

const SET_COLORS = {
  'Chess biome set':  '#34d399',
  'Binary biome set': '#34d399',
  'Blocky biome set': '#60a5fa',
  '[DUOTONE] set':    '#60a5fa',
  'Polychrome set':   '#c084fc',
  'Full level set':   '#c084fc',
  'Grail set':        '#c084fc',
  'Full zone set':    '#ffe401',
  'Full biome set':   '#ffe401',
};

const CATEGORY_ORDER = { Mythical: 0, Rare: 1, Premium: 2, Uncommon: 3, Floor: 4 };

// Ordered most common → rarest (collection-wide parcel counts).
const ALL_HIGHLIGHTS = [
  { key: 'tier_Floor',    label: 'floor',        color: 'rgba(232,232,232,0.5)' },
  { key: 'tier_Uncommon', label: 'uncommon',     color: '#7ffcc4' },
  { key: 'tier_Premium',  label: 'premium',      color: '#b0d6fa' },
  { key: 'tier_Rare',     label: 'rare',         color: '#84488b' },
  { key: 'tier_Mythical', label: 'mythical',     color: '#ffe401' },
  { key: 'mystery_high',  label: 'high ???',     color: '#ffd700' },
  { key: 'mystery_low',   label: 'low ???',      color: '#f87171' },
  { key: 'S0',            label: 's0',           color: '#9ebbc1' },
  { key: '1of1',          label: '1 of 1',       color: '#cb8175' },
  { key: 'LittleGrass',   label: 'little grass', color: '#a8c8a6' },
  { key: 'BigGrass',      label: 'big grass',    color: '#b0e111' },
  { key: 'gm',            label: 'gm',           color: '#f7c948' },
  { key: 'Matrix',        label: 'matrix',       color: '#369e40' },
  { key: 'Heartbeat',     label: 'heartbeat',    color: '#ee0000' },
  { key: 'Mesa',          label: 'mesa',         color: '#fc5602' },
  { key: 'Spine',         label: 'spine',        color: '#ff4538' },
  { key: 'origin_mint',   label: 'origin mint',  color: '#ffaa00' },
  { key: 'Biome0',        label: 'biome 0',      color: '#30e7ff' },
  { key: 'Lith0like',     label: 'lith-0like',   color: '#9ff240' },
  { key: 'Basement',      label: 'basement',     color: '#bbbbbb' },
  { key: 'Penthouse',     label: 'penthouse',    color: '#d77c11' },
  { key: 'X-Seed',        label: 'x-seed',       color: '#62d840' },
  { key: 'Y-Seed',        label: 'y-seed',       color: '#3dddb0' },
  { key: 'Lith0',         label: 'lith0',        color: '#8e918c' },
  { key: 'Plague',        label: 'plague',       color: '#da709a' },
  { key: 'Godmode',       label: 'godmode',      color: '#f5eee8' },
];

// Returns a Set of highlight keys present in the collection.
function computeOwnedHighlights(parcels) {
  const owned = new Set();

  for (const { traits, pricing } of parcels) {
    const {
      mode, specialType, biome, level, zone, chroma,
      isOneOfOne, isGodmode, isS0, isLith0like, isGm,
      mysteryOutlier, mysteryValue,
    } = traits;
    const { zoneCategory, biomeCategory } = pricing;
    const isTerrain = mode === 'Terrain';

    const levelCat = getLevelCategory(level);
    const top = [zoneCategory, biomeCategory, levelCat]
      .filter(c => c && c !== 'Floor')
      .sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))[0];
    owned.add(top ? `tier_${top}` : 'tier_Floor');

    if (isGodmode) owned.add('Godmode');
    if (SPECIAL_TYPE_BADGES[specialType]) owned.add(specialType);
    if (isOneOfOne && specialType && specialType !== '1of1') owned.add('1of1');
    if (isS0) owned.add('S0');
    if (biome === 0 && specialType !== 'Lith0') owned.add('Biome0');
    if (isLith0like) owned.add('Lith0like');
    if (isGm) owned.add('gm');
    if (isTerrain && biome === 42) owned.add('BigGrass');
    if (isTerrain && biome === 65) owned.add('LittleGrass');
    if (isTerrain && zone === '[BLOOD]' && chroma === 'Pulse') owned.add('Heartbeat');
    if (isTerrain && biome === 58 && zone === 'Intro Forest') owned.add('Matrix');
    if (isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000) owned.add('Mesa');
    if (level === 1) owned.add('Basement');
    if (level === 20) owned.add('Penthouse');
    if (mode === 'Origin Daydream' || mode === 'Origin Terraform') owned.add('origin_mint');
    if (mysteryOutlier === 'high') owned.add('mystery_high');
    if (mysteryOutlier === 'low') owned.add('mystery_low');
  }

  return owned;
}

// Returns true if a parcel carries the given highlight key.
function parcelHasBadge(parcel, key) {
  const { traits, pricing } = parcel;
  const { mode, specialType, biome, level, zone, chroma, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryOutlier, mysteryValue } = traits;
  const { zoneCategory, biomeCategory } = pricing;
  const isTerrain = mode === 'Terrain';

  if (key.startsWith('tier_')) {
    const tier = key.slice(5);
    const levelCat = getLevelCategory(level);
    const top = [zoneCategory, biomeCategory, levelCat]
      .filter(c => c && c !== 'Floor')
      .sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))[0];
    return tier === 'Floor' ? !top : top === tier;
  }

  switch (key) {
    case 'Godmode':          return !!isGodmode;
    case 'X-Seed':           return specialType === 'X-Seed';
    case 'Y-Seed':           return specialType === 'Y-Seed';
    case 'Plague':           return specialType === 'Plague';
    case 'Lith0':            return specialType === 'Lith0';
    case 'Spine':            return specialType === 'Spine';
    case '1of1':             return specialType === '1of1' || (!!isOneOfOne && !!specialType && specialType !== '1of1');
    case 'S0':               return !!isS0;
    case 'origin_mint':      return mode === 'Origin Daydream' || mode === 'Origin Terraform';
    case 'Biome0':           return biome === 0 && specialType !== 'Lith0';
    case 'Lith0like':        return !!isLith0like;
    case 'gm':               return !!isGm;
    case 'BigGrass':         return isTerrain && biome === 42;
    case 'LittleGrass':      return isTerrain && biome === 65;
    case 'Heartbeat':        return isTerrain && zone === '[BLOOD]' && chroma === 'Pulse';
    case 'Matrix':           return isTerrain && biome === 58 && zone === 'Intro Forest';
    case 'Mesa':             return isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000;
    case 'Basement':         return level === 1;
    case 'Penthouse':        return level === 20;
    case 'mystery_high':     return mysteryOutlier === 'high';
    case 'mystery_low':      return mysteryOutlier === 'low';
    default:                 return false;
  }
}

function getParcelTierRank({ traits, pricing }) {
  const { level } = traits;
  const { zoneCategory, biomeCategory } = pricing;
  const levelCat = getLevelCategory(level);
  const top = [zoneCategory, biomeCategory, levelCat]
    .filter(c => c && c !== 'Floor')
    .sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))[0];
  return top ? (CATEGORY_ORDER[top] ?? 4) : 4;
}

export default function WalletView({ data, loading, address }) {
  const [sortBy, setSortBy] = useState('id');
  const [highlightFilter, setHighlightFilter] = useState(new Set());
  const [attrFilters, setAttrFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  // Token id whose animation is open over the grid, or null. Lives here rather
  // than in ParcelCard so only one can be open at a time.
  const [zoomed, setZoomed] = useState(null);

  const sortedParcels = useMemo(() => {
    const arr = data?.parcels ? [...data.parcels] : [];
    if (sortBy === 'tier') {
      return arr.sort((a, b) => {
        const diff = getParcelTierRank(a) - getParcelTierRank(b);
        return diff !== 0 ? diff : a.tokenId - b.tokenId;
      });
    }
    return arr.sort((a, b) => a.tokenId - b.tokenId);
  }, [data?.parcels, sortBy]);

  const ownedHighlights = useMemo(() => computeOwnedHighlights(sortedParcels), [sortedParcels]);

  const filterOptions = useMemo(() => buildFilterOptions(sortedParcels), [sortedParcels]);

  // Highlight chips and attribute filters compose with AND: a parcel must carry
  // one of the selected badges *and* match every attribute selection.
  const displayParcels = useMemo(() => {
    const byBadge = highlightFilter.size === 0
      ? sortedParcels
      : sortedParcels.filter(p => [...highlightFilter].some(key => parcelHasBadge(p, key)));
    if (!hasActiveFilters(attrFilters)) return byBadge;
    return byBadge.filter(p => matchesFilters(p, attrFilters));
  }, [sortedParcels, highlightFilter, attrFilters]);

  const toggleAttrFilter = (key, value) => setAttrFilters(prev => toggleFilterValue(prev, key, value));
  const resetAttrFilters = () => setAttrFilters(EMPTY_FILTERS);
  const activeAttrCount = countActiveFilters(attrFilters);

  if (loading) {
    return (
      <div className="text-sm opacity-75">
        [loading parcels for {address?.slice(0, 6)}...{address?.slice(-4)}]
        <br />
        <span className="opacity-55 text-xs">this may take a moment for large collections...</span>
      </div>
    );
  }

  if (!data) return null;

  const { sets, totalParcels, fetchedParcels, snapshotFallbacks = 0 } = data;

  const gridTemplate = getWalletGridTemplate();

  return (
    <div>
      {/* Attribute filters — zone / biome / mode / chroma, collapsed by default */}
      {sortedParcels.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowFilters(v => !v)}
            className="btn-primary btn-sm text-xs mb-3"
          >
            {showFilters ? '[hide filters]' : '[filter parcels]'}
            {activeAttrCount > 0 && <span style={{ opacity: 0.6 }}> · {activeAttrCount}</span>}
          </button>

          {showFilters && (
            <ParcelFilterPanel
              options={filterOptions}
              filters={attrFilters}
              onToggle={toggleAttrFilter}
              onReset={resetAttrFilters}
              onClose={() => setShowFilters(false)}
            />
          )}

          <ActiveFilterChips
            filters={attrFilters}
            onToggle={toggleAttrFilter}
            onReset={resetAttrFilters}
          />
        </div>
      )}

      {/* Collection highlights — always show all types, grey if not owned */}
      <div className="mb-8">
        <h2 className="text-lg mb-3 opacity-80">[terraforms collected]</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_HIGHLIGHTS.map(({ key, label, color }) => {
            const owned = ownedHighlights.has(key);
            const active = highlightFilter.has(key);
            return (
              <button
                key={key}
                onClick={() => {
                  if (!owned) return;
                  setHighlightFilter(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                }}
                className="text-xs px-1"
                style={{
                  color: owned ? color : 'rgba(200,200,200,0.25)',
                  border: `1px solid ${owned ? color : 'rgba(200,200,200,0.15)'}`,
                  opacity: active ? 1 : owned ? 0.85 : 1,
                  outline: active ? `1px solid ${color}` : 'none',
                  outlineOffset: '2px',
                  cursor: owned ? 'pointer' : 'default',
                  background: active ? `${color}18` : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {highlightFilter.size > 0 && (
          <p className="text-xs mt-2" style={{ opacity: 0.45 }}>
            filtering by {[...highlightFilter].map(k => ALL_HIGHLIGHTS.find(h => h.key === k)?.label).join(' + ')} —{' '}
            <button onClick={() => setHighlightFilter(new Set())} style={{ textDecoration: 'underline' }}>
              clear
            </button>
          </p>
        )}
      </div>

      {/* Sets — compact name chips, all on one row */}
      {sets?.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg mb-3 opacity-80">[sets]</h2>
          <div className="flex flex-wrap gap-2">
            {sets.map(set => (
              <SetChip key={set.name} set={set} />
            ))}
          </div>
        </div>
      )}

      {totalParcels > fetchedParcels && (
        <p className="text-xs opacity-55 mb-4">
          [showing {fetchedParcels} of {totalParcels} parcels]
        </p>
      )}

      {snapshotFallbacks > 0 && (
        <p className="text-xs opacity-55 mb-4">
          [{snapshotFallbacks} parcel{snapshotFallbacks === 1 ? '' : 's'} shown from cached traits — chroma/mode/level may be out of date]
        </p>
      )}

      {sortedParcels.length === 0 ? (
        <p className="opacity-75 text-sm">no terraforms parcels found in this wallet.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 text-xs" style={{ opacity: 0.5 }}>
            <span>sort:</span>
            <button onClick={() => setSortBy('id')} style={{ opacity: sortBy === 'id' ? 1 : 0.4 }}>token id</button>
            <span style={{ opacity: 0.3 }}>|</span>
            <button onClick={() => setSortBy('tier')} style={{ opacity: sortBy === 'tier' ? 1 : 0.4 }}>tier</button>
            {displayParcels.length !== sortedParcels.length && (
              <span className="ml-auto">showing {displayParcels.length} of {sortedParcels.length}</span>
            )}
          </div>
          {displayParcels.length === 0 ? (
            <p className="opacity-75 text-sm">
              no parcels match the selected filters.{' '}
              <button
                onClick={() => { resetAttrFilters(); setHighlightFilter(new Set()); }}
                style={{ textDecoration: 'underline' }}
              >
                reset
              </button>
            </p>
          ) : (
            <div
              className="grid w-full gap-4"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {displayParcels.map(parcel => (
                <ParcelCard key={parcel.tokenId} parcel={parcel} onZoom={setZoomed} />
              ))}
            </div>
          )}
        </>
      )}
      {zoomed != null && <ParcelZoom tokenId={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}

function SetChip({ set }) {
  const [hovered, setHovered] = useState(false);
  const { name, completed, missingCount, missingItems } = set;
  const color = SET_COLORS[name];

  const tooltipText = completed
    ? 'completed'
    : missingCount === 1
      ? `1 away: ${missingItems?.[0] ?? '?'}`
      : `missing ${missingCount}`;

  const chipStyle = completed
    ? { color, border: `1px solid ${color}`, opacity: 0.85 }
    : missingCount === 1
      ? { color: 'rgba(200,200,200,0.4)', border: '1px solid rgba(200,200,200,0.2)' }
      : { color: 'rgba(200,200,200,0.2)', border: '1px solid rgba(200,200,200,0.1)' };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        className="text-xs px-1 py-0.5"
        style={{ ...chipStyle, cursor: 'default', userSelect: 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {name}
      </span>
      {hovered && (
        <span style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '4px',
          background: 'rgba(18,18,18,0.97)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.75)',
          fontSize: '11px',
          padding: '2px 6px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {tooltipText}
        </span>
      )}
    </span>
  );
}


// The parcel's live animation, blown up over the grid.
//
// The grid shows the static SVG from /image — cheap, and 145 of them can share a
// page. The animation is the on-chain tokenHTML, served by mathcastles and framed
// the same way ParcelResult frames it, which is why the site CSP already allows
// that host. One iframe on demand rather than one per card.
//
// Dismissal: anywhere on the backdrop, or Escape. The iframe is sandboxed, so a
// click that lands inside the animation itself never reaches this component —
// hence the explicit [close] affordance, so the way out is always visible.
function ParcelZoom({ tokenId, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Stop the grid scrolling behind the overlay, and put it back exactly as it
    // was — reading overflow off the element rather than assuming it was ''.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Parcel ${tokenId} animation`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-4"
      style={{ background: 'rgba(10, 10, 10, 0.92)' }}
    >
      {/* 277:400 is the parcel's native ratio. Height leads so a short, wide
          window cannot push the frame past the bottom of the viewport; the width
          term caps it on a tall, narrow one. */}
      <div
        className="relative"
        style={{
          height: 'min(82vh, calc(82vw * 400 / 277))',
          aspectRatio: '277 / 400',
          maxWidth: '100%',
        }}
      >
        <span className="absolute inset-0 bg-placeholder animate-pulse" />
        <iframe
          src={`https://tokens.mathcastles.xyz/terraforms/token-html/${tokenId}`}
          title={`Parcel ${tokenId}`}
          scrolling="no"
          sandbox="allow-scripts"
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none', display: 'block' }}
        />
      </div>
      <div className="flex items-center gap-4 text-sm">
        <a href={`/?token=${tokenId}`} className="no-underline opacity-70 hover:opacity-100" onClick={e => e.stopPropagation()}>
          {tokenId}
        </a>
        <button
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer p-0 font-inherit text-sm opacity-70 hover:opacity-100"
        >
          [close]
        </button>
      </div>
    </div>
  );
}

function ParcelCard({ parcel, onZoom }) {
  const { tokenId, traits, pricing, pricingV2 } = parcel;
  const { zone, biome, level, chroma, mysteryOutlier, mode, specialType, isOneOfOne, isS0 } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;
  // Bid side per card, so a card and the wallet total below it agree. A wallet is
  // worth what selling it realises, and selling in size means taking offers.
  const displayValue = pricingV2 ? pricingV2.off : estimatedValue;

  const levelCategory = getLevelCategory(level);

  const topCategory = [zoneCategory, biomeCategory, levelCategory].filter(Boolean).sort((a, b) => {
    const order = { Mythical: 0, Rare: 1, Premium: 2, 'Uncommon': 3, Floor: 4 };
    return order[a] - order[b];
  })[0];

  const isHighValueSpecial = (mode === 'Origin Daydream' || mode === 'Origin Terraform') || specialType in SPECIAL_TYPE_BADGES || isOneOfOne || isS0 || biome === 0;
  const showCategoryBadge = topCategory != null && !(topCategory === 'Floor' && isHighValueSpecial);
  const specialBadge = SPECIAL_TYPE_BADGES[specialType];

  return (
    <div className="relative">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '277 / 400' }}>
        <span className="absolute inset-0 bg-placeholder animate-pulse" />
        <img
          src={parcelImage(tokenId)}
          alt={`Parcel ${tokenId}`}
          className="absolute inset-0 w-full h-full cursor-pointer transition-opacity opacity-100"
          loading="lazy"
          style={{ transitionDuration: '300ms', objectFit: 'cover' }}
          onClick={() => onZoom?.(tokenId)}
          onError={e => { e.target.style.opacity = 0; e.target.parentNode.querySelector('span').classList.remove('animate-pulse'); }}
        />
      </div>
      <div className="flex flex-col">
        <div className="flex justify-between items-center mt-1">
          <a href={`/?token=${tokenId}`}>{tokenId}</a>
          <span className="hidden lg:flex items-center gap-1 text-sm">
            <EthIcon width={8} height={13} />
            {displayValue.toFixed(3)}
          </span>
        </div>
        <p className="hidden lg:block text-xs opacity-75 mt-0.5">{zone}/B{biome}/{chroma || 'Flow'}/L{level}/{(mode || 'Terrain').replace('Origin ', '')}</p>
        <div className="hidden lg:flex items-center gap-1 flex-wrap mt-1">
          {showCategoryBadge && (
            <span
              className="text-xs px-1"
              style={{
                color: CATEGORY_COLORS[topCategory],
                border: `1px solid ${CATEGORY_COLORS[topCategory]}`,
                opacity: 0.8
              }}
            >
              {topCategory}
            </span>
          )}
          {specialBadge      && <SpecialBadge config={specialBadge} opacity={0.8} />}
          <AutoBadgeStack traits={traits} opacity={0.8} />
          <MysteryBadge outlier={mysteryOutlier} opacity={0.8} />
          {(mode === 'Origin Daydream' || mode === 'Origin Terraform') && (
            <SpecialBadge type={mode} opacity={0.8} />
          )}
        </div>
      </div>
    </div>
  );
}
