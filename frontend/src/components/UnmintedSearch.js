'use client';
import { useState } from 'react';

const TOTAL = 1193;

export default function UnmintedSearch({ onSearch, loading }) {
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const id = parseInt(value.trim());
    if (isNaN(id) || id < 1 || id > TOTAL) return;
    onSearch(id);
  }

  return (
    <div className="max-w-lg">
      <p className="mb-4 opacity-75 text-sm">
        enter an unminted parcel ID (1–{TOTAL}) to get a valuation estimate. the full list of unminted parcels with their IDs is available in the{' '}
        <a href="https://docs.google.com/spreadsheets/d/1itQILMgviVWo19djdI569vGXrP8H6a1E3ExAwgLZgYc" target="_blank" rel="noopener noreferrer">
          unminted parcels sheet
        </a>.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          className="text-sm transition-all w-40"
          placeholder="unminted id"
          value={value}
          onChange={e => setValue(e.target.value)}
          type="number"
          min="1"
          max={TOTAL}
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
