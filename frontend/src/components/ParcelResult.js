'use client';

import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, BadgeStack, TraitRow, SimpleRow, MysteryRow } from './shared';

export default function ParcelResult({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryValue, mysteryOutlier, seed } = traits;

  if (pricing.isSpecial) {
    return <SpecialParcelResult tokenId={tokenId} traits={traits} pricing={pricing} />;
  }

  const {
    estimatedValue, floor,
    zoneMultiple, biomeMultiple,
    zoneCategory, biomeCategory,
  } = pricing;

  const levelCategory = (level === 1 || level === 20) ? 'Mythical'
                       : (level === 2 || level === 3 || level === 18 || level === 19) ? 'Rare'
                       : null;

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
          {levelCategory
            ? <TraitRow label="level" value={`L${level}`} category={levelCategory} />
            : <SimpleRow label="level" value={`L${level}`} />}
          <SimpleRow label="chroma" value={chroma || 'Flow'} />
          <SimpleRow label="mode" value={mode || 'Terrain'} />
{mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
          {seed != null && <SimpleRow label="seed" value={seed} />}
          <SpecialTypeRow mode={mode} specialType={specialType} isOneOfOne={isOneOfOne} isGodmode={isGodmode} isS0={isS0} isLith0like={isLith0like} isGm={isGm} biome={biome} level={level} zone={zone} chroma={chroma} mysteryOutlier={mysteryOutlier} mysteryValue={mysteryValue} />
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
          <BadgeStack traits={traits} />
        </div>

        <p className="text-xs opacity-45">
          special parcel types are priced independently.
        </p>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}


function SpecialTypeRow({ mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, biome, level, zone, chroma, mysteryOutlier, mysteryValue }) {
  const traits = { mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, biome, level, zone, chroma, mysteryOutlier, mysteryValue };
  // OD/OT mode takes precedence over specialType for primary display
  const primaryKey = mode === 'Origin Daydream'  ? 'Origin Daydream'
                   : mode === 'Origin Terraform' ? 'Origin Terraform'
                   : specialType;
  const primaryConfig   = SPECIAL_TYPE_BADGES[primaryKey];
  const isTerrain       = mode === 'Terrain';
  const hasNothing      = !primaryConfig && !isOneOfOne && !isGodmode && !isS0
    && !(biome === 0 && specialType !== 'Lith0') && !isLith0like && !isGm
    && !(isTerrain && biome === 42) && !(isTerrain && biome === 65)
    && !(isTerrain && zone === '[BLOOD]' && chroma === 'Pulse')
    && !(isTerrain && biome === 58 && zone === 'Intro Forest')
    && !(isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000)
    && level !== 1 && level !== 20;

  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">special</span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {primaryConfig  ? <SpecialBadge config={primaryConfig} />
         : isOneOfOne   ? <SpecialBadge type="1of1" />
         : hasNothing   ? <span className="text-sm opacity-35">No</span>
         : null}
        <BadgeStack traits={traits} />
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

