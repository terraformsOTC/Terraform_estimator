'use client';

// Attribute filtering for parcel grids (wallet/portfolio view).
//
// Semantics mirror terraformexplorer.xyz: the option list for each attribute is
// derived from the parcels actually present (not the whole collection), and a
// parcel passes when it matches SOME selected value in EVERY attribute that has
// a selection — OR within an attribute, AND across attributes.

// Order here is the order sections render in: smallest option sets first.
export const FILTER_ATTRS = [
  {
    key: 'mode',
    label: 'mode',
    get: t => t.mode || 'Terrain',
    compare: (a, b) => String(a).localeCompare(String(b)),
    format: v => v,
    layout: 'flex flex-wrap',
    showCount: true,
  },
  {
    key: 'chroma',
    label: 'chroma',
    get: t => t.chroma || 'Flow',
    compare: (a, b) => String(a).localeCompare(String(b)),
    format: v => v,
    layout: 'flex flex-wrap',
    showCount: true,
  },
  {
    key: 'level',
    label: 'level',
    get: t => (Number.isInteger(t.level) && t.level > 0 ? t.level : null),
    compare: (a, b) => a - b,
    format: v => `L${v}`,
    layout: 'grid grid-cols-5 sm:grid-cols-10',
    showCount: false,
  },
  {
    key: 'zone',
    label: 'zone',
    get: t => t.zone || null,
    compare: (a, b) => String(a).localeCompare(String(b)),
    format: v => v,
    layout: 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6',
    showCount: true,
  },
  {
    key: 'biome',
    label: 'biome',
    get: t => (Number.isInteger(t.biome) && t.biome >= 0 ? t.biome : null),
    compare: (a, b) => a - b,
    format: v => `B${v}`,
    layout: 'grid grid-cols-5 sm:grid-cols-8 md:grid-cols-12',
    showCount: false,
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

// { mode: [{ value, label, count }], chroma: [...], zone: [...], biome: [...] }
// Only values present in `parcels` become options, so the panel never offers a
// selection that yields zero results.
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
    FILTER_ATTRS.map(attr => [
      attr.key,
      [...tallies[attr.key].entries()]
        .sort((a, b) => attr.compare(a[0], b[0]))
        .map(([value, count]) => ({ value, label: attr.format(value), count })),
    ]),
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

function FilterChip({ label, count, active, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-xs px-1 py-0.5 text-left truncate"
      style={{
        border: `1px solid ${active ? 'rgba(232,232,232,0.75)' : 'rgba(232,232,232,0.18)'}`,
        background: active ? 'rgba(232,232,232,0.12)' : 'transparent',
        opacity: active ? 1 : 0.65,
        cursor: 'pointer',
      }}
    >
      {label}
      {count != null && <span style={{ opacity: 0.45 }}> {count}</span>}
    </button>
  );
}

export function ParcelFilterPanel({ options, filters, onToggle, onReset, onClose }) {
  return (
    <div
      className="mb-6 p-3"
      style={{ border: '1px solid rgba(232,232,232,0.15)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm opacity-80">filter parcels</span>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={onReset} style={{ opacity: 0.6 }}>[reset]</button>
          <button onClick={onClose} style={{ opacity: 0.6 }}>[close]</button>
        </div>
      </div>

      {FILTER_ATTRS.map(attr => {
        const attrOptions = options[attr.key] ?? [];
        if (attrOptions.length === 0) return null;
        const selected = filters[attr.key];
        return (
          <div key={attr.key} className="mb-3 last:mb-0">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ opacity: 0.4 }}>
              {attr.label}
            </p>
            <div className={`${attr.layout} gap-1`}>
              {attrOptions.map(({ value, label, count }) => (
                <FilterChip
                  key={String(value)}
                  label={label}
                  count={attr.showCount ? count : null}
                  title={`${attr.label} ${label} — ${count} ${count === 1 ? 'parcel' : 'parcels'}`}
                  active={selected?.has(value)}
                  onClick={() => onToggle(attr.key, value)}
                />
              ))}
            </div>
          </div>
        );
      })}
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
