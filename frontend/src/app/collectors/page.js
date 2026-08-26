'use client';

// Top 100 holders by parcel count.
//
// The whole list is one cached backend call — ownership comes from a single
// contract-wide Alchemy query, and traits and sets are resolved locally from the
// minted snapshot, so this costs no more to render than any other page.
//
// Replaced [random collector], which threw you at one of a handful of hardcoded
// addresses with no way to tell whose parcels you were looking at.

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { API_URL, connectAndRedirect, Footer, shortAddr } from '@/components/shared';

export default function CollectorsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/collectors`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        return j;
      })
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load collectors.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1">
        <div className="px-6 mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[collectors]</span>
          </span>
        </div>

        <div className="px-6">
          {loading && <p className="text-sm opacity-75">[loading collectors...]</p>}
          {error && <p className="text-sm" style={{ color: '#e06c6c' }}>[error: {error}]</p>}
          {data && <CollectorTable data={data} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function CollectorTable({ data }) {
  const { collectors, totalOwners, totalParcels, fetchedAt } = data;
  const held = collectors.reduce((sum, c) => sum + c.parcels, 0);

  return (
    <div>
      <p className="mb-6 text-xs opacity-50">
        top {collectors.length} of {totalOwners.toLocaleString()} holders
        {' · '}they hold {held.toLocaleString()} of {totalParcels.toLocaleString()} parcels
        {' '}({Math.round((held / totalParcels) * 100)}%)
        {fetchedAt ? ` · cached at ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full min-w-[520px]">
          <thead>
            <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
              <th className="pb-3 pr-4 font-normal">#</th>
              <th className="pb-3 pr-4 font-normal">collector</th>
              <th className="pb-3 pr-4 font-normal text-right">parcels</th>
              <th className="pb-3 pr-4 font-normal text-right">sets</th>
              <th className="pb-3 font-normal">completed</th>
            </tr>
          </thead>
          <tbody>
            {collectors.map(c => (
              <tr key={c.address} className="border-b" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
                <td className="py-3 pr-4 opacity-40">{c.rank}</td>
                <td className="py-3 pr-4">
                  <a href={`/?address=${c.address}`} className="no-underline hover:underline whitespace-nowrap" title={c.address}>
                    {c.ens || shortAddr(c.address)}
                  </a>
                </td>
                <td className="py-3 pr-4 text-right">{c.parcels}</td>
                <td className="py-3 pr-4 text-right">
                  {c.setsCompleted > 0
                    ? <span>{c.setsCompleted}</span>
                    : <span className="opacity-30">—</span>}
                </td>
                <td className="py-3 text-xs opacity-60">
                  {c.sets.length ? c.sets.join(', ') : <span className="opacity-50">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs opacity-40">
        Ownership is read from the contract; sets are computed from the same definitions the wallet
        view uses. A collector holding parcels across several wallets appears once per wallet.
      </p>
    </div>
  );
}
