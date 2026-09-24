'use client';
import { useState } from 'react';

// One box, two kinds of answer: a token id gives a valuation, an address or ENS
// name gives everything that wallet holds. The input is `type="text"` rather than
// `type="number"` because a number input silently refuses non-numeric keystrokes —
// pasting an address into it produced an empty field and no explanation.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const ENS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i;
const MAX_TOKEN_ID = 11104;
// Several wallets, comma-separated, open as one combined view. Matches the
// backend's MAX_AGGREGATE_WALLETS.
const MAX_WALLETS = 4;
const isWallet = (s) => ADDRESS.test(s) || ENS.test(s);

export default function ParcelSearch({ onSearch, onAddress, loading }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    setError(null);

    if (raw.includes(',')) {
      const parts = [...new Set(raw.split(',').map(p => p.trim()).filter(Boolean))];
      if (parts.length > MAX_WALLETS) {
        setError(`Up to ${MAX_WALLETS} addresses at a time.`);
        return;
      }
      const bad = parts.find(p => !isWallet(p));
      if (bad) {
        setError(`Not an ETH address or ENS name: ${bad}`);
        return;
      }
      onAddress(parts.join(','));
      return;
    }

    if (isWallet(raw)) {
      onAddress(raw);
      return;
    }

    if (/^\d+$/.test(raw)) {
      const id = parseInt(raw, 10);
      if (id >= 1 && id <= MAX_TOKEN_ID) {
        onSearch(id);
        return;
      }
      setError(`Token IDs run 1–${MAX_TOKEN_ID.toLocaleString()}.`);
      return;
    }

    // Say what was wrong rather than doing nothing, which is what an unrecognised
    // entry used to get.
    setError(raw.startsWith('0x')
      ? 'That looks like an address but is not 42 characters.'
      : 'Enter a token ID, an ETH address, or an ENS name.');
  }

  return (
    <div className="max-w-lg">
      <p className="mb-4 opacity-75 text-sm">
        Enter a token ID (1–11,104) or ETH address to get a valuation estimate. Input multiple ETH addresses separated by a comma to get an aggregate view of the parcels those addresses hold.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          id="token-id"
          name="tokenId"
          className="text-sm transition-all w-64 sm:w-96"
          value={value}
          onChange={e => { setValue(e.target.value); if (error) setError(null); }}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck="false"
          aria-label="Token ID or ETH address"
        />
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={loading || !value.trim()}
        >
          {loading ? '[loading...]' : '[estimate]'}
        </button>
      </form>
      {error && <p className="mt-3 text-xs" style={{ color: '#f87171' }}>{error}</p>}
      <p className="mt-6 opacity-55 text-xs">
        Estimates are based on a hedonic pricing model weighted toward recent sales. This is not financial advice. Unminted IDs are based on level and will not correspond to the true parcel number when minted.
      </p>
    </div>
  );
}
