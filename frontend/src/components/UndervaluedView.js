'use client';

import { EthIcon, SPECIAL_TYPE_BADGES, SpecialBadge, API_URL } from './shared';

const OPENSEA_BASE = 'https://opensea.io/assets/ethereum/0x4E1f41613c9084FdB9E34E11fAE9412427480e56';

function discountColor(discount) {
  if (discount >= 0.4) return '#4ade80'; // 40%+ — bright green
  if (discount >= 0.2) return '#86efac'; // 20–40% — light green
  return '#d1fae5';                      // <20% — pale green
}

export default function UndervaluedView({ data, loading, error }) {
  if (loading) {
    return (
      <div className="text-sm opacity-75">
        [scanning listings...]
        <br />
        <span className="opacity-55 text-xs">fetching OpenSea listings + on-chain traits — may take 20–40s on first load.</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm opacity-70">[error: {error}]</div>;
  }

  if (!data) return null;

  const { parcels, floor, totalListingsScanned, fetchedAt } = data;
  const fetchedDate = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : null;

  return (
    <div>
      <div className="mb-6 text-xs opacity-50">
        scanned {totalListingsScanned} listings · floor {floor} ETH · cached at {fetchedDate}
      </div>

      {parcels.length === 0 ? (
        <p className="text-sm opacity-75">no undervalued listings found in the cheapest {totalListingsScanned} results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
                <th className="pb-3 pr-4 font-normal"></th>
                <th className="pb-3 pr-4 font-normal">parcel</th>
                <th className="pb-3 pr-4 font-normal">traits</th>
                <th className="pb-3 pr-4 font-normal text-right">listed</th>
                <th className="pb-3 pr-4 font-normal text-right">estimate</th>
                <th className="pb-3 pr-4 font-normal text-right">discount</th>
                <th className="pb-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((p, i) => (
                <ParcelRow key={p.tokenId} parcel={p} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {parcels?.length > 0 && (
        <p className="mt-4 text-xs opacity-30">*excludes daydream and terraform mode parcels</p>
      )}
    </div>
  );
}

function ParcelRow({ parcel, rank }) {
  const { tokenId, traits, pricing, listedPrice, discount } = parcel;
  const { zone, biome, level, chroma, mode, specialType } = traits;
  const { estimatedValue } = pricing;

  const specialBadge = SPECIAL_TYPE_BADGES[
    mode === 'Origin Daydream' ? 'Origin Daydream'
    : mode === 'Origin Terraform' ? 'Origin Terraform'
    : specialType
  ];

  return (
    <tr
      className="border-b"
      style={{ borderColor: 'rgba(232,232,232,0.08)' }}
    >
      <td className="py-2 pr-4">
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
        <span className="text-xs opacity-35 ml-1">#{rank}</span>
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs opacity-60">{zone}/B{biome}/L{level}/{chroma || 'Flow'}</span>
          {specialBadge && <SpecialBadge config={specialBadge} opacity={0.8} />}
        </div>
      </td>
      <td className="py-2 pr-4 text-right">
        <span className="flex items-center justify-end gap-1">
          <EthIcon width={8} height={13} />
          {listedPrice.toFixed(3)}
        </span>
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
          style={{ color: discountColor(discount), border: `1px solid ${discountColor(discount)}`, opacity: 0.9 }}
        >
          -{(discount * 100).toFixed(1)}%
        </span>
      </td>
      <td className="py-2 text-right">
        <a
          href={`${OPENSEA_BASE}/${tokenId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary btn-sm text-xs no-underline"
        >
          [opensea ↗]
        </a>
      </td>
    </tr>
  );
}
