'use client';

import { EthIcon, parcelImage, PropertyStack, WalletLink } from './shared';

const OPENSEA_BASE = 'https://opensea.io/assets/ethereum/0x4E1f41613c9084FdB9E34E11fAE9412427480e56';

// Shared by both signed ratios on this page: vs-floor (what the table reports)
// and model error (the scorecard stat in the header).
//   negative  →  cleared BELOW the reference  →  green
//   positive  →  cleared ABOVE the reference  →  red
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

// Relative for the last month, a date beyond it — "1012d ago" says nothing.
function formatWhen(closingDate) {
  if (!closingDate) return '';
  const secs = Math.floor(Date.now() / 1000) - Number(closingDate);
  if (!Number.isFinite(secs) || secs < 0) return '';
  if (secs < 60)        return `${secs}s ago`;
  if (secs < 3600)      return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)     return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 30 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(closingDate * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function signedPct(x) {
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
}

export default function SalesView({ data, rows, loading, loadingMore, error, ethUsd, filtered, onLoadMore }) {
  if (loading && !data) {
    return <div className="text-sm opacity-75">[loading sales...]</div>;
  }
  if (error && !data) {
    return <div className="text-sm opacity-70">[error: {error}]</div>;
  }
  if (!data) return null;

  const { total, summary, floor } = data;
  const sales = rows || [];
  const since = summary?.first ? new Date(summary.first * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : null;

  // Each sale carries its own basis, decided server-side: a plain parcel that
  // cleared below floor is measured against the floor, everything else against
  // our listed-price estimate. The two are never pooled — a figure across mixed
  // references would not mean anything. Totals cover every matching sale, not
  // just the rows loaded so far.
  return (
    <div style={{ opacity: loading ? 0.5 : 1 }}>
      <div className="mb-6 text-xs opacity-50">
        {total.toLocaleString()} {total === 1 ? 'sale' : 'sales'}{filtered ? ' match' : ''}
        {since ? ` since ${since}` : ''}
        {summary?.volume != null && <>{' · '}{summary.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} ETH volume</>}
        {floor != null && <>{' · '}floor {floor.toFixed(3)} ETH{ethUsd ? ` / $${Math.round(floor * ethUsd).toLocaleString()}` : ''}</>}
        {summary?.vsFloor && (
          <>
            {' · '}{summary.vsFloor.n.toLocaleString()} vs floor, median{' '}
            <span style={{ color: errorColor(summary.vsFloor.median) }}>{signedPct(summary.vsFloor.median)}</span>
          </>
        )}
        {summary?.vsEstimate && (
          <>
            {' · '}{summary.vsEstimate.n.toLocaleString()} vs estimate, median{' '}
            <span style={{ color: errorColor(summary.vsEstimate.median) }}>{signedPct(summary.vsEstimate.median)}</span>
          </>
        )}
      </div>

      <p className="mb-6 text-xs opacity-50">every recorded sale since mint, newest first. a floor-value parcel that sold below the floor at the time is measured against that floor — a discount. everything else, including a parcel we price above floor that still sold under it, is measured against our listed-price estimate: today&apos;s model at the floor on the day it sold, so on older sales the gap also shows how far the market has re-rated a trait since. what a parcel is worth is what it would clear at if listed, so bids are never used as the yardstick. that floor is the live listing floor from may 2026 and the model&apos;s own floor index before it. filters use each parcel&apos;s traits today, which can differ from when it sold. a bundle sold as one order carries the order total, so it is not measured.</p>

      {error && <p className="mb-4 text-xs opacity-70">[error: {error}]</p>}

      {sales.length === 0 ? (
        <p className="text-sm opacity-75">{filtered ? 'no sales match these filters.' : 'no sales.'}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full min-w-[620px]">
              <thead>
                <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
                  <th className="pb-3 pr-4 font-normal">id</th>
                  <th className="pb-3 pr-4 font-normal">price</th>
                  <th className="pb-3 pr-4 font-normal hidden sm:table-cell">image</th>
                  <th className="pb-3 pr-4 font-normal">properties</th>
                  <th className="pb-3 pr-4 font-normal hidden lg:table-cell">from</th>
                  <th className="pb-3 pr-4 font-normal hidden lg:table-cell">to</th>
                  <th className="pb-3 pr-4 font-normal hidden sm:table-cell">time</th>
                  <th className="pb-3 pr-4 font-normal hidden md:table-cell">vs</th>
                  <th className="pb-3 pr-4 font-normal">diff</th>
                  <th className="pb-3 font-normal hidden sm:table-cell">market</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <SaleRow key={s.eventId || `${s.tokenId}-${s.closingDate}`} sale={s} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs">
            {sales.length < total && (
              <button className="btn-primary btn-sm text-xs" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? '[loading...]' : '[load more]'}
              </button>
            )}
            <span className="opacity-40">showing {sales.length.toLocaleString()} of {total.toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

function SaleRow({ sale }) {
  const { tokenId, traits, pricing, salePrice, currency, basis, reference, vsReference, closingDate, seller, winner, sellerEns, winnerEns, kind, legs } = sale;
  // The column next to the percentage is the number the percentage was measured
  // against, and it is labelled with which basis that was. The row must state
  // one comparison, not two — showing a reference the figure was not computed
  // from is how #8414 came to display v1's 0.321 beside a figure off v2's 0.242.
  const errColor = errorColor(vsReference);
  const errLabel = vsReference == null
    ? '—'
    : `${vsReference > 0 ? '+' : ''}${(vsReference * 100).toFixed(1)}%`;

  return (
    <tr
      className="border-b"
      style={{ borderColor: 'rgba(232,232,232,0.08)' }}
    >
      <td className="py-3 pr-4">
        <a href={`/?token=${tokenId}`} className="no-underline opacity-90">
          #{tokenId}
        </a>
      </td>
      <td className="py-3 pr-4">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <EthIcon width={8} height={13} />
          {salePrice.toFixed(3)}
          {currency === 'WETH' && <span className="text-xs opacity-40 ml-0.5">w</span>}
        </span>
        {kind === 'bundle' && (
          <span className="block text-xs opacity-40" title="one order for several parcels; the price is the order total">
            bundle ×{legs}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 hidden sm:table-cell">
        <a href={`/?token=${tokenId}`}>
          <img
            src={parcelImage(tokenId)}
            alt={`Parcel ${tokenId}`}
            width={67}
            height={97}
            loading="lazy"
            decoding="async"
            style={{ display: 'block', objectFit: 'cover' }}
          />
        </a>
      </td>
      <td className="py-3 pr-4">
        <PropertyStack traits={traits} pricing={pricing} />
      </td>
      <td className="py-3 pr-4 hidden lg:table-cell text-xs">
        <WalletLink address={seller} ens={sellerEns} />
      </td>
      <td className="py-3 pr-4 hidden lg:table-cell text-xs">
        <WalletLink address={winner} ens={winnerEns} />
      </td>
      <td className="py-3 pr-4 hidden sm:table-cell text-xs opacity-55 whitespace-nowrap">
        {formatWhen(closingDate)}
      </td>
      <td className="py-3 pr-4 hidden md:table-cell">
        <span className="flex items-center gap-1 whitespace-nowrap opacity-70">
          <EthIcon width={8} height={13} />
          {reference != null ? reference.toFixed(3) : '—'}
          {basis && <span className="text-xs opacity-50 ml-0.5">{basis === 'floor' ? 'floor' : 'est'}</span>}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span
          className="text-xs px-1 font-medium whitespace-nowrap"
          style={{ color: errColor, border: `1px solid ${errColor}`, opacity: 0.9 }}
        >
          {errLabel}
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
