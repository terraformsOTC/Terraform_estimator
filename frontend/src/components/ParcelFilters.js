'use client';

import { useState } from 'react';
import { ALL_ZONES, ALL_MODES, ALL_CHROMAS, ALL_BIOMES, ALL_LEVELS } from '@/lib/parcelTraitDomains';

// Attribute filtering for parcel grids (wallet/portfolio view).
//
// Semantics mirror terraformexplorer.xyz: a parcel passes when it matches SOME
// selected value in EVERY attribute that has a selection — OR within an
// attribute, AND across attributes.
//
// Unlike the explorer, every value in the collection is listed, not just the
// ones the wallet holds: unowned values render greyed and inert, so the panel
// doubles as a "what's missing" view.

// Order here is the order sections render in: the two small always-open
// sections first, then the long collapsible ones.
export const FILTER_ATTRS = [
  {
    key: 'mode',
    label: 'mode',
    domain: ALL_MODES,
    get: t => t.mode || 'Terrain',
    compare: (a, b) => String(a).localeCompare(String(b)),
    format: v => v,
    layout: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
    collapsible: false,
  },
  {
    key: 'chroma',
    label: 'chroma',
    domain: ALL_CHROMAS,
    get: t => t.chroma || 'Flow',
    compare: (a, b) => String(a).localeCompare(String(b)),
    format: v => v,
    layout: 'grid grid-cols-2 sm:grid-cols-4',
    collapsible: false,
  },
  {
    key: 'level',
    label: 'level',
    domain: ALL_LEVELS,
    get: t => (Number.isInteger(t.level) && t.level > 0 ? t.level : null),
    compare: (a, b) => a - b,
    format: v => `L${v}`,
    layout: 'grid grid-cols-4 sm:grid-cols-7 md:grid-cols-10',
    collapsible: true,
  },
  {
    key: 'zone',
    label: 'zone',
    domain: ALL_ZONES,
    get: t => t.zone || null,
    compare: (a, b) => String(a).localeCompare(String(b)),
    format: v => v,
    layout: 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6',
    collapsible: true,
  },
  {
    key: 'biome',
    label: 'biome',
    domain: ALL_BIOMES,
    get: t => (Number.isInteger(t.biome) && t.biome >= 0 ? t.biome : null),
    compare: (a, b) => a - b,
    format: v => `B${v}`,
    layout: 'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10',
    collapsible: true,
  },
];

export const EMPTY_FILTERS = Object.freeze(
  Object.fromEntries(FILTER_ATTRS.map(a => [a.key, new Set()])),
);

export function hasActiveFilters(filters) {
  return FILTER_ATTRS.some(a => filters[a.key]?.size > 0);
}

export function countActiveFilters(filters) {
  return FILTER_ATTRS.reduce((n, a) => n + (filters[a.key]?.size ?? 0), 0);
}

// { mode: [{ value, label, count }], ... } covering the whole collection domain.
// count is 0 for values the wallet doesn't hold — those render greyed and inert
// rather than being dropped. Values observed on a parcel but missing from the
// domain (a stale snapshot) are merged in so nothing becomes unfilterable.
export function buildFilterOptions(parcels) {
  const tallies = Object.fromEntries(FILTER_ATTRS.map(a => [a.key, new Map()]));

  for (const { traits } of parcels) {
    if (!traits) continue;
    for (const attr of FILTER_ATTRS) {
      const value = attr.get(traits);
      if (value == null) continue;
      const map = tallies[attr.key];
      map.set(value, (map.get(value) ?? 0) + 1);
    }
  }

  return Object.fromEntries(
    FILTER_ATTRS.map(attr => {
      const counts = tallies[attr.key];
      const values = [...new Set([...attr.domain, ...counts.keys()])].sort(attr.compare);
      return [
        attr.key,
        values.map(value => ({ value, label: attr.format(value), count: counts.get(value) ?? 0 })),
      ];
    }),
  );
}

export function matchesFilters(parcel, filters) {
  const traits = parcel?.traits;
  if (!traits) return false;
  return FILTER_ATTRS.every(attr => {
    const selected = filters[attr.key];
    if (!selected || selected.size === 0) return true;
    const value = attr.get(traits);
    return value != null && selected.has(value);
  });
}

// Immutable toggle — returns a new filters object with `value` flipped.
export function toggleFilterValue(filters, key, value) {
  const next = { ...filters };
  const set = new Set(next[key]);
  if (set.has(value)) set.delete(value); else set.add(value);
  next[key] = set;
  return next;
}

