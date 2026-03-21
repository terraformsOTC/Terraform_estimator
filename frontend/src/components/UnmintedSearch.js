'use client';
import { useState } from 'react';

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);
const COORDS = Array.from({ length: 48 }, (_, i) => i);

export default function UnmintedSearch({ onSearch, loading }) {
  const [level, setLevel] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!level || x === '' || y === '') return;
    onSearch(parseInt(level), parseInt(x), parseInt(y));
  }

  const valid = level !== '' && x !== '' && y !== '';

  return (
    <div className="max-w-lg">
      <p className="mb-4 opacity-75 text-sm">
        enter hypercastle coordinates to estimate an unminted parcel. coordinates are available in the{' '}
        <a href="https://docs.google.com/spreadsheets/d/1itQILMgviVWo19djdI569vGXrP8H6a1E3ExAwgLZgYc" target="_blank" rel="noopener noreferrer">
          unminted parcels sheet
        </a>.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center flex-wrap">
        <select
          className="text-sm transition-all w-24"
          value={level}
          onChange={e => setLevel(e.target.value)}
        >
          <option value="">level</option>
          {LEVELS.map(l => <option key={l} value={l}>L{l}</option>)}
        </select>
        <select
          className="text-sm transition-all w-20"
          value={x}
          onChange={e => setX(e.target.value)}
        >
          <option value="">x</option>
          {COORDS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select
          className="text-sm transition-all w-20"
          value={y}
          onChange={e => setY(e.target.value)}
        >
          <option value="">y</option>
          {COORDS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={loading || !valid}
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
