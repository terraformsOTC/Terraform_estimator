'use client';

// Staging page for the fitted hedonic model (v2). Deliberately not in Header's
// nav and not in the sitemap — it exists so a cutover decision can be made on
// live numbers rather than the backtest, and it shows what /sales summarises in
// one line: the scorecard in full, and per-parcel where v1 and v2 disagree.
//
// Nothing here changes what the product serves. The headline estimate on / is
// still v1; this page reads the same `pricingV2` field the API already returns.

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import ParcelResult from '@/components/ParcelResult';
import ErrorBoundary from '@/components/ErrorBoundary';
import { API_URL, pickRandomWhale, connectAndRedirect, Footer, hedonicScorecard } from '@/components/shared';
import { HedonicScorecard, HedonicBreakdown } from '@/components/HedonicCompare';

const MIN_TOKEN_ID = 1;
const MAX_TOKEN_ID = 9911;

export default function HedonicPage() {
  const [value, setValue] = useState('');
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ethUsd, setEthUsd] = useState(null);
  const [scorecard, setScorecard] = useState(null);

  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(r => r.json())
      .then(d => { const p = parseFloat(d?.data?.amount); if (Number.isFinite(p)) setEthUsd(p); })
      .catch(() => {});
  }, []);

  // Same payload /sales renders. Failure is silent: the scorecard is context for
  // the lookup below, not the reason to be on this page.
  useEffect(() => {
    fetch(`${API_URL}/sales`)
      .then(r => r.json())
      .then(d => setScorecard(hedonicScorecard(d?.sales)))
      .catch(() => {});
  }, []);

  async function search(e) {
    e.preventDefault();
    const id = parseInt(value.trim(), 10);
    if (!Number.isFinite(id) || id < MIN_TOKEN_ID || id > MAX_TOKEN_ID) {
      setError(`Enter a minted token ID (${MIN_TOKEN_ID}–${MAX_TOKEN_ID.toLocaleString()}).`);
      return;
    }
    setLoading(true);
    setError(null);
    setParcel(null);
    try {
      const res = await fetch(`${API_URL}/estimate/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setParcel(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch parcel data.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} onWhale={() => { window.location.href = `/?address=${pickRandomWhale()}`; }} />
      <main className="flex-1">
        <div className="px-6 mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[hedonic v2]</span>
          </span>
        </div>

        <div className="px-6">
          <div className="mb-6 max-w-2xl border px-4 py-3" style={{ borderColor: 'rgba(232, 232, 232, 0.12)' }}>
            <p className="text-xs opacity-70">
              staging — not linked from the site and not what any other page shows.
            </p>
            <p className="text-xs opacity-45 mt-2">
              v2 multipliers are fitted to ~20k settled sales (weighted Ridge on ln(price / floor at sale),
              shrunk toward v1&apos;s hand-tuned values where a trait has too few sales to estimate), rather
              than hand-tuned. It is quoted as a band because the two sub-models are fitted separately on
              bid and ask settlements: accepted offers clear around 1.05x floor, taken listings around
              1.30x, and collapsing that to one number would overstate the precision. Godmode, Plague,
              the seeds and Lith0 have too few sales to split, so they fall back to v1 as a single value.
            </p>
          </div>

          <HedonicScorecard scorecard={scorecard} />

          <form onSubmit={search} className="flex gap-2 items-center mb-2">
            <input
              id="token-id"
              name="tokenId"
              className="text-sm transition-all w-40"
              placeholder="token id"
              value={value}
              onChange={e => setValue(e.target.value)}
              type="number"
              min={MIN_TOKEN_ID}
              max={MAX_TOKEN_ID}
            />
            <button type="submit" className="btn-primary btn-sm" disabled={loading || !value}>
              {loading ? '[loading...]' : '[compare]'}
            </button>
          </form>
          <p className="text-xs opacity-45 mb-8">
            minted parcels only ({MIN_TOKEN_ID}–{MAX_TOKEN_ID.toLocaleString()}) — the model is fitted on sales, and unminted IDs have none.
          </p>

          {error && <p className="text-sm mb-8" style={{ color: '#e06c6c' }}>{error}</p>}

          {parcel && (
            <ErrorBoundary>
              <ParcelResult parcel={parcel} ethUsd={ethUsd} showHedonic />
              <HedonicBreakdown pricingV2={parcel.pricingV2} v1={parcel.pricing?.estimatedValue} />
            </ErrorBoundary>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
