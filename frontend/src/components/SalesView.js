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

function formatRelative(closingDate) {
  if (!closingDate) return '';
  const secs = Math.floor(Date.now() / 1000) - Number(closingDate);
  if (!Number.isFinite(secs) || secs < 0) return '';
  if (secs < 60)        return `${secs}s ago`;
  if (secs < 3600)      return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)     return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function SalesView({ data, loading, error, ethUsd }) {

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

  const { sales: rawSales, floor, totalSalesScanned, skippedNonEth, fetchedAt } = data;
  const fetchedDate = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : null;

  // The table reports premium/discount to the floor at time of sale, not model
  // error. Those are different questions and conflating them is what made #2427
  // — 0.180 against a 0.204 floor — read as +9.1% over: it beat a bid-side
  // estimate that sits below floor by construction. Against floor it is -11.8%,
  // which is what a sale below floor means and the only reading that cannot
  // invert on the model being retuned.
  const sales = (rawSales || []).map(s => ({
    ...s,
    modelError: s.signedErrorV2 ?? s.signedError,
  }));

  const mean = (rows, key) => (rows.length
    ? rows.reduce((a, s) => a + s[key], 0) / rows.length
    : null);
  const meanVsFloor = mean((sales || []).filter(s => typeof s.vsFloor === 'number'), 'vsFloor');
  // Kept as a secondary stat: the shadow scorecard is still how a cutover gets
  // judged, it just no longer drives the column a collector reads.
  const meanModelError = mean((sales || []).filter(s => typeof s.modelError === 'number'), 'modelError');


  return (
    <div>
      <div className="mb-6 text-xs opacity-50">
        scanned {totalSalesScanned} sales
        {skippedNonEth > 0 ? ` · skipped ${skippedNonEth} non-ETH` : ''}
        {' · '}floor {floor?.toFixed(3)} ETH{ethUsd ? ` / $${Math.round(floor * ethUsd).toLocaleString()}` : ''}
        {' · '}cached at {fetchedDate}
        {meanVsFloor != null && (
          <>
            {' · '}mean vs floor{' '}
            <span style={{ color: errorColor(meanVsFloor) }}>
              {meanVsFloor > 0 ? '+' : ''}{(meanVsFloor * 100).toFixed(1)}%
            </span>
          </>
        )}
        {meanModelError != null && (
          <>
            {' · '}model error{' '}
            <span style={{ color: errorColor(meanModelError) }}>
              {meanModelError > 0 ? '+' : ''}{(meanModelError * 100).toFixed(1)}%
            </span>
          </>
        )}
      </div>

      <p className="mb-6 text-xs opacity-50">recent OpenSea sales compared to the floor at the time of each sale. negative = sold below floor, positive = sold above.</p>

      {(!sales || sales.length === 0) ? (
        <p className="text-sm opacity-75">no recent sales.</p>
      ) : (
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
                <th className="pb-3 pr-4 font-normal hidden md:table-cell">floor</th>
                <th className="pb-3 pr-4 font-normal">vs floor</th>
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
      )}
    </div>
  );
}

function SaleRow({ sale }) {
  const { tokenId, traits, pricing, salePrice, currency, vsFloor, floorAtSale, closingDate, seller, winner, sellerEns, winnerEns } = sale;
  // The column next to the percentage must be the number the percentage was
  // measured against, or the row states two different comparisons at once —
  // that is how #8414 came to show v1's 0.321 beside a figure computed off
  // v2's 0.242. Percentage is vs floor, so the column is the floor at sale.
  const errColor = errorColor(vsFloor);
  const errLabel = vsFloor == null
    ? '—'
    : `${vsFloor > 0 ? '+' : ''}${(vsFloor * 100).toFixed(1)}%`;

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
      </td>
      <td className="py-3 pr-4 hidden sm:table-cell">
        <a href={`/?token=${tokenId}`}>
          <img
            src={parcelImage(tokenId)}
            alt={`Parcel ${tokenId}`}
            width={67}
            height={97}
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
        {formatRelative(closingDate)}
      </td>
      <td className="py-3 pr-4 hidden md:table-cell">
        <span className="flex items-center gap-1 whitespace-nowrap opacity-70">
          <EthIcon width={8} height={13} />
          {floorAtSale != null ? floorAtSale.toFixed(3) : '—'}
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
