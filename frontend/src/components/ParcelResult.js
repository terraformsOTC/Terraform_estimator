'use client';

const CATEGORY_COLORS = {
  Grail: '#ffd700',
  Rare: '#c084fc',
  Premium: '#60a5fa',
  'Premium Floor': '#34d399',
  Floor: 'inherit',
};

export default function ParcelResult({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, chroma, mode, specialType, mysteryValue, mysteryOutlier } = traits;

  if (pricing.isSpecial) {
    return <SpecialParcelResult tokenId={tokenId} traits={traits} pricing={pricing} />;
  }

  const {
    estimatedValue, floor, formula,
    zoneMultiple, biomeMultiple, zonebiomeAvg,
    levelMultiple, chromaMultiple, modeMultiple, totalMultiple,
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
          <p className="opacity-60 text-sm">L{level}/B{biome}/{zone}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <div>
          <p className="text-xs opacity-40 uppercase tracking-widest mb-1">estimated value</p>
          <div className="flex items-center gap-2">
            <EthIcon />
            <span className="text-3xl">{estimatedValue.toFixed(3)}</span>
          </div>
          <p className="text-xs opacity-40 mt-1">floor: {floor} ETH × {totalMultiple}x combined multiplier</p>
        </div>

        <div className="flex flex-col gap-0">
          <TraitRow label="zone" value={zone || '—'} category={zoneCategory} multiple={zoneMultiple} />
          <TraitRow label="biome" value={`B${biome}`} category={biomeCategory} multiple={biomeMultiple} />
          <Divider label="zone/biome avg" value={`${zonebiomeAvg}x`} />
          <SimpleRow label="level" value={`L${level}`} multiple={levelMultiple} note={levelMultiple !== 1 ? `${levelMultiple}x` : null} />
          <SimpleRow label="chroma" value={chroma || 'Flow'} multiple={chromaMultiple} note={chromaMultiple !== 1 ? `${chromaMultiple}x` : null} />
          <SimpleRow label="mode" value={mode || 'Terrain'} multiple={modeMultiple} note={modeMultiple !== 1 ? `${modeMultiple}x` : null} />
          {mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
        </div>

        <div className="mt-1">
          <p className="text-xs opacity-25 break-all">{formula}</p>
        </div>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}

function SpecialParcelResult({ tokenId, traits, pricing }) {
  const { zone, biome, level, chroma, mode, specialType } = traits;
  const { estimatedValue, floor, specialMultiple, formula } = pricing;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <ParcelImage tokenId={tokenId} />
        <div className="mt-1">
          <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="no-underline">
            {tokenId}
          </a>
          <p className="opacity-60 text-sm">L{level}/B{biome}/{zone}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs opacity-40 uppercase tracking-widest mb-1">estimated value</p>
          <div className="flex items-center gap-2">
            <EthIcon />
            <span className="text-3xl">{estimatedValue.toFixed(3)}</span>
          </div>
        </div>

        <div
          className="px-3 py-2 text-sm"
          style={{ border: `1px solid ${CATEGORY_COLORS['Grail']}`, color: CATEGORY_COLORS['Grail'] }}
        >
          special parcel: {specialType} — {specialMultiple}x multiplier
        </div>

        <p className="text-xs opacity-30">
          special parcels are priced independently of zone/biome/level/chroma/mode
        </p>

        <div className="text-xs opacity-25">{formula}</div>

        <ExternalLinks tokenId={tokenId} />
      </div>
    </div>
  );
}

function TraitRow({ label, value, category, multiple }) {
  const color = CATEGORY_COLORS[category] || 'inherit';
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-50">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
          {category}
        </span>
        <span className="text-sm opacity-40">{multiple}x</span>
      </div>
    </div>
  );
}

function Divider({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 mb-2 opacity-40 text-xs">
      <span>↳ {label}</span>
      <span>{value}</span>
    </div>
  );
}

function SimpleRow({ label, value, multiple, note }) {
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-50">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value}</span>
        {note && <span className="text-sm opacity-40">{note}</span>}
        {!note && <span className="text-sm opacity-25">1x</span>}
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
      <span className="text-sm" style={{ opacity: accent ? 0.7 : 0.3 }}>???</span>
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ opacity: accent ? 0.9 : 0.3 }}>{value.toLocaleString()}</span>
        {accent && (
          <span className="text-xs px-1" style={{ color: accent, border: `1px solid ${accent}`, opacity: 0.85 }}>
            {isHigh ? 'top 5%' : 'bottom 5%'}
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
      <img
        src={`https://api.terraformexplorer.xyz/tokens/${tokenId}/image`}
        alt={`Parcel ${tokenId}`}
        style={{ width: 277, height: 400, objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
        onError={e => { e.target.style.display = 'none'; }}
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

function EthIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.8 }}>
      <path d="M5 0L0 8.15L5 11L10 8.15L5 0Z" />
      <path d="M0 9.1L5 16L10 9.1L5 12L0 9.1Z" />
    </svg>
  );
}
