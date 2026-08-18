'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import SalesView from '@/components/SalesView';
import { API_URL, pickRandomWhale, connectAndRedirect, Footer } from '@/components/shared';

export default function SalesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ethUsd, setEthUsd] = useState(null);

  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(r => r.json())
      .then(d => { const p = parseFloat(d?.data?.amount); if (Number.isFinite(p)) setEthUsd(p); })
      .catch(() => {});
  }, []);

  // force → ?refresh=1, which tells the backend to bypass its 30-minute sales
  // cache. Without it the button re-fetches the identical cached payload and the
  // feed looks stuck. The backend still rate-limits how often it will recompute.
  async function fetchData({ force = false } = {}) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/sales${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message || 'Failed to load sales.');
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
            <span>[sales]</span>
          </span>
        </div>

        <div className="px-6">
          {data && !loading && (
            <div className="mb-4">
              <button className="btn-primary btn-sm text-xs" onClick={() => fetchData({ force: true })}>
                [refresh sales]
              </button>
            </div>
          )}
          <SalesView data={data} loading={loading} error={error} ethUsd={ethUsd} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
