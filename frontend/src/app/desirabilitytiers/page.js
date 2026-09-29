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
// trades, and the tier is set by scarcity. Mirrors mythicalMaxSales in the rules.
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

        {data && <Rubric rules={data.rules} />}
        {data && KINDS.map(kind => <KindSection key={kind.key} kind={kind} rows={data[kind.key]} rules={data.rules} />)}
        {data && (
          <p className="text-xs opacity-45 mb-12">
            Price multiples from the pricing model fitted {data.model?.slice(0, 10)}, against a Holo, biome 46, mid-level parcel (1.00×). Parcel counts cover the {data.minted.toLocaleString()} minted parcels.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Rubric({ rules }) {
  const rows = [
    ['Mythical', `Price multiple ${rules.mythicalMultiple}× or more, or ${rules.mythicalMaxParcels} parcels or fewer with under ${rules.mythicalMaxSales} sales`],
    ['Rare',     `Price multiple ${rules.rareMultiple}× or more, and ${rules.rareMaxParcels} parcels or fewer`],
    ['Premium',  `Price multiple ${rules.premiumMultiple}× or more, short of Rare on multiple or scarcity`],
    ['Uncommon', `Price multiple under ${rules.premiumMultiple}×, and ${rules.uncommonMaxParcels} parcels or fewer`],
    ['Floor',    `Price multiple under ${rules.premiumMultiple}×, and more than ${rules.uncommonMaxParcels} parcels`],
  ];
  return (
    <section className="mb-12">
      <h2 className="text-lg mb-1 opacity-80">Rubric</h2>
      <div className="mb-4" style={{ borderBottom: '1px solid rgba(232,232,232,0.1)' }} />
      <p className="text-sm opacity-65 mb-4 leading-relaxed">
        <strong>Price multiple</strong> is what parcels carrying the trait sell for against an otherwise identical parcel, fitted across 20,000+ sales with recent trades weighted most. <strong>Scarcity</strong> is the number of minted parcels carrying the trait. A trait takes the highest tier whose test it passes.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map(([tier, rule]) => (
          <div key={tier} className="flex items-baseline gap-3 text-sm">
            <span className="shrink-0 w-20"><TierBadge tier={tier} /></span>
            <span className="opacity-65">{rule}</span>
          </div>
        ))}
      </div>
      <p className="text-xs opacity-45 mt-4">
        † fewer than {rules.mythicalMaxSales} sales: the multiple leans on the model&apos;s prior, and scarcity sets the tier.
      </p>
    </section>
  );
}

function KindSection({ kind, rows, rules }) {
  const entries = Object.entries(rows || {}).map(([name, row]) => ({ name, ...row }));
  return (
    <section className="mb-12">
      <h2 className="text-lg mb-1 opacity-80">{kind.label}</h2>
      <div className="mb-4" style={{ borderBottom: '1px solid rgba(232,232,232,0.1)' }} />
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
    </section>
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
      <span className="w-20 text-right tabular-nums opacity-80">{row.multiple.toFixed(2)}×{thin ? '†' : ''}</span>
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
