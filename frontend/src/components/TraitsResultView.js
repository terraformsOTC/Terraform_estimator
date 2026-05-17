'use client';

import { API_URL, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, AutoBadgeStack, MysteryBadge } from './shared';
import { getWalletGridTemplate } from '@/lib/walletGrid.mjs';
import UnmintedStaticThumb from './UnmintedStaticThumb';

const CATEGORY_ORDER = { Mythical: 0, Rare: 1, Premium: 2, 'Uncommon': 3, Floor: 4 };

export default function TraitsResultView({ parcels }) {
  if (!parcels || parcels.length === 0) {
    return <p className="text-sm opacity-75">no parcels found.</p>;
  }
  const gridTemplate = getWalletGridTemplate();
  return (
    <div
      className="grid w-full mt-4 gap-4"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {parcels.map(p => <TraitParcelCard key={p.tokenId} parcel={p} />)}
    </div>
  );
}

function TraitParcelCard({ parcel }) {
  const { tokenId, traits, isUnminted, unmintedId } = parcel;
  const { zone, biome, level, chroma, mode, specialType, mysteryOutlier, isOneOfOne, isS0 } = traits;
  const href = `/?token=${tokenId}`;
  const specialBadge = SPECIAL_TYPE_BADGES[specialType];
  const isHighValueSpecial = (mode === 'Origin Daydream' || mode === 'Origin Terraform')
    || specialType in SPECIAL_TYPE_BADGES
    || isOneOfOne
    || isS0
    || biome === 0;

  return (
    <div className="relative">
      <a href={href} className="block no-underline">
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '277 / 400' }}>
          {isUnminted ? (
            <UnmintedThumbnail unmintedId={unmintedId} />
          ) : (
            <MintedThumbnail tokenId={tokenId} />
          )}
        </div>
      </a>
      <div className="flex flex-col">
        <div className="flex justify-between items-center mt-1">
          <a href={href} className="no-underline">{isUnminted ? `#${unmintedId} U` : tokenId}</a>
        </div>
        <p className="hidden lg:block text-xs opacity-75 mt-0.5">
          {zone}/B{biome}/{chroma || 'Flow'}/L{level}/{(mode || 'Terrain').replace('Origin ', '')}
        </p>
        <div className="hidden lg:flex items-center gap-1 flex-wrap mt-1">
          {specialBadge && <SpecialBadge config={specialBadge} opacity={0.8} />}
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

function MintedThumbnail({ tokenId }) {
  return (
    <>
      <span className="absolute inset-0 bg-placeholder animate-pulse" />
      <img
        src={`${API_URL}/image/${tokenId}`}
        alt={`Parcel ${tokenId}`}
        className="absolute inset-0 w-full h-full cursor-pointer transition-opacity opacity-100"
        loading="lazy"
        style={{ transitionDuration: '300ms', objectFit: 'cover' }}
        onError={e => {
          e.target.style.opacity = 0;
          e.target.parentNode.querySelector('span')?.classList.remove('animate-pulse');
        }}
      />
    </>
  );
}

// Lazy-loaded static frame of the parcel animation, dimmed with an [unminted]
// #id overlay. IntersectionObserver in the component defers fetches until the
// card scrolls near the viewport, and fonts dedupe globally by fontIndex.
function UnmintedThumbnail({ unmintedId }) {
  return <UnmintedStaticThumb unmintedId={unmintedId} />;
}
