'use client';

import { useMemo } from 'react';
import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, BadgeStack, API_URL } from './shared';

const ATTAINABILITY_COLORS = {
  'Easy': '#34d399',
  'Medium': '#60a5fa',
  'Very difficult': '#c084fc',
};

export default function WalletView({ data, loading, address }) {
  const sortedParcels = useMemo(
    () => data?.parcels ? [...data.parcels].sort((a, b) => a.tokenId - b.tokenId) : [],
    [data?.parcels],
  );

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

  const { sets, totalParcels, fetchedParcels } = data;

  const cols = Math.min(6, Math.max(4, sortedParcels.length));

  return (
    <div>
      {sets?.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg mb-4 opacity-80">[sets completed]</h2>
          <div className="flex flex-wrap gap-3">
            {sets.map(set => (
              <div key={set.name} className="border border-current border-opacity-20 px-3 py-2">
                <p className="text-sm font-semibold">{set.name}</p>
                <p className="text-xs opacity-65">{set.description}</p>
                <p
                  className="text-xs mt-1"
                  style={{ color: ATTAINABILITY_COLORS[set.attainability] || 'inherit' }}
                >
                  {set.attainability}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalParcels > fetchedParcels && (
        <p className="text-xs opacity-55 mb-4">
          [showing {fetchedParcels} of {totalParcels} parcels]
        </p>
      )}

      {sortedParcels.length === 0 ? (
        <p className="opacity-75 text-sm">no terraforms parcels found in this wallet.</p>
      ) : (
        <div
          className="grid w-full mt-4 gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {sortedParcels.map(parcel => (
            <ParcelCard key={parcel.tokenId} parcel={parcel} />
          ))}
        </div>
      )}
    </div>
  );
}


function ParcelCard({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, chroma, mysteryOutlier, mode, specialType, isOneOfOne, isS0 } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;

  const levelCategory = (level === 1 || level === 20) ? 'Mythical'
                       : (level === 2 || level === 3 || level === 18 || level === 19) ? 'Rare'
                       : null;

  const topCategory = [zoneCategory, biomeCategory, levelCategory].filter(Boolean).sort((a, b) => {
    const order = { Mythical: 0, Rare: 1, Premium: 2, 'Uncommon': 3, Floor: 4 };
    return order[a] - order[b];
  })[0];

  // For high-value special types, hide the "Floor" zone/biome badge — it's redundant noise.
  const isHighValueSpecial = (mode === 'Origin Daydream' || mode === 'Origin Terraform') || specialType in SPECIAL_TYPE_BADGES || isOneOfOne || isS0 || biome === 0;
  const showCategoryBadge = topCategory != null && !(topCategory === 'Floor' && isHighValueSpecial);
  const specialBadge = SPECIAL_TYPE_BADGES[specialType];

  return (
    <div className="relative">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '277 / 400' }}>
        <span className="absolute inset-0 bg-placeholder animate-pulse" />
        <img
          src={`${API_URL}/image/${tokenId}`}
          alt={`Parcel ${tokenId}`}
          className="absolute inset-0 w-full h-full cursor-pointer transition-opacity opacity-100"
          loading="lazy"
          style={{ transitionDuration: '300ms', objectFit: 'cover' }}
          onError={e => { e.target.style.opacity = 0; e.target.parentNode.querySelector('span').classList.remove('animate-pulse'); }}
        />
      </div>
      <div className="flex flex-col">
        <div className="flex flex-col mt-1">
          <a href={`/?token=${tokenId}`}>
            {tokenId}
          </a>
          <p className="text-xs opacity-75">{zone}/B{biome}/{chroma || 'Flow'}/L{level}/{(mode || 'Terrain').replace('Origin ', '')}</p>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex items-center gap-1 flex-wrap">
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
            <BadgeStack traits={traits} opacity={0.8} />
            {mysteryOutlier && (
              <span className="text-xs px-1" style={{
                color: mysteryOutlier === 'high' ? '#ffd700' : '#f87171',
                border: `1px solid ${mysteryOutlier === 'high' ? '#ffd700' : '#f87171'}`,
                opacity: 0.8,
              }}>
                {mysteryOutlier === 'high' ? 'high ???' : 'low ???'}
              </span>
            )}
            {(mode === 'Origin Daydream' || mode === 'Origin Terraform') && (
              <SpecialBadge type={mode} opacity={0.8} />
            )}
          </div>
          <span className="flex items-center gap-1 text-sm">
            <EthIcon width={8} height={13} />
            {estimatedValue.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

