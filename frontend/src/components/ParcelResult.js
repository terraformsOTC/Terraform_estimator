'use client';

import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, AutoBadgeStack, hasBadges, TraitRow, SimpleRow, MysteryRow, getLevelCategory, getMoneySwordMultiplier, getZoneLoreUrl } from './shared';
import { useMoneySword } from '@/contexts/MoneySword';

// Shadow model is off by default: the headline estimate stays v1 until the /sales
// scorecard justifies a cutover. Set NEXT_PUBLIC_SHOW_HEDONIC=true to preview it
// site-wide; /hedonic passes showHedonic explicitly so the staging page can show
// the band without turning it on for everyone.
const SHOW_HEDONIC = process.env.NEXT_PUBLIC_SHOW_HEDONIC === 'true';

export default function ParcelResult({ parcel, ethUsd, showHedonic = SHOW_HEDONIC }) {
  const { tokenId, traits, pricing, pricingV2 } = parcel;
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryValue, mysteryOutlier, seed, x, y } = traits;
  const { estimatedValue, floor, zoneCategory, biomeCategory, isSpecial } = pricing;
  const [moneySword] = useMoneySword();
  const displayValue = moneySword ? estimatedValue * getMoneySwordMultiplier(pricing, level) : estimatedValue;

  const levelCategory = getLevelCategory(level);

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-2xl">
      <div className="flex-shrink-0">
        <ParcelImage tokenId={tokenId} />
        <div className="mt-1">
          <p className="opacity-75 text-xs">
            <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="no-underline">{tokenId}</a>{x != null && y != null ? ` · X${x}/Y${y}` : ''}
          </p>
          <p className="opacity-55 text-xs">{zone}/B{biome}/{chroma || 'Flow'}/L{level}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <div>
          <p className="text-xs opacity-60 uppercase tracking-widest mb-1">estimated value</p>
          <div className="flex items-center gap-2">
            <EthIcon />
            <span className="text-3xl">{displayValue.toFixed(3)}</span>
          </div>
          <p className="text-xs opacity-55 mt-1">floor: {floor} ETH{ethUsd ? ` / $${Math.round(floor * ethUsd).toLocaleString()}` : ''}</p>
          {isSpecial && <p className="text-xs opacity-45 mt-1">special parcel types are priced independently.</p>}
          {showHedonic && <HedonicRange pricingV2={pricingV2} />}
        </div>

        <div className="flex flex-col gap-0">
          {isSpecial
            ? <SimpleRow label="zone" value={zone || '—'} />
            : <TraitRow label="zone" value={zone || '—'} category={zoneCategory} />}
          {isSpecial
            ? <SimpleRow label="biome" value={`B${biome}`} />
            : <TraitRow label="biome" value={`B${biome}`} category={biomeCategory} />}
          {levelCategory
            ? <TraitRow label="level" value={`L${level}`} category={levelCategory} />
            : <SimpleRow label="level" value={`L${level}`} />}
          <SimpleRow label="chroma" value={chroma || 'Flow'} />
          <SimpleRow label="mode" value={mode || 'Terrain'} />
          {mysteryValue != null && <MysteryRow value={mysteryValue} outlier={mysteryOutlier} />}
          {seed != null && <SimpleRow label="seed" value={seed} />}
          <SpecialTypeRow mode={mode} specialType={specialType} isOneOfOne={isOneOfOne} isGodmode={isGodmode} isS0={isS0} isLith0like={isLith0like} isGm={isGm} biome={biome} level={level} zone={zone} chroma={chroma} mysteryOutlier={mysteryOutlier} mysteryValue={mysteryValue} />
        </div>

        <ExternalLinks tokenId={tokenId} zone={zone} />
      </div>
    </div>
  );
}

// Fitted hedonic model, shown as a band rather than a point: the two sub-models
// are fitted separately on bid and ask settlements, and across every floor regime
// measured bids clear ~1.05x floor while asks clear ~1.30x. That spread is a real
// market feature, so collapsing it to one number would overstate our precision.
// Tier-2 parcels (Godmode/Plague/seeds/Lith0) have too few sales to split, so they
// collapse to a single value.
function HedonicRange({ pricingV2 }) {
  if (!pricingV2) return null;
  const { off, on, tier, tierReason } = pricingV2;

  if (tier === 'tier2') {
    return (
      <p className="text-xs opacity-40 mt-2">
        hedonic v2: {on.toFixed(3)} ETH <span className="opacity-70">({tierReason} — priced from the v1 prior)</span>
      </p>
    );
  }

  return (
    <p className="text-xs opacity-40 mt-2">
      hedonic v2: {off.toFixed(3)} – {on.toFixed(3)} ETH{' '}
      <span className="opacity-70">(liquidation → retail)</span>
    </p>
  );
}

function SpecialTypeRow({ mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, biome, level, zone, chroma, mysteryOutlier, mysteryValue }) {
  const traits = { mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, biome, level, zone, chroma, mysteryOutlier, mysteryValue };
  const primaryKey = mode === 'Origin Daydream'  ? 'Origin Daydream'
                   : mode === 'Origin Terraform' ? 'Origin Terraform'
                   : specialType;
  const primaryConfig = SPECIAL_TYPE_BADGES[primaryKey];
  const hasNothing    = !primaryConfig && !hasBadges(traits);

  return (
    <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <span className="text-sm opacity-65">special</span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {primaryConfig  ? <SpecialBadge config={primaryConfig} />
         : isOneOfOne   ? <SpecialBadge type="1of1" />
         : hasNothing   ? <span className="text-sm opacity-35">No</span>
         : null}
        <AutoBadgeStack traits={traits} />
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

function ExternalLinks({ tokenId, zone }) {
  const loreUrl = getZoneLoreUrl(zone);
  return (
    <div className="flex gap-2 mt-1 flex-wrap">
      <a href={`https://opensea.io/assets/ethereum/0x4E1f41613c9084FdB9E34E11fAE9412427480e56/${tokenId}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm text-xs no-underline">
        [opensea ↗]
      </a>
      <a href={`https://terraformexplorer.xyz/tokens/${tokenId}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm text-xs no-underline">
        [explorer ↗]
      </a>
      {loreUrl && (
        <a href={loreUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm text-xs no-underline">
          [lore ↗]
        </a>
      )}
    </div>
  );
}
