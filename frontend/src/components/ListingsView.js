'use client';

import { useState, useMemo } from 'react';
import { EthIcon, SPECIAL_TYPE_BADGES, SpecialBadge, AutoBadgeStack, MysteryBadge, CATEGORY_COLORS, API_URL, getLevelCategory, getMoneySwordMultiplier, PropertyStack, WalletLink } from './shared';
import { useMoneySword } from '@/contexts/MoneySword';

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

export default function ListingsView({ data, loading, error, viewMode = 'list' }) {
  const [moneySword] = useMoneySword();
  const [sort, setSort] = useState('newest');
  const [bargainsOnly, setBargainsOnly] = useState(false);

  const sorted = useMemo(() => {
    if (!data?.parcels) return [];
    const isBargain = (p) => {
      if (!moneySword) return p.discount > 0;
      return p.pricing.estimatedValue * getMoneySwordMultiplier(p.pricing, p.traits?.level) > p.listedPrice;
    };
    const list = bargainsOnly ? data.parcels.filter(isBargain) : data.parcels;
    if (sort === 'price') return [...list].sort((a, b) => a.listedPrice - b.listedPrice);
    if (sort === 'discount') {
      const adjDiscount = (p) => {
        if (!moneySword) return p.discount;
        const adj = p.pricing.estimatedValue * getMoneySwordMultiplier(p.pricing, p.traits?.level);
        return (adj - p.listedPrice) / adj;
      };
      return [...list].sort((a, b) => adjDiscount(b) - adjDiscount(a));
    }
    return [...list].sort((a, b) => {
      if (!a.listedAt && !b.listedAt) return 0;
      if (!a.listedAt) return 1;
      if (!b.listedAt) return -1;
      return b.listedAt - a.listedAt;
    });
  }, [data, sort, bargainsOnly, moneySword]);

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
          <button
            onClick={() => setSort('discount')}
            className={`btn-primary btn-sm text-xs${sort === 'discount' ? '' : ' opacity-40'}`}
          >
            [discount]
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
      ) : viewMode === 'cards' ? (
        <div className="grid w-full gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sorted.map(p => (
            <ListingCard key={p.tokenId} parcel={p} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full md:min-w-[640px]">
            <thead>
              <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
                <th className="pb-3 pr-4 font-normal">id</th>
                <th className="pb-3 pr-4 font-normal">price</th>
                <th className="pb-3 pr-4 font-normal hidden sm:table-cell">image</th>
                <th className="pb-3 pr-4 font-normal">properties</th>
                <th className="pb-3 pr-4 font-normal hidden lg:table-cell">owner</th>
                <th className="pb-3 pr-4 font-normal hidden sm:table-cell">time</th>
                <th className="pb-3 pr-4 font-normal hidden md:table-cell">estimate</th>
                <th className="pb-3 pr-4 font-normal">vs model</th>
                <th className="pb-3 font-normal hidden sm:table-cell">market</th>
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
  const { tokenId, traits, pricing, listedPrice, listedAt, discount, owner, ownerEns } = parcel;
  const { estimatedValue } = pricing;
  const [moneySword] = useMoneySword();

  const adjEst = moneySword ? estimatedValue * getMoneySwordMultiplier(pricing, traits.level) : estimatedValue;
  const adjDiscount = moneySword ? (adjEst - listedPrice) / adjEst : discount;

  const color = vsModelColor(adjDiscount);
  const sign = adjDiscount >= 0 ? '-' : '+';
  const vsModelPct = (Math.abs(adjDiscount) * 100).toFixed(1);

  return (
    <tr className="border-b" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      <td className="py-3 pr-4">
        <a href={`/?token=${tokenId}`} className="no-underline opacity-90">
          #{tokenId}
        </a>
      </td>
      <td className="py-3 pr-4">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <EthIcon width={8} height={13} />
          {listedPrice.toFixed(3)}
        </span>
      </td>
      <td className="py-3 pr-4 hidden sm:table-cell">
        <a href={`/?token=${tokenId}`}>
          <img
            src={`${API_URL}/image/${tokenId}`}
            alt={`Parcel ${tokenId}`}
            width={64}
            height={92}
            style={{ display: 'block', objectFit: 'cover' }}
          />
        </a>
      </td>
      <td className="py-3 pr-4">
        <PropertyStack traits={traits} pricing={pricing} showMystery />
      </td>
      <td className="py-3 pr-4 hidden lg:table-cell text-xs">
        <WalletLink address={owner} ens={ownerEns} />
      </td>
      <td className="py-3 pr-4 hidden sm:table-cell text-xs opacity-55 whitespace-nowrap">
        {timeAgo(listedAt)}
      </td>
      <td className="py-3 pr-4 hidden md:table-cell">
        <span className="flex items-center gap-1 whitespace-nowrap opacity-70">
          <EthIcon width={8} height={13} />
          {adjEst.toFixed(3)}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span
          className="text-xs px-1 font-medium whitespace-nowrap"
          style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
        >
          {sign}{vsModelPct}%
        </span>
      </td>
      <td className="py-3 hidden sm:table-cell">
        <a
          href={`${OPENSEA_BASE}/${tokenId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary btn-sm text-xs no-underline whitespace-nowrap"
        >
          [os ↗]
        </a>
      </td>
    </tr>
  );
}

function ListingCard({ parcel }) {
  const { tokenId, traits, pricing, listedPrice, discount } = parcel;
  const { zone, biome, level, chroma, mode, specialType, mysteryOutlier, isOneOfOne, isS0 } = traits;
  const { estimatedValue, zoneCategory, biomeCategory } = pricing;
  const [moneySword] = useMoneySword();

  const adjEst = moneySword ? estimatedValue * getMoneySwordMultiplier(pricing, level) : estimatedValue;
  const adjDiscount = moneySword ? (adjEst - listedPrice) / adjEst : discount;

  const levelCategory = getLevelCategory(level);
  const topCategory = [zoneCategory, biomeCategory, levelCategory].filter(Boolean).sort((a, b) => {
    const order = { Mythical: 0, Rare: 1, Premium: 2, Uncommon: 3, Floor: 4 };
    return order[a] - order[b];
  })[0];

  const isHighValueSpecial = (mode === 'Origin Daydream' || mode === 'Origin Terraform') || specialType in SPECIAL_TYPE_BADGES || isOneOfOne || isS0 || biome === 0;
  const showCategoryBadge = topCategory != null && !(topCategory === 'Floor' && isHighValueSpecial);
  const specialBadge = SPECIAL_TYPE_BADGES[
    mode === 'Origin Daydream' ? 'Origin Daydream'
    : mode === 'Origin Terraform' ? 'Origin Terraform'
    : specialType
  ];

  const color = vsModelColor(adjDiscount);
  const sign = adjDiscount >= 0 ? '-' : '+';
  const vsModelPct = (Math.abs(adjDiscount) * 100).toFixed(1);

  return (
    <div className="relative">
      <a href={`/?token=${tokenId}`} className="block relative w-full overflow-hidden" style={{ aspectRatio: '277 / 400' }}>
        <span className="absolute inset-0 bg-placeholder animate-pulse" />
        <img
          src={`${API_URL}/image/${tokenId}`}
          alt={`Parcel ${tokenId}`}
          className="absolute inset-0 w-full h-full cursor-pointer transition-opacity opacity-100"
          loading="lazy"
          style={{ transitionDuration: '300ms', objectFit: 'cover' }}
          onError={e => { e.target.style.opacity = 0; e.target.parentNode.querySelector('span').classList.remove('animate-pulse'); }}
        />
      </a>
      <div className="flex flex-col">
        <div className="flex justify-between items-center mt-1">
          <a href={`/?token=${tokenId}`}>{tokenId}</a>
          <a
            href={`${OPENSEA_BASE}/${tokenId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm no-underline"
            title="View on OpenSea"
          >
            <EthIcon width={8} height={13} />
            {listedPrice.toFixed(3)}
          </a>
        </div>
        <p className="hidden lg:block text-xs opacity-75 mt-0.5">{zone}/B{biome}/{chroma || 'Flow'}/L{level}/{(mode || 'Terrain').replace('Origin ', '')}</p>
        <div className="hidden lg:flex items-center gap-1 flex-wrap mt-1">
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
          {specialBadge && <SpecialBadge config={specialBadge} opacity={0.8} />}
          <AutoBadgeStack traits={traits} opacity={0.8} />
          <MysteryBadge outlier={mysteryOutlier} opacity={0.8} />
          <span
            className="text-xs px-1 font-medium ml-auto"
            style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
            title="vs model estimate"
          >
            {sign}{vsModelPct}%
          </span>
        </div>
      </div>
    </div>
  );
}
