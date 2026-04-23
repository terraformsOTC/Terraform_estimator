'use client';

import { EthIcon, SPECIAL_TYPE_BADGES, SpecialBadge, AutoBadgeStack, CATEGORY_COLORS, API_URL } from './shared';

const OPENSEA_BASE = 'https://opensea.io/assets/ethereum/0x4E1f41613c9084FdB9E34E11fAE9412427480e56';

// Signed error = (sale - estimate) / estimate.
//   negative  →  sale cleared BELOW estimate  →  model over-estimated (green)
//   positive  →  sale cleared ABOVE estimate  →  model under-estimated (red)
function errorColor(signedError) {
  if (signedError == null) return 'rgba(232,232,232,0.4)';
  const mag = Math.abs(signedError);
  if (mag < 0.05) return 'rgba(232,232,232,0.5)';           // within noise — neutral
  if (signedError < 0) {
    if (mag >= 0.4) return '#4ade80';                        // 40%+ under → bright green
    if (mag >= 0.2) return '#86efac';
    return '#d1fae5';
  }
  if (mag >= 0.4) return '#f87171';                          // 40%+ over  → bright red
  if (mag >= 0.2) return '#fca5a5';
  return '#fecaca';
}

function formatRelative(closingDate) {
  if (!closingDate) return '';
  const secs = Math.floor(Date.now() / 1000) - Number(closingDate);
  if (!Number.isFinite(secs) || secs < 0) return '';
  if (secs < 60)        return `${secs}s ago`;
  if (secs < 3600)      return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)     return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function SalesView({ data, loading, error }) {
  if (loading) {
    return (
      <div className="text-sm opacity-75">
        [loading recent sales...]
        <br />
        <span className="opacity-55 text-xs">fetching OpenSea sales + on-chain traits — may take 20–40s on first load.</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm opacity-70">[error: {error}]</div>;
  }

  if (!data) return null;

  const { sales, floor, totalSalesScanned, skippedNonEth, fetchedAt } = data;
  const fetchedDate = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : null;

  // Collection-wide mean signed error — quick eyeball of model bias.
  const priced = (sales || []).filter(s => typeof s.signedError === 'number');
  const meanError = priced.length
    ? priced.reduce((a, s) => a + s.signedError, 0) / priced.length
    : null;

  return (
    <div>
      <div className="mb-6 text-xs opacity-50">
        scanned {totalSalesScanned} sales
        {skippedNonEth > 0 ? ` · skipped ${skippedNonEth} non-ETH` : ''}
        {' · '}floor {floor?.toFixed(3)} ETH
        {' · '}cached at {fetchedDate}
        {meanError != null && (
          <>
            {' · '}mean error{' '}
            <span style={{ color: errorColor(meanError) }}>
              {meanError > 0 ? '+' : ''}{(meanError * 100).toFixed(1)}%
            </span>
          </>
        )}
      </div>

      <p className="mb-6 text-xs opacity-50">recent OpenSea sales compared to our current estimate. negative = sold below estimate, positive = sold above.</p>

      {(!sales || sales.length === 0) ? (
        <p className="text-sm opacity-75">no recent sales.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full min-w-[640px]">
            <thead>
              <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
                <th className="pb-3 pr-4 font-normal"></th>
                <th className="pb-3 pr-4 font-normal">parcel</th>
                <th className="pb-3 pr-4 font-normal">traits</th>
                <th className="pb-3 pr-4 font-normal text-right">sale</th>
                <th className="pb-3 pr-4 font-normal text-right">estimate</th>
                <th className="pb-3 pr-4 font-normal text-right">over/under</th>
                <th className="pb-3 pr-4 font-normal text-right">when</th>
                <th className="pb-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <SaleRow key={s.eventId || `${s.tokenId}-${s.closingDate}`} sale={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SaleRow({ sale }) {
  const { tokenId, traits, pricing, salePrice, currency, signedError, closingDate } = sale;
  const { zone, biome, level, chroma, mode, specialType } = traits || {};
  const { estimatedValue, zoneCategory, biomeCategory } = pricing || {};

  const specialBadge = SPECIAL_TYPE_BADGES[
    mode === 'Origin Daydream' ? 'Origin Daydream'
    : mode === 'Origin Terraform' ? 'Origin Terraform'
    : specialType
  ];

  const errColor = errorColor(signedError);
  const errLabel = signedError == null
    ? '—'
    : `${signedError > 0 ? '+' : ''}${(signedError * 100).toFixed(1)}%`;

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
          {traits && <AutoBadgeStack traits={traits} opacity={0.8} />}
        </div>
      </td>
      <td className="py-2 pr-4 text-right">
        <span className="flex items-center justify-end gap-1">
          <EthIcon width={8} height={13} />
          {salePrice.toFixed(3)}
          {currency === 'WETH' && <span className="text-xs opacity-40 ml-0.5">w</span>}
        </span>
      </td>
      <td className="py-2 pr-4 text-right">
        <span className="flex items-center justify-end gap-1">
          <EthIcon width={8} height={13} />
          {estimatedValue != null ? estimatedValue.toFixed(3) : '—'}
        </span>
      </td>
      <td className="py-2 pr-4 text-right">
        <span
          className="text-xs px-1 font-medium"
          style={{ color: errColor, border: `1px solid ${errColor}`, opacity: 0.9 }}
        >
          {errLabel}
        </span>
      </td>
      <td className="py-2 pr-4 text-right text-xs opacity-55">
        {formatRelative(closingDate)}
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
