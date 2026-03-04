'use client';

const CATEGORY_COLORS = {
  Grail: '#ffd700',
  Rare: '#c084fc',
  Premium: '#60a5fa',
  'Premium Floor': '#34d399',
  Floor: 'inherit',
};

const ATTAINABILITY_COLORS = {
  'Easy': '#34d399',
  'Medium': '#60a5fa',
  'Very difficult': '#c084fc',
};

export default function WalletView({ data, loading, address }) {
  if (loading) {
    return (
      <div className="text-sm opacity-60">
        [loading parcels for {address?.slice(0, 6)}...{address?.slice(-4)}]
        <br />
        <span className="opacity-40 text-xs">this may take a moment for large collections...</span>
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
                <p className="text-xs opacity-50">{set.description}</p>
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
        <p className="text-xs opacity-40 mb-4">
          [showing {fetchedParcels} of {totalParcels} parcels]
        </p>
      )}

      {parcels?.length === 0 ? (
        <p className="opacity-60 text-sm">no terraforms parcels found in this wallet.</p>
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

function ParcelCard({ parcel }) {
  const { tokenId, traits, pricing } = parcel;
  const { zone, biome, level, mysteryOutlier } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;

  const topCategory = [zoneCategory, biomeCategory].sort((a, b) => {
    const order = { Grail: 0, Rare: 1, Premium: 2, 'Premium Floor': 3, Floor: 4 };
    return order[a] - order[b];
  })[0];

  return (
    <div className="inline-block relative mb-20 mx-2">
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
          <p className="text-xs opacity-60">L{level}/B{biome}/{zone}</p>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex items-center gap-1">
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
            {mysteryOutlier && (
              <span
                className="text-xs px-1"
                style={{
                  color: mysteryOutlier === 'high' ? '#ffd700' : '#f87171',
                  border: `1px solid ${mysteryOutlier === 'high' ? '#ffd700' : '#f87171'}`,
                  opacity: 0.8
                }}
              >
                ???
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-sm">
            <EthIcon />
            {estimatedValue.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

function EthIcon() {
  return (
    <svg width="8" height="13" viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.8 }}>
      <path d="M5 0L0 8.15L5 11L10 8.15L5 0Z" />
      <path d="M0 9.1L5 16L10 9.1L5 12L0 9.1Z" />
    </svg>
  );
}
