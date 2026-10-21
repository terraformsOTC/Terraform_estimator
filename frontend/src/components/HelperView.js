'use client';

// /helper — the collection helper.
//
// A collector adds their wallets (or connects one; linked vaults and Safes are
// suggested), picks goals, and sees for each goal what they hold, what is
// missing, what is listed that fills it, and a shopping list: the cheapest
// current listings that fill the most missing goals within a budget.
//
// The setup is mirrored into the URL (so a view can be shared) and saved in this
// browser as it is edited (lib/wishlist.js). A link carrying a different view
// opens as a shared view, which is never saved unless the collector keeps it —
// so opening someone's link can't change their own setup or wishlist. The
// backend does all the work in one call; see backend/src/collectionHelper.js.
//
// With a wallet in the group connected, the setup can be turned into a wishlist:
// the listings page then marks every listing that fills one of its gaps.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from '@/components/Header';
import { API_URL, Footer, shortAddr, vsModelColor, parcelImage } from '@/components/shared';
import { SET_COLORS } from '@/lib/setsGlossary';
import { FilterChip } from '@/components/ParcelFilters';
import { BLADES, ORIGIN_SET_COUNTS, abbreviateGlyphs, originGlyphSet } from '@/lib/parcelGlyphs';
import { authorizedAccounts, readHelper, writeHelper, WISHLIST_COLOR } from '@/lib/wishlist';

const DEFAULT_GOALS = ['set:full-zone', 'set:full-biome', 'specials'];
// Presets since retired (2026-10-21); a saved setup or an old link may still name them.
const RETIRED_GOALS = new Set(['chroma', 'mode']);
// Goals that moved to the level and biome menus (2026-10-21): the same parcels.
const MOVED_GOALS = { 'trait:penthouse': 'level:20', 'trait:basement': 'level:1', 'trait:biome0': 'biome:0' };
const cleanGoals = goals => [...new Set(goals.filter(g => g && !RETIRED_GOALS.has(g)).map(g => MOVED_GOALS[g] ?? g))];
const MAX_WALLETS = 10;
const TF = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const BOX = { border: '1px solid rgba(232,232,232,0.15)' };
const SELECT = {
  background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(232,232,232,0.3)',
  fontFamily: "'Courier New', Courier, monospace", fontSize: '14px', padding: '3px 6px',
};
// Price against the model's value, as % over it (negative: at least that far
// under). The shopping list and the wishlist each take one.
const PRICE_STEPS = [-30, -20, -10, 0, 10, 25, 50, 100].map(n => ({
  value: String(n),
  label: n < 0 ? `at least ${-n}% under model` : n === 0 ? 'at or below model' : `up to ${n}% over model`,
}));
const PREMIUMS = [{ value: '', label: 'any price vs model' }, ...PRICE_STEPS];
const WISH_PRICES = [{ value: '', label: 'any price' }, ...PRICE_STEPS];

// ─── state ───────────────────────────────────────────────────────────────────
// modes: the modes that count ([] = any). wprem: the wishlist's price against
// the model, as prem is the shopping list's.
const emptyState = () => ({ wallets: [], goals: DEFAULT_GOALS, modes: [], budget: '', max: '', prem: '', wprem: '' });
const viewOf = s => {
  const e = emptyState();
  return {
    wallets: s.wallets ?? e.wallets, goals: cleanGoals(s.goals ?? e.goals), modes: s.modes ?? e.modes,
    budget: s.budget ?? '', max: s.max ?? '', prem: s.prem ?? '', wprem: s.wprem ?? '',
  };
};

// The view a /helper?w=…&g=… link carries, or null for a bare /helper.
function viewFromUrl() {
  const q = new URLSearchParams(window.location.search);
  if (!(q.get('w') || q.get('g'))) return null;
  return {
    wallets: (q.get('w') || '').split(',').map(w => w.trim()).filter(Boolean).slice(0, MAX_WALLETS),
    goals: q.get('g') ? cleanGoals(q.get('g').split(',')) : DEFAULT_GOALS,
    modes: q.get('md') ? q.get('md').split(',').filter(Boolean) : [],
    budget: q.get('b') || '', max: q.get('m') || '', prem: q.get('p') || '', wprem: q.get('wp') || '',
  };
}

// Same wallets and goals in any order, same limits — a reload of your own
// /helper URL, say.
const viewKey = v => JSON.stringify([v.wallets.map(w => w.toLowerCase()).sort(), [...v.goals].sort(), [...v.modes].sort(), v.budget, v.max, v.prem, v.wprem]);
const sameView = (a, b) => viewKey(viewOf(a)) === viewKey(viewOf(b));

// The resolved addresses of `wallets`, if `result` is the answer for them (and
// not for the view before an edit), else null. The listings page uses these to
// tell whether the connected wallet is in the group.
function addressesFor(result, wallets) {
  if (!result) return null;
  const want = wallets.map(w => w.toLowerCase());
  const got = new Set(result.wallets.flatMap(w => [w.input.toLowerCase(), w.address.toLowerCase()]));
  if (!want.every(w => got.has(w)) || !result.wallets.every(w => want.includes(w.input.toLowerCase()))) return null;
  return result.wallets.map(w => w.address);
}

