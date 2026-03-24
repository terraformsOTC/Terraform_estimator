'use client';

import { EthIcon, SpecialBadge, BadgeStack, TraitRow, SimpleRow, MysteryRow } from './shared';
import TerraformAnimation from './TerraformAnimation';

export default function UnmintedResult({ parcel }) {
  const { traits, pricing, animData } = parcel;
  const { id, level, x, y, biome, zone, chroma, seed, mysteryValue, mysteryOutlier, specialType } = traits;

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
          <p className="opacity-75 text-xs">#{id} · X{x}/Y{y}</p>
          <p className="opacity-55 text-xs">{zone}/B{biome}/{chroma || 'Flow'}/L{level}</p>
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
          <UnmintedSpecialRow traits={traits} />
        </div>

        <UnmintedLinks level={level} x={x} y={y} />
      </div>
    </div>
  );
}

function UnmintedSpecialResult({ traits, pricing, animData }) {
  const { id, level, x, y, biome, zone, chroma, seed, specialType, mysteryValue, mysteryOutlier } = traits;
  const { estimatedValue, floor } = pricing;

  const levelCategory = (level === 1 || level === 20) ? 'Mythical'
                       : (level === 2 || level === 3 || level === 18 || level === 19) ? 'Rare'
                       : null;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <UnmintedAnimation animData={animData} />
        <div className="mt-1">
          <p className="opacity-75 text-xs">#{id} · X{x}/Y{y}</p>
          <p className="opacity-55 text-xs">{zone}/B{biome}/{chroma || 'Flow'}/L{level}</p>
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
          <p className="text-xs opacity-45 mt-1">special parcel types are priced independently.</p>
        </div>

        <div className="flex flex-col gap-0">
          <SimpleRow label="zone" value={zone || '—'} />
          <SimpleRow label="biome" value={`B${biome}`} />
          {levelCategory
            ? <TraitRow label="level" value={`L${level}`} category={levelCategory} />
            : <SimpleRow label="level" value={`L${level}`} />}
          <SimpleRow label="chroma" value={chroma || 'Flow'} />
          <SimpleRow label="mode" value="Terrain" />
          {mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
          {seed != null && <SimpleRow label="seed" value={seed} />}
          <UnmintedSpecialRow traits={traits} />
        </div>

        <UnmintedLinks level={level} x={x} y={y} />
      </div>
    </div>
  );
}

function UnmintedSpecialRow({ traits }) {
  const { specialType } = traits;
  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">special</span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <SpecialBadge type="Unminted" />
        {specialType && <SpecialBadge type={specialType} />}
        <BadgeStack traits={traits} />
      </div>
    </div>
  );
}

function UnmintedAnimation({ animData }) {
  return <TerraformAnimation animData={animData} width={277} height={400} />;
}

function UnmintedLinks({ level, x, y }) {
  const terrafansUrl = `https://terrafans.xyz/all/index.php?level=${level}&x=${x}&y=${y}`;
  return (
    <div className="flex gap-2 mt-1 flex-wrap">
      <a href={terrafansUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm text-xs no-underline">
        [terrafans ↗]
      </a>
    </div>
  );
}

