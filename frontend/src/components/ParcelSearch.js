'use client';
import { useState } from 'react';

export default function ParcelSearch({ onSearch, loading }) {
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const id = parseInt(value.trim());
    if (isNaN(id) || id < 1 || id > 9911) return;
    onSearch(id);
  }

  return (
    <div className="max-w-lg">
      <p className="mb-4 opacity-75 text-sm">
        enter a terraforms token ID (1–9911) to get a valuation estimate based on zone, biome, and other variables.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          id="token-id"
          name="tokenId"
          className="py-1 px-2 text-sm transition-all w-40"
          placeholder="token id"
          value={value}
          onChange={e => setValue(e.target.value)}
          type="number"
          min="1"
          max="9911"
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
        estimates are subjective and can change. this is not financial advice.
      </p>
    </div>
  );
}
