'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import ListingsView from '@/components/ListingsView';
import { API_URL, pickRandomWhale, connectAndRedirect, Footer } from '@/components/shared';

export default function ListingsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/listings`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load listings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} onWhale={() => { window.location.href = `/?address=${pickRandomWhale()}`; }} />
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
            <div className="mb-4 flex items-center gap-2">
              <button className="btn-primary btn-sm text-xs" onClick={fetchData}>
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
          <ListingsView data={data} loading={loading} error={error} viewMode={viewMode} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
