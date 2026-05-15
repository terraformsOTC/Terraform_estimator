'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { API_URL, SpecialBadge, pickRandomWhale, connectAndRedirect, Footer } from '@/components/shared';

// Maps backend trait slugs → SPECIAL_TYPE_BADGES keys for chip styling.
const BADGE_KEY = {
  'godmode': 'Godmode',
  'origin-daydream': 'Origin Daydream',
  'origin-terraform': 'Origin Terraform',
  'plague': 'Plague',
  'x-seed': 'X-Seed',
  'y-seed': 'Y-Seed',
  'lith0': 'Lith0',
  'spine': 'Spine',
  '1of1': '1of1',
  's0': 'S0',
  'biome0': 'Biome0',
  'lith0like': 'Lith0like',
  'mesa': 'Mesa',
  'matrix': 'Matrix',
  'big-grass': 'BigGrass',
  'little-grass': 'LittleGrass',
  'heartbeat': 'Heartbeat',
  'gm': 'gm',
  'basement': 'Basement',
  'penthouse': 'Penthouse',
};

const GROUPS = [
  { key: 'special', label: 'Special Types' },
  { key: 'mode',    label: 'Origin Modes' },
  { key: 'visual',  label: 'Auto-Detected Visual Traits' },
  { key: 'level',   label: 'Level Extremes' },
];

export default function TraitsIndexPage() {
  const [types, setTypes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/traits`)
      .then(r => r.json())
      .then(d => setTypes(d.types))
      .catch(e => setError(e.message || 'Failed to load traits.'));
  }, []);

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} onWhale={() => { window.location.href = `/?address=${pickRandomWhale()}`; }} />
      <main className="flex-1 px-6 max-w-2xl">
        <div className="mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[traits]</span>
          </span>
        </div>
        <p className="opacity-55 text-sm mb-10">
          Find every parcel — minted or unminted — matching a given special trait. Counts include both minted and unminted parcels.
        </p>

        {error && <p className="text-sm opacity-70">[error: {error}]</p>}
        {!types && !error && <p className="text-sm opacity-60">[loading trait counts...]</p>}

        {types && GROUPS.map(group => {
          const groupTypes = types.filter(t => t.group === group.key);
          if (groupTypes.length === 0) return null;
          return (
            <section key={group.key} className="mb-10">
              <h2 className="text-xs opacity-50 uppercase tracking-widest mb-3">{group.label}</h2>
              <div className="flex flex-col">
                {groupTypes.map(t => <TraitRow key={t.type} trait={t} />)}
              </div>
            </section>
          );
        })}
      </main>
      <Footer />
    </div>
  );
}

function TraitRow({ trait }) {
  const disabled = trait.count === 0;
  const className = `flex items-center justify-between py-3 border-b no-underline ${disabled ? 'opacity-40 pointer-events-none' : 'hover:opacity-80'}`;
  const content = (
    <>
      <div className="flex items-center gap-3">
        <SpecialBadge type={BADGE_KEY[trait.type]} />
        <span className="text-sm">{trait.label}</span>
      </div>
      <span className="text-xs opacity-55">
        {trait.count} {trait.count === 1 ? 'parcel' : 'parcels'}
      </span>
    </>
  );
  if (disabled) {
    return (
      <div className={className} style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
        {content}
      </div>
    );
  }
  return (
    <a href={`/traits/${trait.type}`} className={className} style={{ borderColor: 'rgba(232,232,232,0.08)' }}>
      {content}
    </a>
  );
}
