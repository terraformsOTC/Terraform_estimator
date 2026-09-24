'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import SalesView from '@/components/SalesView';
import { API_URL, connectAndRedirect, Footer } from '@/components/shared';
import {
  ParcelFilterPanel,
  ActiveFilterChips,
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

export default function SalesPage() {
  const [filters, setFilters] = useState(null);   // null until read from the URL
  const [data, setData] = useState(null);         // summary, facets and totals for the filter
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
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
    setFilters(initial);
    if (countActiveFilters(initial) > 0) setShowFilters(true);
  }, []);

  async function fetchPage(offset, { force = false } = {}) {
    const qs = filtersToQuery(filters);
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
    load();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key, value) => setFilters(f => toggleFilterValue(f, key, value));
  const reset = () => setFilters(EMPTY_FILTERS);
  const activeCount = filters ? countActiveFilters(filters) : 0;

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
                />
              )}
              <ActiveFilterChips filters={filters} onToggle={toggle} onReset={reset} />
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
