'use client';

// Collection-wide numbers: market cap, sales volume, listings. One backend call
// (GET /stats). Market cap and volume are always ready; listings come from the
// same 30-minute OpenSea cache as /listings, and while that is cold the backend
// answers `listingsPending` and starts it, so the page asks again.

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { API_URL, connectAndRedirect, EthIcon, Footer } from '@/components/shared';

const WINDOW_LABELS = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', '1y': 'last 12 months', all: 'all time' };
const LISTINGS_RETRY_MS = 8000;
const LISTINGS_MAX_RETRIES = 8;

const eth = (v, digits = 1) => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (v, ethUsd) => (ethUsd ? `$${Math.round(v * ethUsd).toLocaleString()}` : null);

export default function StatsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ethUsd, setEthUsd] = useState(null);

  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(r => r.json())
      .then(d => { const p = parseFloat(d?.data?.amount); if (Number.isFinite(p)) setEthUsd(p); })
      .catch(() => {});

    let cancelled = false;
    let timer = null;
    const load = (attempt) => {
      fetch(`${API_URL}/stats`)
        .then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          return d;
        })
        .then(d => {
          if (cancelled) return;
          setData(d);
          if (d.listingsPending && attempt < LISTINGS_MAX_RETRIES) {
            timer = setTimeout(() => load(attempt + 1), LISTINGS_RETRY_MS);
          }
        })
        .catch(e => { if (!cancelled) setError(e.message || 'Failed to load stats.'); });
    };
    load(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1 px-6 max-w-2xl">
        <div className="mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[stats]</span>
          </span>
        </div>
        <p className="opacity-55 text-sm mb-10">
          Terraforms by the numbers: what the whole collection is worth under the estimator&apos;s model,
          how much has traded, and what is for sale right now.
        </p>

        {error && <p className="text-sm opacity-70">[error: {error}]</p>}
        {!data && !error && <p className="text-sm opacity-60">[loading stats...]</p>}

        {data && (
          <>
            <MarketCap data={data} ethUsd={ethUsd} />
            <Volume sales={data.sales} ethUsd={ethUsd} />
            <Listings listings={data.listings} pending={data.listingsPending} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Range({ bid, ask, ethUsd }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <EthIcon />
        <span className="text-3xl">{eth(bid, 0)} – {eth(ask, 0)}</span>
      </div>
      {ethUsd && (
        <p className="text-xs opacity-55 mt-1">{usd(bid, ethUsd)} – {usd(ask, ethUsd)}</p>
      )}
    </>
  );
}

function MarketCap({ data, ethUsd }) {
  const { marketCap, floor, floorIsLive, topOffer } = data;
  return (
    <section className="mb-12">
      <h2 className="text-xs opacity-50 uppercase tracking-widest mb-4">Total Terraforms market cap</h2>

      <div className="mb-6">
        <p className="text-sm opacity-75 mb-1">minted parcels <span className="opacity-60">({marketCap.minted.count.toLocaleString()})</span></p>
        <Range bid={marketCap.minted.bid} ask={marketCap.minted.ask} ethUsd={ethUsd} />
      </div>

      <div className="mb-6">
        <p className="text-sm opacity-75 mb-1">including unminted parcels <span className="opacity-60">({marketCap.total.count.toLocaleString()})</span></p>
        <Range bid={marketCap.total.bid} ask={marketCap.total.ask} ethUsd={ethUsd} />
        <p className="text-xs opacity-45 mt-1">
          of which the {marketCap.unminted.count.toLocaleString()} unminted parcels: {eth(marketCap.unminted.bid, 0)} – {eth(marketCap.unminted.ask, 0)} ETH
        </p>
      </div>

      <p className="text-xs opacity-55 leading-relaxed">
        floor {floor.toFixed(3)} ETH{floorIsLive ? '' : ' (fallback)'}
        {topOffer ? <> · top collection bid {topOffer.toFixed(3)} ETH</> : null}
        {' · '}floor × minted supply {eth(marketCap.floorTimesSupply, 0)} ETH
      </p>
      <p className="text-xs opacity-45 mt-3 leading-relaxed">
        Every parcel is priced by the estimator&apos;s model and the estimates are summed. The range runs from
        liquidation (the bid side — what selling would realise) to listed price (the ask side), the same
        band each parcel page shows. Unminted parcels are valued at what they should be worth once minted.
        A handful of rare specials (Plague, seeds, Godmode and the like) are priced from hand-set tables
        rather than fitted sales — see <a href="/methodology" className="opacity-80">[methodology]</a>.
      </p>
    </section>
  );
}

function Volume({ sales, ethUsd }) {
  const since = sales.first ? new Date(sales.first * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : null;
  return (
    <section className="mb-12">
      <h2 className="text-xs opacity-50 uppercase tracking-widest mb-4">Sales volume</h2>
      <StatTable
        head={['', 'sales', 'volume']}
        rows={sales.windows.map(w => [WINDOW_LABELS[w.key] || w.key, w.count.toLocaleString(), volumeCell(w.volume, ethUsd)])}
      />
      <h3 className="text-xs opacity-50 uppercase tracking-widest mt-8 mb-4">By year</h3>
      <StatTable
        head={['', 'sales', 'volume']}
        rows={[...sales.years].reverse().map(y => [String(y.year), y.count.toLocaleString(), volumeCell(y.volume, ethUsd)])}
      />
      <p className="text-xs opacity-45 mt-3 leading-relaxed">
        Every sale since {since || 'mint'}, in ETH, WETH and Blur&apos;s pool ETH. A bundle order counts its total once.
        Full list on <a href="/sales" className="opacity-80">[sales]</a>.
      </p>
    </section>
  );
}

function volumeCell(volume, ethUsd) {
  const dollars = usd(volume, ethUsd);
  return (
    <>
      {eth(volume, volume < 100 ? 2 : 0)} ETH
      {dollars && <span className="opacity-45 block sm:inline"><span className="hidden sm:inline"> / </span>{dollars}</span>}
    </>
  );
}

function Listings({ listings, pending }) {
  return (
    <section className="mb-12">
      <h2 className="text-xs opacity-50 uppercase tracking-widest mb-4">Listings</h2>
      {!listings && pending && <p className="text-sm opacity-60">[loading listings...]</p>}
      {!listings && !pending && <p className="text-sm opacity-60">[listings unavailable]</p>}
      {listings && (
        <>
          <StatTable
            rows={[
              ['listed parcels', `${listings.count.toLocaleString()}${listings.shareOfSupply != null ? ` (${(listings.shareOfSupply * 100).toFixed(1)}% of minted supply)` : ''}`],
              ['lowest ask', listings.lowest != null ? `${listings.lowest.toFixed(3)} ETH` : '—'],
              ['median ask', listings.median != null ? `${listings.median.toFixed(3)} ETH` : '—'],
              ['all listings together', `${eth(listings.totalAsk, 1)} ETH`],
              ['listed below our estimate', listings.belowEstimate.toLocaleString()],
            ]}
          />
          <p className="text-xs opacity-45 mt-3">
            OpenSea listings, refreshed every 30 minutes. Browse them on <a href="/listings" className="opacity-80">[listings]</a>.
          </p>
        </>
      )}
    </section>
  );
}

function StatTable({ head, rows }) {
  return (
    <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
      {head && (
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`text-xs opacity-45 font-normal pb-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
            {row.map((cell, i) => (
              <td key={i} className={`py-2 ${i === 0 ? 'opacity-65 pr-3' : 'text-right tabular-nums pl-4 whitespace-nowrap'}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
