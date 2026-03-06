'use client';

import { EthIcon, CATEGORY_COLORS } from './shared';

export default function ParcelResult({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, mysteryValue, mysteryOutlier } = traits;

  if (pricing.isSpecial) {
    return <SpecialParcelResult tokenId={tokenId} traits={traits} pricing={pricing} />;
  }

  const {
    estimatedValue, floor, formula,
    zoneMultiple, biomeMultiple, zonebiomeAvg,
    levelMultiple, chromaMultiple, modeMultiple,
    spineMultiple, oneOf1Multiple, biome0Multiple,
    totalMultiple,
    zoneCategory, biomeCategory,
  } = pricing;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <ParcelImage tokenId={tokenId} />
        <div className="mt-1">
          <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="no-underline">
            {tokenId}
          </a>
          <p className="opacity-75 text-sm">L{level}/B{biome}/{zone}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <div>
          <p className="text-xs opacity-60 uppercase tracking-widest mb-1">estimated value</p>
          <div className="flex items-center gap-2">
            <EthIcon />
            <span className="text-3xl">{estimatedValue.toFixed(3)}</span>
          </div>
          <p className="text-xs opacity-55 mt-1">floor: {floor} ETH × {totalMultiple}x combined multiplier</p>
        </div>

        <div className="flex flex-col gap-0">
          <TraitRow label="zone" value={zone || '—'} category={zoneCategory} multiple={zoneMultiple} />
          <TraitRow label="biome" value={`B${biome}`} category={biomeCategory} multiple={biomeMultiple} />
          <Divider label="zone/biome avg" value={`${zonebiomeAvg}x`} />
          <SimpleRow label="level" value={`L${level}`} multiple={levelMultiple} note={levelMultiple !== 1 ? `${levelMultiple}x` : null} />
          <SimpleRow label="chroma" value={chroma || 'Flow'} multiple={chromaMultiple} note={chromaMultiple !== 1 ? `${chromaMultiple}x` : null} />
          <SimpleRow label="mode" value={mode || 'Terrain'} multiple={modeMultiple} note={modeMultiple !== 1 ? `${modeMultiple}x` : null} badge={mode === 'Origin Daydream' ? { label: 'origin daydream', color: '#fb923c' } : null} />
          {spineMultiple > 1 && (
            <SimpleRow label="spine" value="+20%" note={`${spineMultiple}x`} />
          )}
          {oneOf1Multiple > 1 && (
            <SimpleRow label="1 of 1" value="+5%" note={`${oneOf1Multiple}x`} />
          )}
          {biome0Multiple > 1 && (
            <SimpleRow label="biome 0" value={`+${Math.round((biome0Multiple - 1) * 100)}%`} note={`${biome0Multiple}x`} />
          )}
          {mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
          <SpecialTypeRow mode={mode} specialType={specialType} isOneOfOne={isOneOfOne} biome={biome} />
        </div>

        <div className="mt-1">
          <p className="text-xs opacity-40 break-all">{formula}</p>
        </div>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}

function SpecialParcelResult({ tokenId, traits, pricing }) {
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne } = traits;
  const { estimatedValue, floor, specialMultiple, formula } = pricing;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <ParcelImage tokenId={tokenId} />
        <div className="mt-1">
          <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="no-underline">
            {tokenId}
          </a>
          <p className="opacity-75 text-sm">L{level}/B{biome}/{zone}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs opacity-60 uppercase tracking-widest mb-1">estimated value</p>
          <div className="flex items-center gap-2">
            <EthIcon />
            <span className="text-3xl">{estimatedValue.toFixed(3)}</span>
          </div>
        </div>

        <div
          className="px-3 py-2 text-sm flex items-center gap-2 flex-wrap"
          style={{ border: `1px solid ${CATEGORY_COLORS['Grail']}`, color: CATEGORY_COLORS['Grail'] }}
        >
          <span>special parcel: {specialType} — {specialMultiple}x multiplier</span>
          {isOneOfOne && specialType !== '1of1' && (
            <span className="text-xs px-1" style={{ color: '#ffd700', border: '1px solid #ffd700', opacity: 0.85 }}>
              1 of 1
            </span>
          )}
          {parseInt(biome) === 0 && (
            <span className="text-xs px-1" style={{ color: '#22d3ee', border: '1px solid #22d3ee', opacity: 0.85 }}>
              biome 0
            </span>
          )}
        </div>

        <p className="text-xs opacity-45">
          special parcels are priced independently of zone/biome/level/chroma/mode
        </p>

        <div className="text-xs opacity-40">{formula}</div>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}

