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

  // Each sale carries its own basis, decided server-side: a plain parcel that
  // cleared below floor is measured against the floor, everything else against
  // our listed-price estimate. The two are never pooled — a figure across mixed
  // references would not mean anything. Totals cover every matching sale, not
  // just the rows loaded so far.
  return (
    <div style={{ opacity: loading ? 0.5 : 1 }}>
      <SalesHeadline total={total} summary={summary} floor={floor} ethUsd={ethUsd} filtered={filtered} />

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
                {sales.map((s, i) => (
                  <SaleRow key={s.eventId || `${s.tokenId}-${s.closingDate}`} sale={s}
                    bundleEdge={bundleEdge(sales, i)} />
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
            <span className="opacity-40">showing {sales.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')}</span>
          </div>
        </>
      )}
    </div>
  );
}

// The first page is rendered on the server (app/sales/page.js), so numbers use one
// fixed locale: the server's HTML and the browser's first render must agree.
function SalesHeadline({ total, summary, floor, ethUsd, filtered }) {
  const since = summary?.first ? new Date(summary.first * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
  return (
    <div className="mb-6 text-xs opacity-50">
      {total.toLocaleString('en-US')} {total === 1 ? 'sale' : 'sales'}{filtered ? ' match' : ''}
      {since ? ` since ${since}` : ''}
      {summary?.volume != null && <>{' · '}{summary.volume.toLocaleString('en-US', { maximumFractionDigits: 1 })} ETH volume</>}
      {floor != null && <>{' · '}floor {floor.toFixed(3)} ETH{ethUsd ? ` / $${Math.round(floor * ethUsd).toLocaleString('en-US')}` : ''}</>}
    </div>
  );
}

// A bundle leg's price is the order total, so the row says which parcels it sold
// together with. Long bundles name the first few.
const BUNDLE_NAMED = 3;
function BundleNote({ legs, others }) {
  const named = others.slice(0, BUNDLE_NAMED);
  const rest = others.length - named.length;
  const title = `Sold together in one order${others.length ? ` with ${others.map((id) => `#${id}`).join(', ')}` : ''}. `
    + `The price is the total for all ${legs} parcels.`;
  return (
    <span className="block text-xs opacity-50" title={title}>
      bundle ×{legs}
      {named.length > 0 && <> with {named.map((id, i) => (
        <span key={id}>{i ? ', ' : ''}<a href={`/?token=${id}`}>#{id}</a></span>
      ))}{rest > 0 && ` +${rest}`}</>}
      <span className="block opacity-70">total for {legs}</span>
    </span>
  );
}

// The legs of one bundle order sit in consecutive rows; their thumbnails share
// one box, closed at the first and last leg on the page.
function bundleEdge(sales, i) {
  const s = sales[i];
  if (s.kind !== 'bundle' || !s.txHash) return null;
  const same = (o) => o && o.kind === 'bundle' && o.txHash === s.txHash;
  return { top: !same(sales[i - 1]), bottom: !same(sales[i + 1]) };
}

const THUMB_W = 67;
const THUMB_H = 97;
const BUNDLE_LINE = '2px solid rgba(232,232,232,0.55)';
const BUNDLE_PAD = 8;   // px from a thumbnail to the outside of the outline, every side

// Drawn round the thumbnail itself rather than as the cell's borders, so it sits
// the same distance from the image on all four sides instead of following the
// column's width. The thumbnail is at the cell's left edge (pl-0: a browser's
// default 1px cell padding made the left gap 2px wider), centred vertically
// (py-3 above and below); the sides run the full row height so consecutive legs
// join, and the top and bottom close at the first and last leg on the page.
function BundleOutline({ edge }) {
  const closed = `calc(50% - ${THUMB_H / 2 + BUNDLE_PAD}px)`;
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        left: -BUNDLE_PAD,
        width: THUMB_W + 2 * BUNDLE_PAD,
        top: edge.top ? closed : 0,
        bottom: edge.bottom ? closed : 0,
        borderLeft: BUNDLE_LINE,
        borderRight: BUNDLE_LINE,
        borderTop: edge.top ? BUNDLE_LINE : 'none',
        borderBottom: edge.bottom ? BUNDLE_LINE : 'none',
      }}
    />
  );
}

function SaleRow({ sale, bundleEdge }) {
  const { tokenId, traits, pricing, salePrice, currency, basis, reference, vsReference, closingDate, seller, winner, sellerEns, winnerEns, kind, legs, bundleWith } = sale;
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
          <BundleNote legs={legs} others={bundleWith || []} />
        )}
      </td>
      <td
        className="py-3 pr-4 pl-0 hidden sm:table-cell"
        title={bundleEdge ? 'sold together in one bundle' : undefined}
        style={bundleEdge ? { position: 'relative' } : undefined}
      >
        {bundleEdge && <BundleOutline edge={bundleEdge} />}
        <a href={`/?token=${tokenId}`}>
          <img
            src={parcelImage(tokenId)}
            alt={`Parcel ${tokenId}`}
            width={THUMB_W}
            height={THUMB_H}
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
      {/* Relative to the viewer's clock: the server's cached HTML said it earlier. */}
      <td className="py-3 pr-4 hidden sm:table-cell text-xs opacity-55 whitespace-nowrap" suppressHydrationWarning>
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