function stateQuery(s, { forApi = false } = {}) {
  const q = new URLSearchParams();
  if (s.wallets.length) q.set(forApi ? 'wallets' : 'w', s.wallets.join(','));
  if (s.goals.length) q.set(forApi ? 'goals' : 'g', s.goals.join(','));
  if (s.modes.length) q.set(forApi ? 'modes' : 'md', s.modes.join(','));
  if (s.budget !== '') q.set(forApi ? 'budget' : 'b', s.budget);
  if (s.max !== '') q.set(forApi ? 'max' : 'm', s.max);
  if (s.prem !== '') q.set(forApi ? 'prem' : 'p', s.prem);
  if (s.wprem !== '') q.set(forApi ? 'wprem' : 'wp', s.wprem);
  return q.toString();
}

// ─── formatting ──────────────────────────────────────────────────────────────
const fmtEth = n => (n == null ? '—' : n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(3));
function vsModel(price, model) {
  if (price == null || !model) return null;
  const d = (model - price) / model; // the site's convention: positive = under model
  const p = Math.round(-d * 100);
  return { text: `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}% vs model`, color: vsModelColor(d) };
}
const opensea = id => `https://opensea.io/assets/ethereum/${TF}/${id}`;

// ─── view ────────────────────────────────────────────────────────────────────
export default function HelperView() {
  const [state, setState] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [linked, setLinked] = useState({});       // lowercased wallet input -> suggestions
  const [dismissed, setDismissed] = useState([]); // lowercased addresses
  const [connected, setConnected] = useState(null);
  const [saved, setSaved] = useState(null);    // the collector's own setup, as stored (lib/wishlist.js)
  const [shared, setShared] = useState(false); // looking at a link's view rather than their own
  const abortRef = useRef(null);

  useEffect(() => {
    const mine = readHelper();
    const link = viewFromUrl();
    setSaved(mine);
    // A link with a view other than the saved one opens as a shared view. With
    // no saved wallets there is nothing to protect, so the link's view is theirs.
    if (link && mine?.wallets.length && !sameView(link, mine)) {
      setShared(true);
      setState(link);
    } else {
      setState(link || (mine ? viewOf(mine) : emptyState()));
    }
  }, []);

  // A wallet the site can already read (connected here before) shows as
  // connected without a prompt. It is not added to the group unasked.
  useEffect(() => {
    let live = true;
    authorizedAccounts().then(accounts => { if (live && accounts[0]) setConnected(accounts[0]); });
    const onChange = accounts => setConnected(accounts?.[0] || null);
    window.ethereum?.on?.('accountsChanged', onChange);
    return () => {
      live = false;
      window.ethereum?.removeListener?.('accountsChanged', onChange);
    };
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/collection/catalog`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('catalog'))))
      .then(setCatalog)
      .catch(() => setError('Could not load the goal list. Refresh to try again.'));
  }, []);

  const update = useCallback(patch => setState(s => ({ ...s, ...patch })), []);

  // Mirror the view into the URL, so the address bar is always a shareable link.
  useEffect(() => {
    if (!state) return;
    const qs = stateQuery(state);
    window.history.replaceState(null, '', qs ? `/helper?${qs}` : '/helper');
  }, [state]);

  // The collector's own setup saves as they edit it, keeping the wishlist switch
  // and the group's resolved addresses with it. A shared view never does.
  useEffect(() => {
    if (!state || shared) return;
    setSaved(prev => ({
      ...viewOf(state),
      wishlist: !!prev?.wishlist,
      addresses: state.wallets.length === 0 ? [] : (addressesFor(result, state.wallets) ?? prev?.addresses ?? []),
    }));
  }, [state, shared, result]);

  useEffect(() => { if (saved) writeHelper(saved); }, [saved]);

  // Evaluate, debounced, cancelling any request still in flight.
  useEffect(() => {
    if (!state) return undefined;
    if (state.wallets.length === 0 || state.goals.length === 0) {
      setResult(null);
      return undefined;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      fetch(`${API_URL}/collection?${stateQuery(state, { forApi: true })}`, { signal: ctrl.signal })
        .then(async r => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `request failed (${r.status})`);
          return j;
        })
        .then(setResult)
        .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
        .finally(() => { if (abortRef.current === ctrl) setLoading(false); });
    }, 450);
    return () => clearTimeout(t);
  }, [state]);

  // Linked-wallet suggestions, fetched once per wallet.
  useEffect(() => {
    if (!state) return;
    for (const w of state.wallets) {
      const key = w.toLowerCase();
      if (key in linked) continue;
      setLinked(m => ({ ...m, [key]: null }));
      fetch(`${API_URL}/linked-wallets/${encodeURIComponent(w)}`)
        .then(r => (r.ok ? r.json() : { suggestions: [] }))
        .then(j => setLinked(m => ({ ...m, [key]: j.suggestions || [] })))
        .catch(() => setLinked(m => ({ ...m, [key]: [] })));
    }
  }, [state, linked]);

  const addWallets = useCallback(inputs => {
    setState(s => {
      const have = new Set(s.wallets.map(w => w.toLowerCase()));
      const next = [...s.wallets];
      for (const raw of inputs) {
        const w = raw.trim();
        if (w && !have.has(w.toLowerCase()) && next.length < MAX_WALLETS) { next.push(w); have.add(w.toLowerCase()); }
      }
      return { ...s, wallets: next };
    });
  }, []);

  const connect = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      setError('No browser wallet found. Paste an address or ENS name instead.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts?.[0]) { setConnected(accounts[0]); addWallets([accounts[0]]); }
    } catch (err) {
      if (err?.code !== 4001) setError('The wallet did not connect.');
    }
  }, [addWallets]);

  // Addresses already in the group, resolved ones included, so a suggestion for
  // a wallet entered by ENS name isn't offered again.
  const inGroup = useMemo(() => {
    const s = new Set((state?.wallets || []).map(w => w.toLowerCase()));
    for (const w of result?.wallets || []) s.add(w.address.toLowerCase());
    return s;
  }, [state, result]);

  const suggestions = useMemo(() => {
    const out = new Map();
    for (const list of Object.values(linked)) {
      for (const sug of list || []) {
        const key = sug.address.toLowerCase();
        if (inGroup.has(key) || dismissed.includes(key)) continue;
        if (!out.has(key)) out.set(key, sug);
      }
    }
    return [...out.values()];
  }, [linked, inGroup, dismissed]);

  if (!state) return null;

  return (
    <div className="content-wrapper">
      <Header walletAddress={connected} onConnect={connect} onDisconnect={() => setConnected(null)} />
      <main className="flex-1">
        <div className="px-6 mb-4">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[helper]</span>
          </span>
          <p className="text-sm opacity-70 mt-2 max-w-2xl">
            What your collection is missing across all your wallets, what is listed that fills each gap, and the
            cheapest way to fill them.
          </p>
        </div>

        <div className="px-6 flex flex-col gap-8">
          {shared && (
            <SharedViewBanner
              saved={saved}
              onKeep={() => setShared(false)}
              onBack={() => { setState(viewOf(saved)); setShared(false); }}
            />
          )}
          <WalletsPanel
            state={state} result={result} suggestions={suggestions}
            onAdd={addWallets} onConnect={connect}
            onRemove={w => update({ wallets: state.wallets.filter(x => x !== w) })}
            onDismiss={a => setDismissed(d => [...d, a.toLowerCase()])}
          />
          {catalog && <GoalsPanel state={state} catalog={catalog} update={update} />}
          <OptionsPanel state={state} update={update} />

          {error && <p className="text-sm" style={{ color: '#e06c6c' }}>[{error}]</p>}
          {state.wallets.length === 0 && (
            <p className="text-sm opacity-60">Add a wallet to see what your collection is missing.</p>
          )}
          {loading && !result && <p className="text-sm opacity-60">[working out your collection…]</p>}
          {result && (
            <Results result={result} loading={loading} modes={state.modes}>
              {!shared && (
                <WishlistPanel
                  result={result} connected={connected} on={!!saved?.wishlist}
                  onConnect={connect} onAdd={addWallets}
                  onSwitch={on => setSaved(s => ({ ...s, wishlist: on }))}
                  price={state.wprem} onPrice={wprem => update({ wprem })}
                />
              )}
            </Results>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── wallets ─────────────────────────────────────────────────────────────────
function WalletsPanel({ state, result, suggestions, onAdd, onConnect, onRemove, onDismiss }) {
  const [input, setInput] = useState('');
  const submit = e => {
    e.preventDefault();
    onAdd(input.split(/[\s,]+/));
    setInput('');
  };
  const full = state.wallets.length >= MAX_WALLETS;
  return (
    <section>
      <h2 className="text-lg mb-2 opacity-80">[wallets]</h2>
      <form onSubmit={submit} className="flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text" value={input} onChange={e => setInput(e.target.value)} disabled={full}
          placeholder="address or ENS — add every wallet you collect with" className="flex-1 min-w-[16rem]"
          aria-label="Wallet address or ENS name"
        />
        <button type="submit" className="btn-primary btn-sm" disabled={full || !input.trim()}>[add]</button>
        <button type="button" className="btn-primary btn-sm" onClick={onConnect} disabled={full}>[connect wallet]</button>
      </form>

      {state.wallets.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {state.wallets.map(w => {
            const r = result?.wallets?.find(x => x.input.toLowerCase() === w.toLowerCase() || x.address.toLowerCase() === w.toLowerCase());
            return (
              <span key={w} className="px-2 py-1 whitespace-nowrap" style={BOX}>
                {r?.ens || (w.startsWith('0x') ? shortAddr(w) : w)}
                {r && <span className="opacity-50"> · {r.parcels} {r.parcels === 1 ? 'parcel' : 'parcels'}</span>}
                <button type="button" className="ml-2 opacity-50 hover:opacity-100" aria-label={`Remove ${w}`} onClick={() => onRemove(w)}>×</button>
              </span>
            );
          })}
        </div>
      )}

      {suggestions.length > 0 && !full && (
        <div className="mt-3 text-xs flex flex-col gap-1">
          <span className="opacity-60">Linked wallets found — add the ones that are yours:</span>
          {suggestions.map(s => (
            <span key={s.address} className="flex flex-wrap items-center gap-x-2">
              <span>{s.ens || shortAddr(s.address)}</span>
              {s.parcels != null && <span className="opacity-60">{s.parcels} {s.parcels === 1 ? 'parcel' : 'parcels'}</span>}
              <span className="opacity-45">· {s.relations.join('; ')}</span>
              <button type="button" className="btn-primary btn-xs" onClick={() => onAdd([s.address])}>[+ add]</button>
              <button type="button" className="opacity-45 hover:opacity-100" onClick={() => onDismiss(s.address)}>[dismiss]</button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── goals ───────────────────────────────────────────────────────────────────
const LABEL = 'text-xs opacity-50 uppercase tracking-wider';
// The on-chain font that draws blade glyphs, as on the parcel page (ParcelGlyphRows).
const BLADE_FONT = "'MathcastlesRemix-Regular', monospace";

// How many parcels in the chosen modes ([] = every mode) have a value, from the
// catalog's supply (counts by mode); null when the catalog has none.
function supplyCounter(supply, modes) {
  if (!supply) return () => null;
  const idx = modes.length ? modes.map(m => supply.modes.indexOf(m)).filter(i => i >= 0) : supply.modes.map((_, i) => i);
  return (kind, value) => {
    const row = supply[kind]?.[value];
    return row ? idx.reduce((n, i) => n + row[i], 0) : null;
  };
}

function GoalsPanel({ state, catalog, update }) {
  const toggle = id => update({ goals: state.goals.includes(id) ? state.goals.filter(g => g !== id) : [...state.goals, id] });
  const countOf = useMemo(() => supplyCounter(catalog.supply, state.modes), [catalog, state.modes]);
  const sets = catalog.presets.filter(p => p.category === 'sets');
  const traits = catalog.presets.filter(p => p.category !== 'sets');
  const zones = useMemo(() => [...catalog.fields.zone].sort((a, b) => a.localeCompare(b)), [catalog]);
  const menuValues = { zone: zones, biome: catalog.fields.biome, chroma: catalog.fields.chroma || [], level: catalog.fields.level };
  const Check = ({ p }) => (
    <label className="flex items-baseline gap-2 cursor-pointer text-sm" title={p.description}>
      <input type="checkbox" checked={state.goals.includes(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: '#e8e8e8' }} />
      <span>{p.label}</span>
      <span className="text-xs opacity-45">{p.targets}{p.attainability ? ` · ${p.attainability.toLowerCase()}` : ''}</span>
    </label>
  );
  // The presets that can also be picked value by value.
  const pickers = {
    specials: {
      prefix: 'trait:', sections: ['special', 'visual'], columns: 'flex flex-wrap gap-x-4 gap-y-1 mt-0.5',
      items: catalog.fields.trait.map(t => ({ id: t.id, section: t.group, label: <span className="whitespace-nowrap">{t.label}</span> })),
    },
    blades: {
      prefix: 'blade:', columns: 'flex flex-col gap-1 mt-0.5', info: BLADE_INFO,
      items: BLADES.map((blade, i) => ({ id: String(i), title: blade, label: <BladeLabel n={i + 1} blade={blade} count={countOf('blade', i)} /> })),
    },
    glyphs: {
      prefix: 'glyph:', columns: 'grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-0.5', info: GLYPH_INFO,
      items: ORIGIN_SET_COUNTS.map((_, i) => ({ id: String(i), label: <GlyphSetLabel set={i} count={countOf('glyph', i)} /> })),
    },
  };
  return (
    <section>
      <h2 className="text-lg mb-2 opacity-80">[goals]</h2>
      <div className="flex flex-col gap-3 mb-6">
        <ModeScope modes={state.modes} all={catalog.fields.mode} onChange={modes => update({ modes })} />
        {PICK_MENUS.map(menu => (
          <PickMenu
            key={menu.kind} menu={menu} values={menuValues[menu.kind]} state={state} update={update}
            countOf={countOf} scoped={state.modes.length > 0}
          />
        ))}
      </div>
      <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <a href="/traits#sets" className={`${LABEL} mb-1 underline decoration-dotted underline-offset-2 hover:opacity-90 self-start`} title="What each set asks for">sets</a>
          {sets.map(p => <Check key={p.id} p={p} />)}
        </div>
        <div className="flex flex-col gap-1">
          <span className={`${LABEL} mb-1 mt-3 md:mt-0`}>other</span>
          {traits.map(p => (pickers[p.id]
            ? <MultiPicker key={p.id} preset={p} {...pickers[p.id]} state={state} update={update} />
            : <Check key={p.id} p={p} />))}
        </div>
      </div>
    </section>
  );
}

// Which modes count. None picked: every mode. Pick Terrain and the whole setup
// is Terrain only: the parcels held, the listings that fill a gap and the
// supply (evaluate's `modes` in backend/src/collectionHelper.js).
function ModeScope({ modes, all, onChange }) {
  const toggle = m => onChange(modes.includes(m) ? modes.filter(x => x !== m) : all.filter(x => x === m || modes.includes(x)));
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 mb-1 text-xs">
        <span className={LABEL}>mode</span>
        <span className="opacity-45">
          {modes.length ? `only ${modes.join(', ')} parcels count, for every goal below` : 'every mode counts; pick some to keep to them'}
        </span>
        {modes.length > 0 && <button type="button" className="opacity-60 hover:opacity-100" onClick={() => onChange([])}>[any mode]</button>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
        {all.map(m => (
          <FilterChip key={m} label={m} active={modes.includes(m)} owned title={`${m} parcels`} onClick={() => toggle(m)} />
        ))}
      </div>
    </div>
  );
}

// Zones, biomes and levels picked by the handful, as chips like the wallet
// filter's. Each pick is a goal (`zone:Holo`, …) and a kind's picks make one
// group: one parcel in each. A value no parcel in the chosen modes has is
// greyed out; one already picked stays removable.
const PICK_MENUS = [
  { kind: 'zone', label: 'zones', format: v => v, layout: 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6' },
  { kind: 'biome', label: 'biomes', format: v => `B${v}`, layout: 'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10' },
  { kind: 'chroma', label: 'chromas', format: v => v, layout: 'grid grid-cols-2 sm:grid-cols-4' },
  { kind: 'level', label: 'levels', format: v => `L${v}`, layout: 'grid grid-cols-4 sm:grid-cols-7 md:grid-cols-10' },
];
const PICKS_SHOWN = 8; // picked values listed beside a closed menu

function PickMenu({ menu, values, state, update, countOf, scoped }) {
  const [open, setOpen] = useState(false);
  const prefix = `${menu.kind}:`;
  const picked = values.filter(v => state.goals.includes(`${prefix}${v}`));
  const toggle = v => {
    const id = `${prefix}${v}`;
    update({ goals: state.goals.includes(id) ? state.goals.filter(g => g !== id) : [...state.goals, id] });
  };
  const more = picked.length - PICKS_SHOWN;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <button type="button" className="flex items-baseline gap-2" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className={LABEL}>{menu.label}</span>
          <span className="opacity-50">{open ? '[−]' : '[+]'}</span>
        </button>
        {picked.length > 0 ? (
          <>
            <span className="opacity-75">
              {picked.length} picked{!open && `: ${picked.slice(0, PICKS_SHOWN).map(menu.format).join(' · ')}${more > 0 ? ` +${more}` : ''}`}
            </span>
            <button type="button" className="opacity-50 hover:opacity-100" onClick={() => update({ goals: state.goals.filter(g => !g.startsWith(prefix)) })}>
              [clear]
            </button>
          </>
        ) : (
          <span className="opacity-40">pick any: one parcel in each</span>
        )}
      </div>
      {open && (
        <div className={`${menu.layout} gap-1 mt-1`}>
          {values.map(v => {
            const count = countOf(menu.kind, v);
            const on = picked.includes(v);
            const what = `${menu.kind} ${menu.format(v)}`;
            return (
              <FilterChip
                key={String(v)} label={menu.format(v)} count={count ?? 0} active={on} owned={on || count == null || count > 0}
                title={count == null ? what : `${what}: ${count} ${count === 1 ? 'parcel' : 'parcels'}${scoped ? ' in these modes' : ''}`}
                onClick={() => toggle(v)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// A preset that can also be picked value by value: every one (the preset's id)
// or picks written `<prefix><id>`, one goal group either way (buildRubric in
// backend/src/collectionHelper.js). Special traits, blades and glyph sets.
// What blades and origin glyph sets are, for the info icons beside them.
const BLADE_INFO = 'Blades are drawn by the v2 renderer in a parcel\u2019s Daydream and Terraform animations: one of 27 character sets, fixed by its biome and seed. Not visible on Terrain parcels until they are dreamed. Origins and Y-Seeds have none.';
const GLYPH_INFO = 'Origin glyph sets are what an origin parcel (Origin Daydream or Origin Terraform) animates in the v2 renderer: one of 28 sets, fixed by its seed. X-Seed origins animate all 28 at once, so they count as none.';

// A small (i) that shows a short explanation on hover, or on focus/tap. The note
// is out of the layout until shown (display, not visibility: a hidden box still
// widens the page) and spans its picker's column, so it never runs off a phone.
// The nearest positioned ancestor (MultiPicker's outer div) places it.
function InfoTip({ label, children }) {
  return (
    <span className="inline-flex group self-center">
      <button
        type="button"
        aria-label={label}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] leading-none opacity-55 hover:opacity-100 focus-visible:opacity-100"
        style={{ border: '1px solid currentColor', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
      >
        i
      </button>
      <span
        role="tooltip"
        className="hidden group-hover:block group-focus-within:block absolute z-30 left-0 right-0 top-6 max-w-sm p-2 text-xs leading-snug normal-case tracking-normal"
        style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(232,232,232,0.3)' }}
      >
        {children}
      </span>
    </span>
  );
}

function MultiPicker({ preset, prefix, items, sections = null, columns, info = null, state, update }) {
  const all = items.map(t => t.id);
  const chosen = state.goals.includes(preset.id)
    ? new Set(all)
    : new Set(state.goals.filter(g => g.startsWith(prefix)).map(g => g.slice(prefix.length)));
  const some = chosen.size > 0 && chosen.size < all.length;
  const [open, setOpen] = useState(some);
  const choose = ids => {
    const rest = state.goals.filter(g => g !== preset.id && !g.startsWith(prefix));
    const picks = all.filter(id => ids.has(id));
    update({ goals: picks.length === all.length ? [...rest, preset.id] : [...rest, ...picks.map(id => `${prefix}${id}`)] });
  };
  const toggle = id => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    choose(next);
  };
  const list = section => (
    <div className={columns}>
      {items.filter(t => section == null || t.section === section).map(t => (
        <label key={t.id} className="flex items-baseline gap-1.5 cursor-pointer min-w-0" title={t.title}>
          <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} style={{ accentColor: '#e8e8e8' }} />
          {t.label}
        </label>
      ))}
    </div>
  );
  return (
    <div className="text-sm relative">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label className="flex items-baseline gap-2 cursor-pointer" title={preset.description}>
          <input
            type="checkbox"
            checked={chosen.size === all.length}
            ref={el => { if (el) el.indeterminate = some; }}
            onChange={() => choose(chosen.size === all.length ? new Set() : new Set(all))}
            style={{ accentColor: '#e8e8e8' }}
          />
          <span>{preset.label}</span>
        </label>
        {info && <InfoTip label={`What are ${preset.label.toLowerCase()}?`}>{info}</InfoTip>}
        <span className="text-xs opacity-45">{some ? `${chosen.size} of ${all.length}` : all.length}</span>
        <button type="button" className="text-xs opacity-60 hover:opacity-100" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? '[hide ▴]' : '[choose ▾]'}
        </button>
      </div>
      {open && (
        <div className="mt-1 mb-2 ml-6 flex flex-col gap-2 min-w-0">
          {sections ? sections.map(s => (
            <div key={s}>
              <span className="text-xs opacity-45 uppercase tracking-wider">{s}</span>
              {list(s)}
            </div>
          )) : list(null)}
        </div>
      )}
    </div>
  );
}

// A blade as the parcel page draws it: its opening and closing runs in the
// on-chain font, with how many parcels (in the chosen modes) carry it.
function BladeLabel({ n, blade, count }) {
  const [head, tail] = abbreviateGlyphs(blade);
  return (
    <span className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs opacity-60 w-5 shrink-0 text-right">{n}</span>
      <span className="whitespace-pre overflow-hidden text-ellipsis min-w-0" style={{ fontFamily: BLADE_FONT }}>
        {head}
        {tail != null && (
          <>
            <span className="opacity-50" style={{ fontFamily: "'Courier New', Courier, monospace" }}>{' … '}</span>
            {tail}
          </>
        )}
      </span>
      {count != null && <span className="text-xs opacity-45 shrink-0">{count}</span>}
    </span>
  );
}

// An origin glyph set: its ten glyphs (in the system font, as the animation
// paints them) and how many origins (in the chosen modes) animate it.
function GlyphSetLabel({ set, count }) {
  const glyphs = originGlyphSet(set);
  const marksOnly = /^\p{M}+$/u.test(glyphs);
  return (
    <span className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs opacity-60 w-12 shrink-0">set {set}</span>
      <span className="whitespace-pre overflow-hidden min-w-0">
        {marksOnly ? <span className="text-xs opacity-60">near-invisible marks</span> : glyphs}
      </span>
      {count != null && <span className="text-xs opacity-45 shrink-0">{count}</span>}
    </span>
  );
}

// ─── options ─────────────────────────────────────────────────────────────────
function OptionsPanel({ state, update }) {
  return (
    <section>
      <h2 className="text-lg mb-2 opacity-80">[shopping list]</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-2 items-center text-sm">
        <label className="flex items-center gap-2">
          budget (ETH)
          <input type="number" min="0" step="0.1" value={state.budget} onChange={e => update({ budget: e.target.value })} placeholder="any" className="w-24" aria-label="Budget in ETH" />
        </label>
        <label className="flex items-center gap-2">
          max per parcel (ETH)
          <input type="number" min="0" step="0.05" value={state.max} onChange={e => update({ max: e.target.value })} placeholder="any" className="w-24" aria-label="Maximum price per parcel in ETH" />
        </label>
        <select style={SELECT} value={state.prem} onChange={e => update({ prem: e.target.value })} aria-label="Price compared with the model">
          {PREMIUMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
    </section>
  );
}

// ─── results ─────────────────────────────────────────────────────────────────
function Results({ result, loading, modes, children }) {
  const { summary, groups, shoppingList, parcels, wallets, setsCompleted } = result;
  const [copied, setCopied] = useState(false);
  const share = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div className="flex flex-col gap-8" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
      <section className="text-sm">
        <p>
          {parcels} {parcels === 1 ? 'parcel' : 'parcels'} in {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'} ·{' '}
          <strong>{summary.met} of {summary.targets}</strong> goals met · {summary.listedNow} missing{' '}
          {summary.listedNow === 1 ? 'goal is' : 'goals are'} listed right now
          {modes.length > 0 && <span className="opacity-60"> · counting {modes.join(', ')} parcels only</span>}
        </p>
        <p className="text-xs opacity-45 mt-1">
          {!result.listingsAvailable && 'Listings are unavailable right now, so nothing shows as for sale. '}
          <button type="button" className="underline" onClick={share}>{copied ? 'link copied' : 'copy a link to this view'}</button>
          {' '}(it includes your wallet addresses)
        </p>
        <SetsCompleted names={setsCompleted} />
      </section>

      {children}

      <ShoppingList plan={shoppingList} />

      {groups.map(g => <GoalGroup key={g.id} group={g} scoped={modes.length > 0} />)}
    </div>
  );
}

// Every set the group completes between them, whichever goals are picked —
// detectSets' rules, coloured as the wallet page's set chips are.
function SetsCompleted({ names }) {
  if (!names) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
      <span className="opacity-60">{names.length ? 'sets completed:' : 'no sets completed yet'}</span>
      {names.map(n => (
        <span key={n} className="px-1 py-0.5" style={{ color: SET_COLORS[n], border: `1px solid ${SET_COLORS[n]}`, opacity: 0.85 }}>
          {n}
        </span>
      ))}
    </div>
  );
}

// A link's view, not the collector's own setup: nothing here is saved unless
// they keep it.
function SharedViewBanner({ saved, onKeep, onBack }) {
  const btn = 'btn-primary btn-xs ml-2';
  return (
    <section className="text-sm px-3 py-2" style={BOX}>
      You&apos;re looking at a view from a link. Changes here aren&apos;t saved, and your own setup
      {saved?.wishlist ? ' and wishlist stay' : ' stays'} as {saved?.wishlist ? 'they are' : 'it is'}.
      <span className="inline-flex flex-wrap gap-y-1">
        <button type="button" className={btn} onClick={onKeep}>[keep this view as mine]</button>
        <button type="button" className={btn} onClick={onBack}>[back to my setup]</button>
      </span>
    </section>
  );
}

// The wishlist switch. Turning it on needs a wallet in the group connected, so a
// wishlist is only ever made by its collector; after that it follows their
// edits here, and the listings page marks every listing that fills one of
// these gaps while a wallet in the group is connected.
function WishlistPanel({ result, connected, on, onConnect, onAdd, onSwitch, price, onPrice }) {
  const member = !!connected && result.wallets.some(w => w.address.toLowerCase() === connected.toLowerCase());
  const btn = 'btn-primary btn-xs ml-2';
  let body;
  let note = null;
  if (on) {
    body = (
      <>
        <span style={{ color: WISHLIST_COLOR }}>★ wishlist on</span> — every listing that fills one of these gaps is
        marked on the listings page while a wallet in this group is connected. Changes you make here update it.
        <a href="/listings" className="btn-primary btn-xs ml-2 no-underline" style={{ color: WISHLIST_COLOR, borderColor: WISHLIST_COLOR }}>
          [see marked listings →]
        </a>
        <button type="button" className="opacity-50 hover:opacity-100 text-xs ml-2" onClick={() => onSwitch(false)}>[turn off]</button>
      </>
    );
    // On, but nothing will be marked: the group has changed under it (a wallet
    // removed, someone else's view kept), or no wallet is connected here.
    if (!connected) {
      note = (
        <>
          Connect a wallet in this group to see the marks.
          <button type="button" className={btn} onClick={onConnect}>[connect wallet]</button>
        </>
      );
    } else if (!member) {
      note = (
        <>
          The connected wallet ({shortAddr(connected)}) isn&apos;t in this group, so the listings page won&apos;t mark
          anything until it is.
          <button type="button" className={btn} onClick={() => onAdd([connected])}>[+ add it]</button>
        </>
      );
    }
  } else if (!connected) {
    body = (
      <>
        Connect your wallet to turn on the wishlist: every listing that fills one of these gaps then gets marked on
        the listings page.
        <button type="button" className={btn} onClick={onConnect}>[connect wallet]</button>
      </>
    );
  } else if (!member) {
    body = (
      <>
        The connected wallet ({shortAddr(connected)}) isn&apos;t in this group. Add it to turn on the wishlist.
        <button type="button" className={btn} onClick={() => onAdd([connected])}>[+ add it]</button>
      </>
    );
  } else {
    body = (
      <>
        Turn on the wishlist and every listing that fills one of these gaps gets marked on the listings page while
        a wallet in this group is connected. It follows your changes here, and is kept in this browser only.
        <button type="button" className={btn} onClick={() => onSwitch(true)}>[turn on wishlist]</button>
      </>
    );
  }
  return (
    <section>
      <h2 className="text-lg mb-1 opacity-80">[wishlist]</h2>
      <p className="text-sm opacity-80">{body}</p>
      {note && <p className="text-sm mt-2" style={{ color: '#e8b86c' }}>{note}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="opacity-80">mark listings priced</span>
          <select style={SELECT} value={price} onChange={e => onPrice(e.target.value)} aria-label="Wishlist price against the model">
            {WISH_PRICES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        {result.wishlistCount != null && (
          <span className="text-xs opacity-60">
            {result.wishlistCount} {result.wishlistCount === 1 ? 'listing fills' : 'listings fill'} a gap at that price right now
          </span>
        )}
      </div>
    </section>
  );
}

function ShoppingList({ plan }) {
  if (!plan) return null;
  return (
    <section>
      <h2 className="text-lg mb-1 opacity-80">[cheapest way to fill the gaps]</h2>
      {plan.picks.length === 0 ? (
        <p className="text-sm opacity-60">
          Nothing listed right now fills a missing goal within these limits.
          {plan.unfilledOverBudget > 0 && ` ${plan.unfilledOverBudget} missing ${plan.unfilledOverBudget === 1 ? 'goal is' : 'goals are'} listed but over your budget or price limits.`}
        </p>
      ) : (
        <>
          <p className="text-sm opacity-70 mb-3">
            {plan.picks.length} {plan.picks.length === 1 ? 'parcel fills' : 'parcels fill'} {plan.filled} missing{' '}
            {plan.filled === 1 ? 'goal' : 'goals'} for {fmtEth(plan.total)} ETH.
            {plan.unfilledOverBudget > 0 && ` ${plan.unfilledOverBudget} more ${plan.unfilledOverBudget === 1 ? 'is' : 'are'} listed above your limits;`}
            {plan.unfilledNoListing > 0 && ` ${plan.unfilledNoListing} ${plan.unfilledNoListing === 1 ? 'has' : 'have'} nothing listed.`}
          </p>
          <div className="flex flex-col gap-2">
            {plan.picks.map(p => {
              const vm = vsModel(p.price, p.model);
              return (
                <div key={p.tokenId} className="flex gap-3 items-center text-sm">
                  <a href={`/?token=${p.tokenId}`} className="shrink-0">
                    <img src={parcelImage(p.tokenId)} alt={`Parcel ${p.tokenId}`} width={38} height={55} loading="lazy" style={{ width: 38, height: 55 }} />
                  </a>
                  <div className="flex flex-col min-w-0">
                    <span className="flex flex-wrap gap-x-3 items-baseline">
                      <a href={`/?token=${p.tokenId}`}>#{p.tokenId}</a>
                      <span>{fmtEth(p.price)} ETH</span>
                      {vm && <span className="text-xs" style={{ color: vm.color }}>{vm.text}</span>}
                      <a href={opensea(p.tokenId)} target="_blank" rel="noopener noreferrer" className="text-xs opacity-60">[opensea ↗]</a>
                    </span>
                    <span className="text-xs opacity-60 truncate">fills: {p.fillsLabels.join(', ')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function GoalGroup({ group, scoped }) {
  const [showMet, setShowMet] = useState(false);
  const missing = group.targets.filter(t => !t.met);
  const listed = missing.filter(t => t.listed > 0).sort((a, b) => a.cheapest[0].price - b.cheapest[0].price);
  const unlisted = missing.filter(t => t.listed === 0).sort((a, b) => a.supply - b.supply);
  const met = group.targets.filter(t => t.met);
  const pct = group.total ? Math.round((group.met / group.total) * 100) : 0;
  const done = group.total > 0 && group.met === group.total;
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 mb-1">
        <h2 className="text-lg opacity-90">[{group.label}]</h2>
        <span className="text-sm">{group.met}/{group.total}{done ? ' · complete ✓' : ''}</span>
        {group.attainability && <span className="text-xs opacity-45">{group.attainability.toLowerCase()}{group.bottleneck ? ` · bottleneck ${group.bottleneck}` : ''}</span>}
      </div>
      <div className="h-1 mb-3" style={{ background: 'rgba(232,232,232,0.1)' }}>
        <div className="h-1" style={{ width: `${pct}%`, background: done ? '#4ade80' : 'rgba(232,232,232,0.6)' }} />
      </div>

      {listed.length > 0 && (
        <div className="mb-3">
          <span className="text-xs opacity-50 uppercase tracking-wider">missing · listed now</span>
          <div className="flex flex-col gap-1 mt-1 text-sm">
            {listed.map(t => {
              const c = t.cheapest[0];
              const vm = vsModel(c.price, c.model);
              return (
                <span key={t.id} className="flex flex-wrap gap-x-2 items-baseline">
                  <span>{t.label}</span>
                  <span className="opacity-60">·</span>
                  <a href={`/?token=${c.tokenId}`}>#{c.tokenId}</a>
                  <span>{fmtEth(c.price)} ETH</span>
                  {vm && <span className="text-xs" style={{ color: vm.color }}>{vm.text}</span>}
                  <span className="text-xs opacity-45">{t.listed} listed of {t.supply}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {unlisted.length > 0 && (
        <p className="text-sm mb-3">
          <span className="text-xs opacity-50 uppercase tracking-wider">missing · nothing listed</span>
          <br />
          <span className="opacity-80">
            {unlisted.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ', '}
                {t.label} <span className="opacity-45 text-xs">({t.supply})</span>
              </span>
            ))}
          </span>
        </p>
      )}

      {met.length > 0 && (
        <div className="text-sm">
          <button type="button" className="text-xs opacity-50 hover:opacity-100 uppercase tracking-wider" onClick={() => setShowMet(v => !v)}>
            met · {met.length} {showMet ? '▴' : '▾'}
          </button>
          {showMet && (
            <p className="mt-1 opacity-80">
              {met.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ', '}
                  {t.label}{' '}
                  <span className="text-xs opacity-60">
                    {t.owned.slice(0, 3).map(id => <a key={id} href={`/?token=${id}`} className="mr-1">#{id}</a>)}
                    {t.ownedCount > 3 && `+${t.ownedCount - 3}`}
                  </span>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
      {group.nonexistent > 0 && (
        <p className="text-xs opacity-40 mt-1">
          {group.nonexistent} left out: no parcel{scoped ? ' in the chosen modes' : ''} has {group.nonexistent === 1 ? 'it' : 'them'}.
        </p>
      )}
    </section>
  );
}
