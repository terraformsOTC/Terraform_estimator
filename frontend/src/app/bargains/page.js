'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import UndervaluedView from '@/components/UndervaluedView';
import { API_URL, pickRandomWhale, Footer } from '@/components/shared';

export default function BargainsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/undervalued`);
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
      <Header onConnect={() => {}} onDisconnect={() => {}} onWhale={() => { window.location.href = `/?address=${pickRandomWhale()}`; }} />
      <main className="flex-1">
        <div className="px-6 mb-6">
          <span className="text-2xl md:text-3xl">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[bargains]</span>
          </span>
        </div>

        <div className="px-6">
          {data && !loading && (
            <div className="mb-4">
              <button className="btn-primary btn-sm text-xs" onClick={fetchData}>
                [refresh listings]
              </button>
            </div>
          )}
          <UndervaluedView data={data} loading={loading} error={error} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
