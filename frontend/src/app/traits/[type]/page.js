'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import TraitsResultView from '@/components/TraitsResultView';
import { API_URL, pickRandomWhale, connectAndRedirect, Footer } from '@/components/shared';
import { TRAIT_DESCRIPTIONS } from '@/lib/traitDescriptions';

export default function TraitsDetailPage({ params }) {
  const { type } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`${API_URL}/traits/${type}`)
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      })
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load trait results.'));
  }, [type]);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} onWhale={() => { window.location.href = `/?address=${pickRandomWhale()}`; }} />
      <main className="flex-1 px-6">
        <div className="mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <a href="/traits" className="no-underline opacity-60 hover:opacity-100">[traits]</a>
            <span> / </span>
            <span>[{data?.label?.toLowerCase() || type}]</span>
          </span>
        </div>

        {error && <p className="text-sm opacity-70">[error: {error}]</p>}
        {!data && !error && <p className="text-sm opacity-60">[loading parcels...]</p>}
        {data && (
          <>
            {TRAIT_DESCRIPTIONS[type] && (
              <p className="opacity-65 text-sm mb-4 leading-relaxed">{TRAIT_DESCRIPTIONS[type]}</p>
            )}
            <p className="opacity-55 text-sm mb-2">
              {data.count} {data.count === 1 ? 'parcel' : 'parcels'} matching this trait, sorted by token ID. Click any to view details.
            </p>
            <TraitsResultView parcels={data.parcels} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
