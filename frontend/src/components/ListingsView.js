'use client';

import { useState, useMemo } from 'react';
import { EthIcon, SPECIAL_TYPE_BADGES, SpecialBadge, AutoBadgeStack, MysteryBadge, CATEGORY_COLORS, API_URL } from './shared';

const OPENSEA_BASE = 'https://opensea.io/assets/ethereum/0x4E1f41613c9084FdB9E34E11fAE9412427480e56';

function timeAgo(ts) {
  if (!ts) return '—';
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// discount > 0 → bargain (green), discount < 0 → overpriced (red)
// Mirrors errorColor in SalesView: pass -discount so positive = over-estimate = red.
function vsModelColor(discount) {
  const sig = -discount; // positive when overpriced
  const mag = Math.abs(sig);
  if (mag < 0.05) return 'rgba(232,232,232,0.5)';
  if (sig < 0) {
    if (mag >= 0.4) return '#4ade80';
    if (mag >= 0.2) return '#86efac';
    return '#d1fae5';
  }
  if (mag >= 0.4) return '#f87171';
  if (mag >= 0.2) return '#fca5a5';
  return '#fecaca';
}

export default function ListingsView({ data, loading, error }) {
  const [sort, setSort] = useState('newest');
  const [bargainsOnly, setBargainsOnly] = useState(false);

  const sorted = useMemo(() => {
    if (!data?.parcels) return [];
    const list = bargainsOnly ? data.parcels.filter(p => p.discount > 0) : data.parcels;
    if (sort === 'price') return [...list].sort((a, b) => a.listedPrice - b.listedPrice);
    return [...list].sort((a, b) => {
      if (!a.listedAt && !b.listedAt) return 0;
      if (!a.listedAt) return 1;
      if (!b.listedAt) return -1;
      return b.listedAt - a.listedAt;
    });
  }, [data, sort, bargainsOnly]);

  if (loading) {
    return (
      <div className="text-sm opacity-75">
        [fetching listings...]
        <br />
        <span className="opacity-55 text-xs">scanning all OpenSea listings + on-chain traits — may take 20–40s on first load.</span>
      </div>
    );
  }

  if (error) return <div className="text-sm opacity-70">[error: {error}]</div>;
  if (!data) return null;

  const { floor, totalListings, fetchedAt } = data;
  const fetchedDate = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : null;

  return (
    <div>
      <div className="mb-4 text-xs opacity-50">
        {totalListings} listings · floor {floor?.toFixed(3)} ETH · cached at {fetchedDate}
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-xs">
          <span className="opacity-50">sort:</span>
          <button
            onClick={() => setSort('newest')}
            className={`btn-primary btn-sm text-xs${sort === 'newest' ? '' : ' opacity-40'}`}
          >
            [newest]
          </button>
          <button
            onClick={() => setSort('price')}
            className={`btn-primary btn-sm text-xs${sort === 'price' ? '' : ' opacity-40'}`}
          >
            [price]
          </button>
        </div>
        <button
          onClick={() => setBargainsOnly(v => !v)}
          className={`btn-primary btn-sm text-xs${bargainsOnly ? '' : ' opacity-40'}`}
        >
          {bargainsOnly ? '[bargains only]' : '[show bargains only]'}
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm opacity-75">{bargainsOnly ? 'no bargains currently listed.' : 'no listings found.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full min-w-[700px]">
            <thead>
              <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
                <th className="pb-3 pr-4 font-normal hidden md:table-cell"></th>
                <th className="pb-3 pr-4 font-normal">parcel</th>
                <th className="pb-3 pr-4 font-normal">traits</th>
                <th className="pb-3 pr-4 font-normal text-right">listed</th>
                <th className="pb-3 pr-4 font-normal text-right">when</th>
                <th className="pb-3 pr-4 font-normal text-right">estimate</th>
                <th className="pb-3 pr-4 font-normal text-right">vs model</th>
                <th className="pb-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <ListingRow key={p.tokenId} parcel={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListingRow({ parcel }) {
  const { tokenId, traits, pricing, listedPrice, listedAt, discount } = parcel;
  const { zone, biome, level, chroma, mode, specialType, mysteryOutlier } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;

  const specialBadge = SPECIAL_TYPE_BADGES[
    mode === 'Origin Daydream' ? 'Origin Daydream'
    : mode === 'Origin Terraform' ? 'Origin Terraform'
    : specialType
  ];

  const color = vsModelColor(discount);
  const sign = discount >= 0 ? '-' : '+';
  const vsModelPct = (Math.abs(discount) * 100).toFixed(1);

  return (
    <tr className="border-b" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <td className="py-2 pr-4 hidden md:table-cell">
        <a href={`/?token=${tokenId}`}>
          <img
            src={`${API_URL}/image/${tokenId}`}
            alt={`Parcel ${tokenId}`}
            width={42}
            height={60}
            style={{ display: 'block', objectFit: 'cover' }}
          />
        </a>
      </td>
      <td className="py-2 pr-4">
        <a href={`/?token=${tokenId}`} className="no-underline opacity-90">
          #{tokenId}
        </a>
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs opacity-60">{zone}/B{biome}/L{level}/{chroma || 'Flow'}</span>
          {zoneCategory && zoneCategory !== 'Floor' && (
            <span className="text-xs px-1" style={{ color: CATEGORY_COLORS[zoneCategory], border: `1px solid ${CATEGORY_COLORS[zoneCategory]}`, opacity: 0.8 }}>
              {zoneCategory.toLowerCase()}
            </span>
          )}
          {biomeCategory && biomeCategory !== 'Floor' && (
            <span className="text-xs px-1" style={{ color: CATEGORY_COLORS[biomeCategory], border: `1px solid ${CATEGORY_COLORS[biomeCategory]}`, opacity: 0.8 }}>
              B{biome} {biomeCategory.toLowerCase()}
            </span>
          )}
          {specialBadge && <SpecialBadge config={specialBadge} opacity={0.8} />}
          <AutoBadgeStack traits={traits} opacity={0.8} />
          <MysteryBadge outlier={mysteryOutlier} opacity={0.8} />
        </div>
      </td>
      <td className="py-2 pr-4 text-right">
        <span className="flex items-center justify-end gap-1">
          <EthIcon width={8} height={13} />
          {listedPrice.toFixed(3)}
        </span>
      </td>
      <td className="py-2 pr-4 text-right">
        <span className="text-xs opacity-50">{timeAgo(listedAt)}</span>
      </td>
      <td className="py-2 pr-4 text-right">
        <span className="flex items-center justify-end gap-1">
          <EthIcon width={8} height={13} />
          {estimatedValue.toFixed(3)}
        </span>
      </td>
      <td className="py-2 pr-4 text-right">
        <span
          className="text-xs px-1 font-medium"
          style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
        >
          {sign}{vsModelPct}%
        </span>
      </td>
      <td className="py-2 text-right">
        <a
          href={`${OPENSEA_BASE}/${tokenId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary btn-sm text-xs no-underline whitespace-nowrap"
        >
          [opensea ↗]
        </a>
      </td>
    </tr>
  );
}
