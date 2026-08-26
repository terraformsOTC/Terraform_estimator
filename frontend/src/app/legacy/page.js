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
// The money sword is kept here, and ONLY here, so this page reproduces an old
// quote exactly. It was v1's manual stand-in for a market leaning on WETH bids
// versus one clearing at listed prices — the thing the hedonic model now measures
// as a fitted coefficient, which is why it is gone from every other page. Local
// state rather than the old app-wide context: nothing else has a use for it.

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import ErrorBoundary from '@/components/ErrorBoundary';
import { EthIcon, API_URL, connectAndRedirect, Footer, getLevelCategory } from '@/components/shared';

// Verbatim from the retired shared.js helper — a tiered multiplier keyed on the
// parcel's strongest rarity category. CATEGORY_ORDER was module-private there, so
// it is restated rather than exported: this is the only caller left.
const CATEGORY_ORDER = { Mythical: 0, Rare: 1, Premium: 2, Uncommon: 3, Floor: 4 };

function getMoneySwordMultiplier(pricing, level) {
  if (!pricing) return 1.0;
  if (pricing.isSpecial) return 1.35;
  const levelCat = getLevelCategory(level);
  const topCat = [pricing.zoneCategory, pricing.biomeCategory, levelCat]
    .filter(Boolean)
    .sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))[0];
  if (topCat === 'Mythical') return 1.5;
  if (topCat === 'Rare')     return 1.4;
  if (topCat === 'Premium')  return 1.3;
  return 1.2;
}

const MIN_TOKEN_ID = 1;
const MAX_TOKEN_ID = 9911;

export default function LegacyPage() {
  const [value, setValue] = useState('');
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ethUsd, setEthUsd] = useState(null);
  const [moneySword, setMoneySword] = useState(false);

  // Same localStorage key the app-wide toggle used, so anyone who had it on before
  // the cutover finds it on here. Wrapped: storage throws in some privacy modes.
  useEffect(() => {
    try {
      if (localStorage.getItem('moneySword') === 'true') setMoneySword(true);
    } catch { /* no stored preference is a fine default */ }
  }, []);

  function toggleMoneySword() {
    setMoneySword(prev => {
      const next = !prev;
      try { localStorage.setItem('moneySword', String(next)); } catch { /* ignore */ }
      return next;
    });
  }

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
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
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
            <button
              onClick={toggleMoneySword}
              title={moneySword ? 'Disable Money Sword mode' : 'Enable Money Sword mode'}
              className={`mt-3 text-xs bg-transparent border-none cursor-pointer p-0 font-inherit transition-opacity ${moneySword ? 'opacity-100' : 'opacity-45 hover:opacity-75'}`}
            >
              🗡 money sword {moneySword ? '[on]' : '[off]'}
            </button>
            {moneySword && (
              <p className="text-xs opacity-50 mt-2">
                🗡 One or more nerds has the money sword, there is an uncomfortable amount of competition for parcels. All estimates are increased.
              </p>
            )}
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
              <LegacyResult parcel={parcel} ethUsd={ethUsd} moneySword={moneySword} />
            </ErrorBoundary>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function LegacyResult({ parcel, ethUsd, moneySword }) {
  const { tokenId, traits, pricing, pricingV2 } = parcel;
  const { zone, biome, level, chroma, mode } = traits;
  const { estimatedValue, floor, isSpecial } = pricing;
  const displayValue = moneySword
    ? estimatedValue * getMoneySwordMultiplier(pricing, level)
    : estimatedValue;

  return (
    <div className="max-w-lg">
      <p className="text-xs opacity-60 uppercase tracking-widest mb-1">
        v1 estimated value{moneySword ? ' 🗡' : ''}
      </p>
      <div className="flex items-center gap-2">
        <EthIcon />
        <span className="text-3xl">{displayValue.toFixed(3)}</span>
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
