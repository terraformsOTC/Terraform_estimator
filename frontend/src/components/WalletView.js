'use client';

import { EthIcon, CATEGORY_COLORS } from './shared';

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
          className="text-center mt-4 inline-grid w-full"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(277px, 1fr))' }}
        >
          {parcels.map(parcel => (
            <ParcelCard key={parcel.tokenId} parcel={parcel} />
          ))}
        </div>
      )}
    </div>
  );
}

const SPECIAL_TYPE_BADGES = {
  'Plague':  { label: 'plague',   color: '#e879f9' },
  'X-Seed':  { label: 'x-seed',   color: '#4ade80' },
  'Y-Seed':  { label: 'y-seed',   color: '#2dd4bf' },
  'Lith0':   { label: 'lith0',    color: '#a5b4fc' },
  'Spine':   { label: 'spine',    color: '#f87171' },
  '1of1':    { label: '1 of 1',   color: '#ffd700' },
  'Biome0':  { label: 'biome 0',  color: '#22d3ee' },
};

function ParcelCard({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, mysteryOutlier, mode, specialType, isOneOfOne } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;

  const topCategory = [zoneCategory, biomeCategory].sort((a, b) => {
    const order = { Grail: 0, Rare: 1, Premium: 2, 'Premium Floor': 3, Floor: 4 };
    return order[a] - order[b];
  })[0];

  // For high-value special types, hide the "Floor" zone/biome badge — it's redundant noise.
  // If they happen to have a Rare/Premium zone too, that badge is still informative so keep it.
  const isHighValueSpecial = mode === 'Origin Daydream' || specialType in SPECIAL_TYPE_BADGES || isOneOfOne || biome === 0;
  const showCategoryBadge = !(topCategory === 'Floor' && isHighValueSpecial);
  const specialBadge = SPECIAL_TYPE_BADGES[specialType];
  // Show the 1of1 badge alongside when the token is also 1of1 but its primary type is something else
  const showAlso1of1Badge = isOneOfOne && specialType !== '1of1';

  return (
    <div className="inline-block relative mb-20 mx-2" style={{ width: 277 }}>
      <div className="relative flex flex-1 m-auto" style={{ height: 400, width: 277 }}>
        <div className="flex flex-1">
          <span className="flex relative flex-1">
            <span className="flex bg-placeholder w-full animate-pulse absolute top-0 left-0" style={{ height: '99%' }} />
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/image/${tokenId}`}
              alt={`Parcel ${tokenId}`}
              className="cursor-pointer transition-opacity absolute top-0 left-0 opacity-100"
              loading="lazy"
              style={{ transitionDuration: '300ms', width: 277, height: 400, objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          </span>
        </div>
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
            {specialBadge && (
              <span
                className="text-xs px-1"
                style={{ color: specialBadge.color, border: `1px solid ${specialBadge.color}`, opacity: 0.8 }}
              >
                {specialBadge.label}
              </span>
            )}
            {showAlso1of1Badge && (
              <span
                className="text-xs px-1"
                style={{ color: SPECIAL_TYPE_BADGES['1of1'].color, border: `1px solid ${SPECIAL_TYPE_BADGES['1of1'].color}`, opacity: 0.8 }}
              >
                {SPECIAL_TYPE_BADGES['1of1'].label}
              </span>
            )}
            {biome === 0 && (
              <span
                className="text-xs px-1"
                style={{ color: SPECIAL_TYPE_BADGES['Biome0'].color, border: `1px solid ${SPECIAL_TYPE_BADGES['Biome0'].color}`, opacity: 0.8 }}
              >
                {SPECIAL_TYPE_BADGES['Biome0'].label}
              </span>
            )}
            {mysteryOutlier && (
              <span
                className="text-xs px-1"
                style={{
                  color: mysteryOutlier === 'high' ? '#ffd700' : '#f87171',
                  border: `1px solid ${mysteryOutlier === 'high' ? '#ffd700' : '#f87171'}`,
                  opacity: 0.8
                }}
              >
                {mysteryOutlier === 'high' ? 'high ???' : 'low ???'}
              </span>
            )}
            {mode === 'Origin Daydream' && (
              <span
                className="text-xs px-1"
                style={{ color: '#fb923c', border: '1px solid #fb923c', opacity: 0.8 }}
              >
                origin daydream
              </span>
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

