'use client';
import { useState } from 'react';

export default function ParcelSearch({ onSearch, loading }) {
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const id = parseInt(value.trim());
    if (isNaN(id) || id < 1 || id > 11104) return;
    onSearch(id);
  }

  return (
    <div className="max-w-lg">
      <p className="mb-4 opacity-75 text-sm">
        Enter a token ID (1–11,104) to get a valuation estimate.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          id="token-id"
          name="tokenId"
          className="text-sm transition-all w-40"
          placeholder="token id"
          value={value}
          onChange={e => setValue(e.target.value)}
          type="number"
          min="1"
          max="11104"
        />
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={loading || !value}
        >
          {loading ? '[loading...]' : '[estimate]'}
        </button>
      </form>
      <p className="mt-6 opacity-55 text-xs">
        Estimates are based on a hedonic pricing model weighted toward recent sales. This is not financial advice. Unminted IDs are based on level and will not correspond to the true parcel number when minted.
      </p>
    </div>
  );
}
