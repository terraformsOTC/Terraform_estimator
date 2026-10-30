'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import SalesView from '@/components/SalesView';
import { API_URL, connectAndRedirect, Footer } from '@/components/shared';
import {
  ParcelFilterPanel,
  ActiveFilterChips,
  FilterChip,
  EMPTY_FILTERS,
  toggleFilterValue,
  countActiveFilters,
  optionsFromFacets,
  filtersToQuery,
  filtersFromLocation,
  writeFiltersToLocation,
} from '@/components/ParcelFilters';

const PAGE_SIZE = 50;
const SALES_VOCAB = { title: 'filter sales', have: 'with sales', none: 'no sales', one: 'sale', many: 'sales' };

// Sale size in ETH, as ?min=1&max=5 on the page and the API alike. A bundle
// order's legs carry the order's total, as the table shows them.
const NO_SIZE = { min: '', max: '' };
const SIZE_STEPS = ['0.1', '0.25', '0.5', '1', '2', '5', '10'];
const cleanAmount = v => {
  const n = Number(v);
  return String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? String(n) : '';
};
function sizeFromLocation() {
  if (typeof window === 'undefined') return NO_SIZE;
  const qs = new URLSearchParams(window.location.search);
  return { min: cleanAmount(qs.get('min') ?? ''), max: cleanAmount(qs.get('max') ?? '') };
}
function writeSizeToLocation(size) {
  const url = new URL(window.location.href);
  for (const k of ['min', 'max']) {
    if (size[k]) url.searchParams.set(k, size[k]); else url.searchParams.delete(k);
  }
  window.history.replaceState(null, '', url.search ? `${url.pathname}${url.search}` : url.pathname);
}

// Quick minimums, and exact bounds typed in (applied after a short pause).
function SaleSizeFilter({ size, onChange }) {
  const [draft, setDraft] = useState(size);
  useEffect(() => { setDraft(size); }, [size.min, size.max]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next = { min: cleanAmount(draft.min), max: cleanAmount(draft.max) };
    if (next.min === size.min && next.max === size.max) return undefined;
    const t = setTimeout(() => onChange(next), 500);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mb-3">
      <p className="text-xs uppercase tracking-widest mb-1" style={{ opacity: 0.4 }}>sale size</p>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 mb-2">
        {SIZE_STEPS.map(v => (
          <FilterChip
            key={v}
            label={`≥ ${v} ETH`}
            owned
            active={size.min === v}
            title={`sales of at least ${v} ETH`}
            onClick={() => onChange({ ...size, min: size.min === v ? '' : v })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <label className="flex items-center gap-2">
          at least
          <input type="number" min="0" step="0.05" value={draft.min} onChange={e => setDraft(d => ({ ...d, min: e.target.value }))} placeholder="any" className="w-20" aria-label="Smallest sale in ETH" />
          ETH
        </label>
        <label className="flex items-center gap-2">
          at most
          <input type="number" min="0" step="0.05" value={draft.max} onChange={e => setDraft(d => ({ ...d, max: e.target.value }))} placeholder="any" className="w-20" aria-label="Largest sale in ETH" />
          ETH
        </label>
      </div>
    </div>
  );
}

// initialData: the first unfiltered page, fetched on the server (page.js) so the
// HTML holds the table; the page still reloads it here, with any URL filters.
export default function SalesPage({ initialData = null }) {
  const [filters, setFilters] = useState(null);   // null until read from the URL
  const [size, setSize] = useState(NO_SIZE);      // sale size bounds, ETH
  const [data, setData] = useState(initialData);  // summary, facets and totals for the filter
  const [rows, setRows] = useState(initialData?.sales ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [ethUsd, setEthUsd] = useState(null);
  // Each filter change starts a new request; a slower earlier one must not land
  // on top of it.
  const requestId = useRef(0);

  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(r => r.json())
      .then(d => { const p = parseFloat(d?.data?.amount); if (Number.isFinite(p)) setEthUsd(p); })
      .catch(() => {});
    const initial = filtersFromLocation();
    const initialSize = sizeFromLocation();
    setSize(initialSize);
    setFilters(initial);
    if (countActiveFilters(initial) > 0 || initialSize.min || initialSize.max) setShowFilters(true);
  }, []);

  async function fetchPage(offset, { force = false } = {}) {
    const qs = filtersToQuery(filters);
    if (size.min) qs.set('min', size.min);
    if (size.max) qs.set('max', size.max);
    qs.set('limit', String(PAGE_SIZE));
    if (offset) qs.set('offset', String(offset));
    // force -> ?refresh=1: the backend re-reads the live OpenSea feed (at most
    // once a minute) instead of serving its 30-minute cache.
    if (force) qs.set('refresh', '1');
    const res = await fetch(`${API_URL}/sales-history?${qs}`, force ? { cache: 'no-store' } : undefined);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load sales.');
    return json;
  }

  async function load({ force = false } = {}) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const json = await fetchPage(0, { force });
      if (id !== requestId.current) return;
      setData(json);
      setRows(json.sales);
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function loadMore() {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const json = await fetchPage(rows.length);
      if (id === requestId.current) setRows(prev => [...prev, ...json.sales]);
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!filters) return;
    writeFiltersToLocation(filters);
    writeSizeToLocation(size);
    load();
  }, [filters, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key, value) => setFilters(f => toggleFilterValue(f, key, value));
  const reset = () => { setFilters(EMPTY_FILTERS); setSize(NO_SIZE); };
  const activeCount = (filters ? countActiveFilters(filters) : 0) + (size.min ? 1 : 0) + (size.max ? 1 : 0);
  const sizeChips = [
    size.min && { key: 'min', label: `sale size: ≥ ${size.min} ETH`, onRemove: () => setSize(s => ({ ...s, min: '' })) },
    size.max && { key: 'max', label: `sale size: ≤ ${size.max} ETH`, onRemove: () => setSize(s => ({ ...s, max: '' })) },
  ].filter(Boolean);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1">
        <div className="px-6 mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[sales]</span>
          </span>
        </div>

        <div className="px-6">
          {filters && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <button className="btn-primary btn-sm text-xs" onClick={() => setShowFilters(v => !v)}>
                  {showFilters ? '[hide filters]' : '[filter sales]'}
                  {activeCount > 0 && <span style={{ opacity: 0.6 }}> · {activeCount}</span>}
                </button>
                {data && !loading && (
                  <button className="btn-primary btn-sm text-xs" onClick={() => load({ force: true })}>
                    [refresh sales]
                  </button>
                )}
              </div>

              {showFilters && (
                <ParcelFilterPanel
                  options={optionsFromFacets(data?.facets)}
                  filters={filters}
                  onToggle={toggle}
                  onReset={reset}
                  onClose={() => setShowFilters(false)}
                  vocab={SALES_VOCAB}
                >
                  <SaleSizeFilter size={size} onChange={setSize} />
                </ParcelFilterPanel>
              )}
              <ActiveFilterChips filters={filters} onToggle={toggle} onReset={reset} extra={sizeChips} />
            </div>
          )}

          <SalesView
            data={data}
            rows={rows}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            ethUsd={ethUsd}
            filtered={activeCount > 0}
            onLoadMore={loadMore}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