function TraitRow({ label, value, category, multiple }) {
  const color = CATEGORY_COLORS[category] || 'inherit';
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
          {category}
        </span>
        <span className="text-sm opacity-55">{multiple}x</span>
      </div>
    </div>
  );
}

function Divider({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 mb-2 opacity-55 text-xs">
      <span>↳ {label}</span>
      <span>{value}</span>
    </div>
  );
}

function SimpleRow({ label, value, multiple, note, badge }) {
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        {badge && (
          <span className="text-xs px-1" style={{ color: badge.color, border: `1px solid ${badge.color}`, opacity: 0.85 }}>
            {badge.label}
          </span>
        )}
        {note && <span className="text-sm opacity-55">{note}</span>}
        {!note && <span className="text-sm opacity-35">1x</span>}
      </div>
    </div>
  );
}

function MysteryRow({ value, outlier }) {
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

const SPECIAL_TYPE_CONFIG = {
  'Origin Daydream':  { label: 'origin daydream',  color: '#fb923c' },
  'Origin Terraform': { label: 'origin terraform', color: '#fb923c' },
  'Plague':           { label: 'plague',            color: '#e879f9' },
  'X-Seed':           { label: 'x-seed',            color: '#4ade80' },
  'Y-Seed':           { label: 'y-seed',            color: '#2dd4bf' },
  'Lith0':            { label: 'lith0',             color: '#a5b4fc' },
  'Spine':            { label: 'spine',             color: '#f87171' },
  '1of1':             { label: '1 of 1',            color: '#ffd700' },
  'Biome0':           { label: 'biome 0',           color: '#22d3ee' },
};

function SpecialTypeRow({ mode, specialType, isOneOfOne, biome }) {
  // OD/OT mode takes precedence over specialType for primary display
  const primaryKey = mode === 'Origin Daydream'  ? 'Origin Daydream'
                   : mode === 'Origin Terraform' ? 'Origin Terraform'
                   : specialType;
  const primaryConfig = SPECIAL_TYPE_CONFIG[primaryKey];

  const oneOf1Config  = SPECIAL_TYPE_CONFIG['1of1'];
  const biome0Config  = SPECIAL_TYPE_CONFIG['Biome0'];
  const showBiome0    = parseInt(biome) === 0;
  // Show extra 1of1 badge only when there is already a different primary badge
  const showAlso1of1  = isOneOfOne && !!primaryConfig && primaryKey !== '1of1';

  const hasNothing = !primaryConfig && !isOneOfOne && !showBiome0;

  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">special</span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {primaryConfig ? (
          <span className="text-xs px-1" style={{ color: primaryConfig.color, border: `1px solid ${primaryConfig.color}`, opacity: 0.85 }}>
            {primaryConfig.label}
          </span>
        ) : isOneOfOne ? (
          <span className="text-xs px-1" style={{ color: oneOf1Config.color, border: `1px solid ${oneOf1Config.color}`, opacity: 0.85 }}>
            {oneOf1Config.label}
          </span>
        ) : hasNothing ? (
          <span className="text-sm opacity-35">No</span>
        ) : null}
        {showAlso1of1 && (
          <span className="text-xs px-1" style={{ color: oneOf1Config.color, border: `1px solid ${oneOf1Config.color}`, opacity: 0.85 }}>
            {oneOf1Config.label}
          </span>
        )}
        {showBiome0 && (
          <span className="text-xs px-1" style={{ color: biome0Config.color, border: `1px solid ${biome0Config.color}`, opacity: 0.85 }}>
            {biome0Config.label}
          </span>
        )}
      </div>
    </div>
  );
}

function ParcelImage({ tokenId }) {
  return (
    <div className="relative" style={{ width: 277, height: 400 }}>
      <span className="flex bg-placeholder w-full animate-pulse absolute top-0 left-0" style={{ height: '100%' }} />
      <iframe
        src={`https://tokens.mathcastles.xyz/terraforms/token-html/${tokenId}`}
        title={`Parcel ${tokenId}`}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: 277,
          height: 400,
          border: 'none',
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
    </div>
  );
}

function ExternalLinks({ tokenId }) {
  return (
    <div className="flex gap-2 mt-1 flex-wrap">
      <a href={`https://opensea.io/assets/ethereum/0x4E1f41613c9084FdB9E34E11fAE9412427480e56/${tokenId}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm text-xs no-underline">
        [opensea ↗]
      </a>
      <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm text-xs no-underline">
        [explorer ↗]
      </a>
    </div>
  );
}

