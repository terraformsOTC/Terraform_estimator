'use client';

// Top 100 holders by parcel count.
//
// The whole list is one cached backend call — ownership comes from a single
// contract-wide Alchemy query, and traits and sets are resolved locally from the
// minted snapshot, so this costs no more to render than any other page.
//
// Replaced [random collector], which threw you at one of a handful of hardcoded
// addresses with no way to tell whose parcels you were looking at.
//
// Sortable by parcel count or portfolio value. The backend ranks every holder
// both ways and sends each list's top 100, so value order is a real ranking of
// all holders, not the count list re-sorted. ?sort=value keeps it in the URL.

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

const SORTS = {
  parcels: { label: '[parcels]', rank: c => c.rankByParcels },
  value:   { label: '[value]',   rank: c => c.rankByValue },
};

function sortFromLocation() {
  if (typeof window === 'undefined') return 'parcels';
  const s = new URLSearchParams(window.location.search).get('sort');
  return s in SORTS ? s : 'parcels';
}

function CollectorTable({ data }) {
  const { totalOwners, totalParcels, totalValue, fetchedAt } = data;
  const [sort, setSortState] = useState('parcels');
  useEffect(() => { setSortState(sortFromLocation()); }, []);

  function setSort(next) {
    setSortState(next);
    const url = new URL(window.location.href);
    if (next === 'parcels') url.searchParams.delete('sort'); else url.searchParams.set('sort', next);
    window.history.replaceState(null, '', url);
  }

  const rankOf = SORTS[sort].rank;
  const collectors = data.collectors.filter(c => rankOf(c) != null).sort((a, b) => rankOf(a) - rankOf(b));
  const held = collectors.reduce((sum, c) => sum + c.parcels, 0);
  const heldValue = collectors.reduce((sum, c) => sum + c.value, 0);

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 text-xs">
        <span className="opacity-50">sort:</span>
        {Object.entries(SORTS).map(([key, s]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            aria-pressed={sort === key}
            className={`btn-primary btn-sm text-xs${sort === key ? '' : ' opacity-40'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="mb-6 text-xs opacity-50">
        top {collectors.length} of {totalOwners.toLocaleString()} holders by {sort === 'value' ? 'portfolio value' : 'parcel count'}
        {sort === 'value' && totalValue
          ? <>{' · '}they hold {Math.round(heldValue).toLocaleString()} of {Math.round(totalValue).toLocaleString()} ETH ({Math.round((heldValue / totalValue) * 100)}%)</>
          : <>{' · '}they hold {held.toLocaleString()} of {totalParcels.toLocaleString()} parcels ({Math.round((held / totalParcels) * 100)}%)</>}
        {fetchedAt ? ` · cached at ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full sm:min-w-[600px]">
          <thead>
            <tr className="text-xs opacity-50 uppercase sm:tracking-widest text-left">
              <th className="pb-3 pr-2 sm:pr-4 font-normal">#</th>
              <th className="pb-3 pr-2 sm:pr-4 font-normal">collector</th>
              <th className="pb-3 pr-2 sm:pr-4 font-normal text-right">parcels</th>
              <th className="pb-3 pr-2 sm:pr-4 font-normal text-right">value<span className="hidden sm:inline"> (ETH)</span></th>
              <th className="pb-3 pr-2 sm:pr-4 font-normal text-right">sets</th>
              <th className="pb-3 font-normal hidden sm:table-cell">completed</th>
            </tr>
          </thead>
          <tbody>
            {collectors.map(c => (
              <tr key={c.address} className="border-b" style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
                <td className="py-3 pr-2 sm:pr-4 opacity-40">{rankOf(c)}</td>
                <td className="py-3 pr-2 sm:pr-4">
                  <a href={`/?address=${c.address}`} className="no-underline hover:underline whitespace-nowrap block max-w-[8rem] sm:max-w-none truncate" title={c.ens ? `${c.ens} · ${c.address}` : c.address}>
                    {c.ens || shortAddr(c.address)}
                  </a>
                </td>
                <td className="py-3 pr-2 sm:pr-4 text-right">{c.parcels}</td>
                <td className="py-3 pr-2 sm:pr-4 text-right tabular-nums whitespace-nowrap">
                  {c.value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td className="py-3 pr-2 sm:pr-4 text-right">
                  {c.setsCompleted > 0
                    ? <span>{c.setsCompleted}</span>
                    : <span className="opacity-30">—</span>}
                </td>
                <td className="py-3 text-xs opacity-60 hidden sm:table-cell">
                  {c.sets.length ? c.sets.join(', ') : <span className="opacity-50">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs opacity-40">
        Ownership is read from the contract; sets are computed from the same definitions the wallet
        view uses. Value is the liquidation (bid-side) estimate summed over each wallet&apos;s parcels, the
        same total the wallet view shows. A collector holding parcels across several wallets appears
        once per wallet.
      </p>
    </div>
  );
}
