'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { API_URL, CATEGORY_COLORS, connectAndRedirect, getZoneLoreUrl, Footer } from '@/components/shared';

const TIERS = ['Mythical', 'Rare', 'Premium', 'Uncommon', 'Floor'];
const TIER_COLORS = { ...CATEGORY_COLORS, Floor: 'rgba(232,232,232,0.4)' };

const KINDS = [
  { key: 'zone',  label: 'Zones',  name: n => n },
  { key: 'biome', label: 'Biomes', name: n => `B${n}` },
  { key: 'level', label: 'Levels', name: n => `L${n}` },
];

// Below this many sales the multiple leans on the model's prior rather than on
// trades, and scarcity sets the tier. Mirrors mythicalMaxSales in the rules.
const thinData = (row, rules) => row.sales != null && row.sales < rules.mythicalMaxSales;

export default function DesirabilityTiersPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/trait-tiers`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load tiers.'));
  }, []);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1 px-6 max-w-2xl">
        <h1 className="text-3xl mb-2">Desirability Tiers</h1>
        <p className="opacity-55 text-sm mb-10">
          Every zone, biome and level, ranked by tier. Definitions are in the <a href="/glossary" className="underline">glossary</a>.
        </p>

        {error && <p className="text-sm opacity-70">[error: {error}]</p>}
        {!data && !error && <p className="text-sm opacity-60">[loading tiers...]</p>}

        {data && KINDS.map(kind => <KindSection key={kind.key} kind={kind} rows={data[kind.key]} rules={data.rules} />)}
        {data && (
          <div className="text-xs opacity-45 mt-10 mb-12 space-y-2">
            <p>* Fewer than {data.rules.mythicalMaxSales} sales: the multiple leans on the model&apos;s prior, and scarcity sets the tier.</p>
            <p>Price multiples from the pricing model fitted {data.model?.slice(0, 10)}, against a Holo, biome 46, mid-level parcel (1.00×). Parcel counts cover the {data.minted.toLocaleString()} minted parcels.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function KindSection({ kind, rows, rules }) {
  const entries = Object.entries(rows || {}).map(([name, row]) => ({ name, ...row }));
  return (
    <details className="group mb-2" style={{ borderBottom: '1px solid rgba(232,232,232,0.1)' }}>
      <summary className="flex items-baseline gap-3 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-lg opacity-80">{kind.label}</span>
        <span className="text-xs opacity-45">{entries.length}</span>
        <span className="ml-auto text-sm opacity-50 group-open:hidden">[+]</span>
        <span className="ml-auto text-sm opacity-50 hidden group-open:inline">[−]</span>
      </summary>
      <div className="pt-3 pb-4">
        {TIERS.map(tier => {
          const group = entries
            .filter(r => r.tier === tier)
            .sort((a, b) => b.multiple - a.multiple || a.parcels - b.parcels);
          if (group.length === 0) return null;
          return (
            <div key={tier} className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <TierBadge tier={tier} />
                <span className="text-xs opacity-45">{group.length}</span>
              </div>
              <div className="flex text-xs opacity-40 pb-1">
                <span className="flex-1">{kind.label.slice(0, -1).toLowerCase()}</span>
                <span className="w-20 text-right">multiple</span>
                <span className="w-20 text-right">parcels</span>
              </div>
              {group.map(r => <TraitLine key={r.name} kind={kind} row={r} thin={thinData(r, rules)} />)}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function TraitLine({ kind, row, thin }) {
  const label = kind.name(row.name);
  const lore = kind.key === 'zone' ? getZoneLoreUrl(row.name) : null;
  return (
    <div className="flex text-sm py-1" style={{ borderTop: '1px solid rgba(232,232,232,0.06)' }}>
      <span className="flex-1 min-w-0 truncate">
        {lore
          ? <a href={lore} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline">{label}</a>
          : label}
      </span>
      <span className="w-20 text-right tabular-nums opacity-80">{row.multiple.toFixed(2)}×{thin ? '*' : ''}</span>
      <span className="w-20 text-right tabular-nums opacity-60">{row.parcels.toLocaleString()}</span>
    </div>
  );
}

function TierBadge({ tier }) {
  const color = TIER_COLORS[tier];
  return (
    <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
      {tier}
    </span>
  );
}
