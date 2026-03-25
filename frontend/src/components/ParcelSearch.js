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
        Enter a token ID (1–11,104) to get a valuation estimate. IDs between 1–9911 are minted parcels, whilst values between 9912–11104 are unminted.
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
        Estimates are subjective and can change. This is not financial advice. Unminted IDs are based on level and will not correspond to the true values when minted.
      </p>
    </div>
  );
}
