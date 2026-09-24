'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import ListingsView from '@/components/ListingsView';
import { connectAndRedirect, Footer } from '@/components/shared';
import {
  ParcelFilterPanel,
  ActiveFilterChips,
  EMPTY_FILTERS,
  toggleFilterValue,
  countActiveFilters,
  buildFacetedOptions,
  filtersFromLocation,
  writeFiltersToLocation,
} from '@/components/ParcelFilters';

const LISTINGS_VOCAB = { title: 'filter listings', have: 'listed', none: 'none listed', one: 'listing', many: 'listings' };

export default function ListingsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  // Every listing is already in the page, so filtering is local — same panel,
  // same rules and same URL encoding as the sales page, without a round trip.
  const [filters, setFilters] = useState(null);   // null until read from the URL
  const [showFilters, setShowFilters] = useState(false);

  // force → ?refresh=1, which tells the backend to bypass its 30-minute listings
  // cache. Without it the button re-fetches the cached payload. The backend still
  // rate-limits how often it will actually recompute.
  async function fetchData({ force = false } = {}) {
    setLoading(true);
    setError(null);
    try {
      // Through the same-origin edge proxy (src/app/api/feed) rather than straight
      // to Render: cached at the PoP nearest the visitor instead of one round
      // trip to a single region. A forced refresh is passed through uncached.
      const res = await fetch(`/api/feed/listings${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load listings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const initial = filtersFromLocation();
    setFilters(initial);
    if (countActiveFilters(initial) > 0) setShowFilters(true);
  }, []);

  useEffect(() => { if (filters) writeFiltersToLocation(filters); }, [filters]);

  const options = useMemo(
    () => buildFacetedOptions(data?.parcels ?? [], filters ?? EMPTY_FILTERS),
    [data, filters],
  );
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
            <span>[listings]</span>
          </span>
        </div>

        <div className="px-6">
          {data && !loading && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <button className="btn-primary btn-sm text-xs" onClick={() => setShowFilters(v => !v)}>
                {showFilters ? '[hide filters]' : '[filter listings]'}
                {activeCount > 0 && <span style={{ opacity: 0.6 }}> · {activeCount}</span>}
              </button>
              <button className="btn-primary btn-sm text-xs" onClick={() => fetchData({ force: true })}>
                [refresh listings]
              </button>
              <button
                className="btn-primary btn-sm text-xs"
                onClick={() => setViewMode(v => v === 'list' ? 'cards' : 'list')}
              >
                {viewMode === 'list' ? '[show cards]' : '[show list]'}
              </button>
            </div>
          )}
          {data && !loading && filters && (
            <>
              {showFilters && (
                <ParcelFilterPanel
                  options={options}
                  filters={filters}
                  onToggle={toggle}
                  onReset={reset}
                  onClose={() => setShowFilters(false)}
                  vocab={LISTINGS_VOCAB}
                />
              )}
              <ActiveFilterChips filters={filters} onToggle={toggle} onReset={reset} />
            </>
          )}
          <ListingsView data={data} loading={loading} error={error} viewMode={viewMode} filters={filters} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
