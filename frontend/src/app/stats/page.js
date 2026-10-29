'use client';

// Collection-wide numbers: market cap, sales volume, listings. One backend call
// (GET /stats). Market cap and volume are always ready; listings come from the
// same 30-minute OpenSea cache as /listings, and while that is cold the backend
// answers `listingsPending` and starts it, so the page asks again.

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { API_URL, connectAndRedirect, EthIcon, Footer } from '@/components/shared';

const WINDOW_LABELS = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', '1y': 'last 12 months', all: 'all time' };
const ARTGOD_CHART_URL = 'https://terraforms.artgod.network/chart?media_mode=snapshot';
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
        <OpenData />
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
      </div>

      <p className="text-xs opacity-55 leading-relaxed">
        floor {floor.toFixed(3)} ETH{floorIsLive ? '' : ' (fallback)'}
        {topOffer ? <> · top collection bid {topOffer.toFixed(3)} ETH</> : null}
        {' · '}floor × minted supply {eth(marketCap.floorTimesSupply, 0)} ETH
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
      <p className="text-xs opacity-55 mt-2">
        More granular sales data is available{' '}
        <a href={ARTGOD_CHART_URL} target="_blank" rel="noopener noreferrer" className="opacity-90">here ↗</a>
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

// The monthly open-data release of every sale (sales database/export_sales_dataset.js,
// static under /data). Its SHA-256 is shown here, sits beside the file, and is
// committed to the public repo, so a download can be checked against a source other
// than this page; the checker below hashes a file locally, nothing is uploaded.
const DATASET_MANIFEST = '/data/sales-dataset.json';
const REPO_DATA_HISTORY = 'https://github.com/terraformsOTC/Terraform_estimator/commits/main/frontend/public/data/sales-dataset.json';

function OpenData() {
  const [manifest, setManifest] = useState(null);
  const [failed, setFailed] = useState(false);
  const [check, setCheck] = useState(null);

  useEffect(() => {
    fetch(DATASET_MANIFEST, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setManifest)
      .catch(() => setFailed(true));
  }, []);

  const verify = async (file) => {
    if (!file || !manifest?.latest) return;
    setCheck({ state: 'hashing', name: file.name });
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const release = [manifest.latest, ...(manifest.history || [])].find(r => r.sha256 === hex);
      setCheck({ state: release ? 'match' : 'mismatch', name: file.name, hex, release });
    } catch {
      setCheck({ state: 'error', name: file.name });
    }
  };

  const latest = manifest?.latest;
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return (
    <section className="mb-12">
      <h2 className="text-xs opacity-50 uppercase tracking-widest mb-4">Download sales history</h2>
      {failed && <p className="text-sm opacity-60">[download unavailable]</p>}
      {!latest && !failed && <p className="text-sm opacity-60">[loading...]</p>}
      {latest && (
        <>
          <StatTable
            rows={[
              ['sales', latest.rows.toLocaleString()],
              ['from', day(latest.firstSale)],
              ['to', day(latest.lastSale)],
              ['file', <a key="dl" href={`/data/${latest.file}`} download className="opacity-80">[download csv · {(latest.bytes / 1048576).toFixed(1)} MB]</a>],
              ['licence', 'CC0 1.0 (public domain)'],
            ]}
          />
          <p className="text-xs opacity-45 mt-3 leading-relaxed">
            Every sale since mint, one row per parcel, gzipped: run your own models against the same raw data ours is
            fitted on. Updated monthly. <a href="/data/sales-dataset-README.txt" className="opacity-80">[columns]</a>
          </p>
          <p className="text-xs opacity-45 mt-2 leading-relaxed">
            CC0: use it for anything, no permission or credit needed{' '}
            <a href="/data/LICENSE-CC0-1.0.txt" className="opacity-80">[licence]</a>. The estimator&apos;s code is AGPL-3.0{' '}
            <a href="https://github.com/terraformsOTC/Terraform_estimator/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="opacity-90">↗</a>
          </p>

          <h3 className="text-xs opacity-50 uppercase tracking-widest mt-8 mb-4">Check your download</h3>
          <p className="text-xs opacity-45 mb-1">SHA-256</p>
          <p className="text-xs opacity-75 break-all select-all mb-3" style={{ fontFamily: 'monospace' }}>{latest.sha256}</p>
          <p className="text-xs opacity-45 leading-relaxed mb-2">
            Save the <a href={`/data/${latest.file}.sha256`} download className="opacity-80">[checksum file]</a> beside
            the download, then:
          </p>
          <pre className="text-xs opacity-55 mb-3 overflow-x-auto" style={{ whiteSpace: 'pre' }}>
{`macOS    shasum -a 256 -c ${latest.file}.sha256
Linux    sha256sum -c ${latest.file}.sha256
Windows  Get-FileHash ${latest.file} -Algorithm SHA256`}
          </pre>
          <p className="text-xs opacity-45 leading-relaxed mb-3">
            Every release&apos;s checksum is also committed to the public repository, a source other than this page{' '}
            <a href={REPO_DATA_HISTORY} target="_blank" rel="noopener noreferrer" className="opacity-90">↗</a>
          </p>
          <label className="text-xs opacity-45 block mb-1">Or check it here (hashed in your browser, nothing is uploaded):</label>
          <input type="file" accept=".gz,.csv" onChange={e => verify(e.target.files?.[0])} className="text-xs mb-2" />
          {check?.state === 'hashing' && <p className="text-xs opacity-60">[checking {check.name}...]</p>}
          {check?.state === 'match' && (
            <p className="text-xs opacity-75">
              ✓ {check.name} matches the release through {check.release.through}
              {check.release !== latest ? ' (an earlier release; the current one is above)' : ''}.
            </p>
          )}
          {check?.state === 'mismatch' && (
            <p className="text-xs opacity-90">
              ✗ {check.name} matches no release (SHA-256 {check.hex}). Do not use it; download it again.
            </p>
          )}
          {check?.state === 'error' && <p className="text-xs opacity-60">[could not read that file]</p>}
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
