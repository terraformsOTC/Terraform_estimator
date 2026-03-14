'use client';

import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge } from './shared';

export default function ParcelResult({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryValue, mysteryOutlier } = traits;

  if (pricing.isSpecial) {
    return <SpecialParcelResult tokenId={tokenId} traits={traits} pricing={pricing} />;
  }

  const {
    estimatedValue, floor,
    zoneMultiple, biomeMultiple,
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
          <p className="opacity-75 text-sm">{zone}/B{biome}/{chroma || 'Flow'}/L{level}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <div>
          <p className="text-xs opacity-60 uppercase tracking-widest mb-1">estimated value</p>
          <div className="flex items-center gap-2">
            <EthIcon />
            <span className="text-3xl">{estimatedValue.toFixed(3)}</span>
          </div>
          <p className="text-xs opacity-55 mt-1">floor: {floor} ETH</p>
        </div>

        <div className="flex flex-col gap-0">
          <TraitRow label="zone" value={zone || '—'} category={zoneCategory} />
          <TraitRow label="biome" value={`B${biome}`} category={biomeCategory} />
          <SimpleRow label="level" value={`L${level}`} />
          <SimpleRow label="chroma" value={chroma || 'Flow'} />
          <SimpleRow label="mode" value={mode || 'Terrain'} />
{mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
          <SpecialTypeRow mode={mode} specialType={specialType} isOneOfOne={isOneOfOne} isGodmode={isGodmode} isS0={isS0} isLith0like={isLith0like} isGm={isGm} biome={biome} level={level} zone={zone} chroma={chroma} mysteryOutlier={mysteryOutlier} />
        </div>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}

function SpecialParcelResult({ tokenId, traits, pricing }) {
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm } = traits;
  const { estimatedValue, floor, specialMultiple, formula } = pricing;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <ParcelImage tokenId={tokenId} />
        <div className="mt-1">
          <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="no-underline">
            {tokenId}
          </a>
          <p className="opacity-75 text-sm">{zone}/B{biome}/{chroma || 'Flow'}/L{level}</p>
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

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm opacity-65">special parcel:</span>
          <SpecialBadge type={specialType} />
          {isGodmode && <SpecialBadge type="Godmode" />}
          {isOneOfOne && specialType !== '1of1' && <SpecialBadge type="1of1" />}
          {isS0       && <SpecialBadge type="S0" />}
          {biome === 0 && specialType !== 'Lith0' && <SpecialBadge type="Biome0" />}
          {isLith0like && <SpecialBadge type="Lith0like" />}
          {isGm        && <SpecialBadge type="gm" />}
          {mode === 'Terrain' && biome === 42 && <SpecialBadge type="BigGrass" />}
          {mode === 'Terrain' && biome === 65 && <SpecialBadge type="LittleGrass" />}
          {mode === 'Terrain' && biome === 58 && zone === 'Intro Forest' && <SpecialBadge type="Matrix" />}
          {level === 1  && <SpecialBadge type="Basement" />}
          {level === 20 && <SpecialBadge type="Penthouse" />}
        </div>

        <p className="text-xs opacity-45">
          special parcels are priced independently of zone/biome/level/chroma/mode
        </p>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}

function TraitRow({ label, value, category }) {
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

function SimpleRow({ label, value, multiple, note, badge }) {
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        {badge && <SpecialBadge config={badge} />}
        {note && <span className="text-sm opacity-55">{note}</span>}
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

function SpecialTypeRow({ mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, biome, level, zone, chroma, mysteryOutlier }) {
  // OD/OT mode takes precedence over specialType for primary display
  const primaryKey = mode === 'Origin Daydream'  ? 'Origin Daydream'
                   : mode === 'Origin Terraform' ? 'Origin Terraform'
                   : specialType;
  const primaryConfig   = SPECIAL_TYPE_BADGES[primaryKey];
  const showBiome0      = biome === 0 && specialType !== 'Lith0';
  const isTerrain       = mode === 'Terrain';
  const showBigGrass    = isTerrain && biome === 42;
  const showLittleGrass = isTerrain && biome === 65;
  const showHeartbeat   = isTerrain && zone === '[BLOOD]' && chroma === 'Pulse';
  const showMatrix      = isTerrain && biome === 58 && zone === 'Intro Forest';
  const showMesa        = isTerrain && biome === 39 && mysteryOutlier === 'low';
  const showLith0like   = !!isLith0like;
  const showGm          = !!isGm;
  const showBasement    = level === 1;
  const showPenthouse   = level === 20;
  // Show extra 1of1 badge only when there is already a different primary badge
  const showAlso1of1    = isOneOfOne && !!primaryConfig && primaryKey !== '1of1';
  const hasNothing      = !primaryConfig && !isOneOfOne && !isGodmode && !isS0 && !showBiome0 && !showLith0like && !showGm && !showBigGrass && !showLittleGrass && !showHeartbeat && !showMatrix && !showMesa && !showBasement && !showPenthouse;

  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">special</span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {primaryConfig  ? <SpecialBadge config={primaryConfig} />
         : isOneOfOne   ? <SpecialBadge type="1of1" />
         : hasNothing   ? <span className="text-sm opacity-35">No</span>
         : null}
        {isGodmode      && <SpecialBadge type="Godmode" />}
        {showAlso1of1   && <SpecialBadge type="1of1" />}
        {isS0           && <SpecialBadge type="S0" />}
        {showBiome0     && <SpecialBadge type="Biome0" />}
        {showLith0like  && <SpecialBadge type="Lith0like" />}
        {showGm         && <SpecialBadge type="gm" />}
        {showBigGrass   && <SpecialBadge type="BigGrass" />}
        {showLittleGrass && <SpecialBadge type="LittleGrass" />}
        {showHeartbeat  && <SpecialBadge type="Heartbeat" />}
        {showMatrix     && <SpecialBadge type="Matrix" />}
        {showMesa        && <SpecialBadge type="Mesa" />}
        {showBasement   && <SpecialBadge type="Basement" />}
        {showPenthouse  && <SpecialBadge type="Penthouse" />}
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
        sandbox="allow-scripts"
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

