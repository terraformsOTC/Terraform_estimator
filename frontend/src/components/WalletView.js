'use client';

import { useMemo } from 'react';
import { EthIcon, CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, API_URL } from './shared';

const ATTAINABILITY_COLORS = {
  'Easy': '#34d399',
  'Medium': '#60a5fa',
  'Very difficult': '#c084fc',
};

export default function WalletView({ data, loading, address }) {
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

  const { parcels, sets, totalParcels, fetchedParcels } = data;

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

      {parcels?.length === 0 ? (
        <p className="opacity-75 text-sm">no terraforms parcels found in this wallet.</p>
      ) : (
        <div
          className="grid w-full mt-4 gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          {useMemo(() => [...parcels].sort((a, b) => a.tokenId - b.tokenId), [parcels]).map(parcel => (
            <ParcelCard key={parcel.tokenId} parcel={parcel} />
          ))}
        </div>
      )}
    </div>
  );
}


function ParcelCard({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, mysteryOutlier, mode, specialType, isOneOfOne, isGodmode, isS0 } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;

  const topCategory = [zoneCategory, biomeCategory].sort((a, b) => {
    const order = { Mythical: 0, Rare: 1, Premium: 2, 'Uncommon': 3, Floor: 4 };
    return order[a] - order[b];
  })[0];

  // For high-value special types, hide the "Floor" zone/biome badge — it's redundant noise.
  // If they happen to have a Rare/Premium zone too, that badge is still informative so keep it.
  const isHighValueSpecial = (mode === 'Origin Daydream' || mode === 'Origin Terraform') || specialType in SPECIAL_TYPE_BADGES || isOneOfOne || isS0 || biome === 0;
  // Guard against undefined topCategory (special parcels don't have zoneCategory/biomeCategory)
  const showCategoryBadge = topCategory != null && !(topCategory === 'Floor' && isHighValueSpecial);
  const specialBadge = SPECIAL_TYPE_BADGES[specialType];
  // Show the 1of1 badge alongside when the token is also 1of1 but its primary type is something else
  const showAlso1of1Badge = isOneOfOne && specialType !== '1of1';

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
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>
      <div className="flex flex-col">
        <div className="flex flex-col mt-1">
          <a href={`/?token=${tokenId}`}>
            {tokenId}
          </a>
          <p className="text-xs opacity-75">L{level}/B{biome}/{zone}</p>
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
            {specialBadge     && <SpecialBadge config={specialBadge} opacity={0.8} />}
            {isGodmode        && <SpecialBadge type="Godmode" opacity={0.8} />}
            {showAlso1of1Badge && <SpecialBadge type="1of1" opacity={0.8} />}
            {isS0             && <SpecialBadge type="S0" opacity={0.8} />}
            {biome === 0      && <SpecialBadge type="Biome0" opacity={0.8} />}
            {biome === 42     && <SpecialBadge type="BigGrass" opacity={0.8} />}
            {biome === 65     && <SpecialBadge type="LittleGrass" opacity={0.8} />}
            {level === 1      && <SpecialBadge type="Basement" opacity={0.8} />}
            {level === 20     && <SpecialBadge type="Penthouse" opacity={0.8} />}
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