// Label left, owned count right — keeps the count visually distinct from
// numeric labels like B46 / L14, which would otherwise run together.
function FilterChip({ label, count, active, owned, title, onClick }) {
  return (
    <button
      onClick={owned ? onClick : undefined}
      disabled={!owned}
      title={title}
      className="text-xs px-1 py-0.5 flex items-center justify-between gap-1 w-full"
      style={{
        border: `1px solid ${
          !owned ? 'rgba(200,200,200,0.15)'
            : active ? 'rgba(232,232,232,0.75)'
            : 'rgba(232,232,232,0.18)'
        }`,
        background: active ? 'rgba(232,232,232,0.12)' : 'transparent',
        color: owned ? 'inherit' : 'rgba(200,200,200,0.25)',
        opacity: !owned ? 1 : active ? 1 : 0.65,
        cursor: owned ? 'pointer' : 'default',
      }}
    >
      <span className="truncate">{label}</span>
      {count > 0 && <span className="flex-shrink-0" style={{ opacity: 0.5 }}>{count}</span>}
    </button>
  );
}

function FilterSection({ attr, options, selected, onToggle, open, onToggleOpen }) {
  const selectedCount = selected?.size ?? 0;
  const ownedCount = options.filter(o => o.count > 0).length;

  const grid = (
    <div className={`${attr.layout} gap-1`}>
      {options.map(({ value, label, count }) => (
        <FilterChip
          key={String(value)}
          label={label}
          count={count}
          owned={count > 0}
          active={selected?.has(value)}
          title={
            count > 0
              ? `${attr.label} ${label} — ${count} ${count === 1 ? 'parcel' : 'parcels'}`
              : `${attr.label} ${label} — none owned`
          }
          onClick={() => onToggle(attr.key, value)}
        />
      ))}
    </div>
  );

  if (!attr.collapsible) {
    return (
      <div className="mb-3">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ opacity: 0.4 }}>
          {attr.label}
        </p>
        {grid}
      </div>
    );
  }

  return (
    <div className="mb-3">
      <button
        onClick={onToggleOpen}
        className="flex items-center gap-2 mb-1 text-xs w-full text-left"
      >
        <span className="uppercase tracking-widest" style={{ opacity: 0.4 }}>{attr.label}</span>
        <span style={{ opacity: 0.5 }}>{open ? '[−]' : '[+]'}</span>
        <span style={{ opacity: 0.3 }}>{ownedCount}/{options.length} owned</span>
        {selectedCount > 0 && (
          <span style={{ opacity: 0.75 }}>· {selectedCount} selected</span>
        )}
      </button>
      {open && grid}
    </div>
  );
}

export function ParcelFilterPanel({ options, filters, onToggle, onReset, onClose }) {
  // Long sections start collapsed so the panel opens compact.
  const [openSections, setOpenSections] = useState(() => new Set());
  const toggleSection = key =>
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="mb-6 p-3" style={{ border: '1px solid rgba(232,232,232,0.15)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm opacity-80">filter parcels</span>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={onReset} style={{ opacity: 0.6 }}>[reset]</button>
          <button onClick={onClose} style={{ opacity: 0.6 }}>[close]</button>
        </div>
      </div>

      {FILTER_ATTRS.map(attr => (
        <FilterSection
          key={attr.key}
          attr={attr}
          options={options[attr.key] ?? []}
          selected={filters[attr.key]}
          onToggle={onToggle}
          open={openSections.has(attr.key)}
          onToggleOpen={() => toggleSection(attr.key)}
        />
      ))}
    </div>
  );
}

// Removable summary of what's currently selected, shown whether or not the
// panel is expanded.
export function ActiveFilterChips({ filters, onToggle, onReset }) {
  const active = FILTER_ATTRS.flatMap(attr =>
    [...(filters[attr.key] ?? [])].map(value => ({ attr, value })),
  );
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 mb-4 text-xs">
      {active.map(({ attr, value }) => (
        <button
          key={`${attr.key}-${value}`}
          onClick={() => onToggle(attr.key, value)}
          title="remove filter"
          className="px-1 py-0.5"
          style={{ border: '1px solid rgba(232,232,232,0.3)', opacity: 0.8 }}
        >
          {attr.label}: {attr.format(value)} ×
        </button>
      ))}
      <button onClick={onReset} style={{ opacity: 0.5, textDecoration: 'underline' }}>
        clear all
      </button>
    </div>
  );
}
