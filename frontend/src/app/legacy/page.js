'use client';

// The retired v1 model, kept reachable at an unlinked URL.
//
// v1's multipliers were hand-tuned by rarity tier. The site now prices on the
// hedonic model, whose multipliers are fitted to settled sales — on the live
// sales feed v1 misses by roughly two and a half times as much, almost all of it
// a level bias: v1 reads high, and parcels clear well under its number. This page
// exists so an old quote can still be reproduced, not because the number is one
// to act on.
//
// Deliberately v1-only: no range, because v1 never modelled the bid/ask spread.
// The money-sword toggle that used to sit alongside it is gone site-wide — it was
// a manual stand-in for exactly that spread, which the hedonic model now measures.

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import ErrorBoundary from '@/components/ErrorBoundary';
import { EthIcon, API_URL, pickRandomWhale, connectAndRedirect, Footer } from '@/components/shared';

const MIN_TOKEN_ID = 1;
const MAX_TOKEN_ID = 9911;

export default function LegacyPage() {
  const [value, setValue] = useState('');
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ethUsd, setEthUsd] = useState(null);

  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(r => r.json())
      .then(d => { const p = parseFloat(d?.data?.amount); if (Number.isFinite(p)) setEthUsd(p); })
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
            <span>[legacy]</span>
          </span>
        </div>

        <div className="px-6">
          <div className="mb-8 max-w-lg border px-4 py-3" style={{ borderColor: 'rgba(232, 232, 232, 0.12)' }}>
            <p className="text-xs opacity-70">retired model — the site prices on the current one.</p>
            <p className="text-xs opacity-45 mt-2">
              v1 set its multipliers by hand against rarity tiers. It reads high against what parcels
              actually settle for, which is why it was replaced. Kept here so an older quote can still
              be reproduced.
            </p>
          </div>

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
              {loading ? '[loading...]' : '[estimate]'}
            </button>
          </form>
          <p className="text-xs opacity-45 mb-8">minted parcels only ({MIN_TOKEN_ID}–{MAX_TOKEN_ID.toLocaleString()}).</p>

          {error && <p className="text-sm mb-8" style={{ color: '#e06c6c' }}>{error}</p>}

          {parcel && (
            <ErrorBoundary>
              <LegacyResult parcel={parcel} ethUsd={ethUsd} />
            </ErrorBoundary>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function LegacyResult({ parcel, ethUsd }) {
  const { tokenId, traits, pricing, pricingV2 } = parcel;
  const { zone, biome, level, chroma, mode } = traits;
  const { estimatedValue, floor, isSpecial } = pricing;

  return (
    <div className="max-w-lg">
      <p className="text-xs opacity-60 uppercase tracking-widest mb-1">v1 estimated value</p>
      <div className="flex items-center gap-2">
        <EthIcon />
        <span className="text-3xl">{estimatedValue.toFixed(3)}</span>
      </div>
      <p className="text-xs opacity-55 mt-1">
        floor: {floor} ETH{ethUsd ? ` / $${Math.round(floor * ethUsd).toLocaleString()}` : ''}
      </p>
      {isSpecial && <p className="text-xs opacity-45 mt-1">special parcel types are priced independently.</p>}

      <p className="text-xs opacity-55 mt-4">
        <a href={`/?token=${tokenId}`} className="no-underline">{tokenId}</a>
        {' · '}{zone}/B{biome}/{chroma || 'Flow'}/L{level}/{mode || 'Terrain'}
      </p>

      {pricingV2 && (
        <p className="text-xs opacity-45 mt-4">
          current model:{' '}
          <a href={`/?token=${tokenId}`} className="no-underline">
            {pricingV2.tier === 'tier2'
              ? `${pricingV2.on.toFixed(3)} ETH`
              : `${pricingV2.off.toFixed(3)} – ${pricingV2.on.toFixed(3)} ETH`}
          </a>
        </p>
      )}
    </div>
  );
}
