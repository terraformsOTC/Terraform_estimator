'use client';
import { useState } from 'react';

export default function ParcelSearch({ onSearch, loading }) {
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const id = parseInt(value.trim());
    if (isNaN(id) || id < 1 || id > 9999) return;
    onSearch(id);
  }

  return (
    <div className="max-w-lg">
      <p className="mb-4 opacity-60 text-sm">
        enter a parcel token ID (1–9999) to get a price estimate based on zone and biome.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          className="py-1 px-2 text-sm transition-all w-40"
          placeholder="token id"
          value={value}
          onChange={e => setValue(e.target.value)}
          type="number"
          min="1"
          max="9999"
        />
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={loading || !value}
        >
          {loading ? '[loading...]' : '[estimate]'}
        </button>
      </form>
      <p className="mt-6 opacity-40 text-xs">
        estimates are based on a zone/biome multiplier model applied to the current floor price.
        this is not financial advice.
      </p>
    </div>
  );
}
