'use client';

import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge } from './shared';
import TerraformAnimation from './TerraformAnimation';

export default function UnmintedResult({ parcel }) {
  const { traits, pricing, animData } = parcel;
  const { level, x, y, biome, zone, chroma, seed, mysteryValue, mysteryOutlier, specialType, mode } = traits;

  const levelCategory = (level === 1 || level === 20) ? 'Mythical'
                       : (level === 2 || level === 3 || level === 18 || level === 19) ? 'Rare'
                       : null;

  if (pricing.isSpecial) {
    return <UnmintedSpecialResult traits={traits} pricing={pricing} animData={animData} />;
  }

  const { estimatedValue, floor, zoneCategory, biomeCategory } = pricing;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <UnmintedAnimation animData={animData} />
        <div className="mt-1">
          <p className="opacity-75 text-sm">L{level}/X{x}/Y{y}</p>
          <p className="opacity-55 text-xs">{zone}/B{biome}/{chroma}/L{level}</p>
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
          <SimpleRow label="mode" value="Terrain" />
          {mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
          <SimpleRow label="seed" value={seed} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SpecialBadge type="Unminted" />
          {specialType && <SpecialBadge type={specialType} />}
        </div>

        <UnmintedLinks level={level} x={x} y={y} />
      </div>
    </div>
  );
}

function UnmintedSpecialResult({ traits, pricing, animData }) {
  const { level, x, y, biome, zone, chroma, seed, specialType } = traits;
  const { estimatedValue, floor } = pricing;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <UnmintedAnimation animData={animData} />
        <div className="mt-1">
          <p className="opacity-75 text-sm">L{level}/X{x}/Y{y}</p>
          <p className="opacity-55 text-xs">{zone}/B{biome}/{chroma}/L{level}</p>
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
          <SpecialBadge type="Unminted" />
        </div>

        <p className="text-xs opacity-45">
          special parcel types are priced independently.
        </p>

        <UnmintedLinks level={level} x={x} y={y} />
      </div>
    </div>
  );
}

function UnmintedAnimation({ animData }) {
  return <TerraformAnimation animData={animData} width={200} height={288} />;
}

function UnmintedLinks({ level, x, y }) {
  const terrafansUrl = `https://terrafans.xyz/all/index.php?level=${level}&x=${x}&y=${y}`;
  return (
    <div className="flex gap-3 text-sm">
      <a href={terrafansUrl} target="_blank" rel="noopener noreferrer" className="no-underline opacity-60 hover:opacity-100">
        [terrafans ↗]
      </a>
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

function SimpleRow({ label, value }) {
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">{label}</span>
      <span className="text-sm">{value}</span>
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
