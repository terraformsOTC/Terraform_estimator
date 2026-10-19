'use client';

// /helper — the collection helper.
//
// A collector adds their wallets (or connects one; linked vaults and Safes are
// suggested), picks goals, and sees for each goal what they hold, what is
// missing, what is listed that fills it, and a shopping list: the cheapest
// current listings that fill the most missing goals within a budget.
//
// State lives in the URL (so a view can be shared) and in localStorage (so it is
// there next visit). The backend does all the work in one call; see
// backend/src/collectionHelper.js for how goals, coverage and the list work.
//
// With a wallet in the group connected, the goals can be saved as a wishlist,
// and the listings page then marks every listing that fills one (lib/wishlist.js).

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from '@/components/Header';
import { API_URL, Footer, shortAddr, vsModelColor, parcelImage } from '@/components/shared';
import { SET_COLORS } from '@/lib/setsGlossary';
import {
  toB64url, fromB64url, authorizedAccounts,
  readWishlist, saveWishlist, clearWishlist, sameWishlist, WISHLIST_COLOR,
} from '@/lib/wishlist';

const STORAGE_KEY = 'collect:v1'; // from when the page was /collect; kept so saved state survives
const DEFAULT_GOALS = ['set:full-zone', 'set:full-biome', 'chroma', 'mode', 'specials'];
const MAX_WALLETS = 10;
const TF = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const BOX = { border: '1px solid rgba(232,232,232,0.15)' };
const SELECT = {
  background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(232,232,232,0.3)',
  fontFamily: "'Courier New', Courier, monospace", fontSize: '14px', padding: '3px 6px',
};
const PREMIUMS = [
  { value: '', label: 'any price vs model' },
  { value: '0', label: 'at or below model' },
  { value: '10', label: 'up to 10% over model' },
  { value: '25', label: 'up to 25% over model' },
  { value: '50', label: 'up to 50% over model' },
];
const FIELD_LABELS = { zone: 'zone', biome: 'biome', level: 'level', chroma: 'chroma', mode: 'mode', trait: 'special trait' };

// ─── state ───────────────────────────────────────────────────────────────────
function readInitialState() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('w') || q.get('g') || q.get('c')) {
    let custom = [];
    try { custom = q.get('c') ? fromB64url(q.get('c')) : []; } catch { custom = []; }
    return {
      wallets: (q.get('w') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_WALLETS),
      goals: q.get('g') ? q.get('g').split(',').filter(Boolean) : DEFAULT_GOALS,
      custom: Array.isArray(custom) ? custom : [],
      budget: q.get('b') || '', max: q.get('m') || '', prem: q.get('p') || '',
    };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.wallets)) return { ...emptyState(), ...saved };
  } catch { /* storage unavailable */ }
  return emptyState();
}
const emptyState = () => ({ wallets: [], goals: DEFAULT_GOALS, custom: [], budget: '', max: '', prem: '' });

function stateQuery(s, { forApi = false } = {}) {
  const q = new URLSearchParams();
  if (s.wallets.length) q.set(forApi ? 'wallets' : 'w', s.wallets.join(','));
  if (s.goals.length) q.set(forApi ? 'goals' : 'g', s.goals.join(','));
  if (s.custom.length) q.set(forApi ? 'custom' : 'c', toB64url(s.custom));
  if (s.budget !== '') q.set(forApi ? 'budget' : 'b', s.budget);
  if (s.max !== '') q.set(forApi ? 'max' : 'm', s.max);
  if (s.prem !== '') q.set(forApi ? 'prem' : 'p', s.prem);
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
function customLabel(spec) {
  const where = Object.entries(spec.where || {}).map(([f, v]) => (f === 'biome' ? `biome ${v}` : f === 'level' ? `L${v}` : String(v))).join(' · ');
  return spec.each ? `every ${FIELD_LABELS[spec.each]}${where ? ` · ${where}` : ''}` : `a parcel: ${where}`;
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
  const [wishlist, setWishlist] = useState(null);  // the saved snapshot (lib/wishlist.js)
  const abortRef = useRef(null);

  useEffect(() => {
    setState(readInitialState());
    setWishlist(readWishlist());
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

  // Persist and mirror into the URL.
  useEffect(() => {
    if (!state) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
    const qs = stateQuery(state);
    window.history.replaceState(null, '', qs ? `/helper?${qs}` : '/helper');
  }, [state]);

  // Evaluate, debounced, cancelling any request still in flight.
  useEffect(() => {
    if (!state) return undefined;
    if (state.wallets.length === 0 || (state.goals.length === 0 && state.custom.length === 0)) {
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
            <Results result={result} loading={loading}>
              <WishlistPanel
                state={state} result={result} loading={loading} connected={connected} saved={wishlist}
                onConnect={connect} onAdd={addWallets}
                onSave={() => {
                  const w = saveWishlist({ wallets: result.wallets.map(x => x.address), goals: state.goals, custom: state.custom });
                  if (w) setWishlist(w);
                  else setError('This browser is not letting the site save anything, so the wishlist could not be saved.');
                }}
                onClear={() => { clearWishlist(); setWishlist(null); }}
              />
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
function GoalsPanel({ state, catalog, update }) {
  const toggle = id => update({ goals: state.goals.includes(id) ? state.goals.filter(g => g !== id) : [...state.goals, id] });
  const sets = catalog.presets.filter(p => p.category === 'sets');
  const traits = catalog.presets.filter(p => p.category !== 'sets');
  const Check = ({ p }) => (
    <label className="flex items-baseline gap-2 cursor-pointer text-sm" title={p.description}>
      <input type="checkbox" checked={state.goals.includes(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: '#e8e8e8' }} />
      <span>{p.label}</span>
      <span className="text-xs opacity-45">{p.targets}{p.attainability ? ` · ${p.attainability.toLowerCase()}` : ''}</span>
    </label>
  );
  return (
    <section>
      <h2 className="text-lg mb-2 opacity-80">[goals]</h2>
      <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs opacity-50 uppercase tracking-wider mb-1">sets</span>
          {sets.map(p => <Check key={p.id} p={p} />)}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs opacity-50 uppercase tracking-wider mb-1 mt-3 md:mt-0">traits</span>
          {traits.map(p => <Check key={p.id} p={p} />)}
          <span className="text-xs opacity-50 uppercase tracking-wider mb-1 mt-4">your own goals</span>
          {state.custom.map((spec, i) => (
            <span key={i} className="text-sm flex items-baseline gap-2">
              <span>{customLabel(spec)}</span>
              <button type="button" className="opacity-50 hover:opacity-100 text-xs" onClick={() => update({ custom: state.custom.filter((_, j) => j !== i) })}>[remove]</button>
            </span>
          ))}
          {state.custom.length < catalog.limits.customGoals && (
            <CustomGoalBuilder fields={catalog.fields} onAdd={spec => update({ custom: [...state.custom, spec] })} />
          )}
        </div>
      </div>
    </section>
  );
}

function valuesFor(fields, field) {
  if (field === 'trait') return fields.trait.map(t => ({ value: t.id, label: t.label }));
  return (fields[field] || []).map(v => ({ value: v, label: field === 'biome' ? `biome ${v}` : field === 'level' ? `level ${v}` : String(v) }));
}

function CustomGoalBuilder({ fields, onAdd }) {
  const [kind, setKind] = useState('each');          // 'each' | 'one'
  const [each, setEach] = useState('biome');
  const [conds, setConds] = useState([{ field: 'chroma', value: 'Pulse' }]);
  const fieldNames = Object.keys(FIELD_LABELS);
  const setCond = (i, patch) => setConds(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const usable = conds.filter(c => c.field && c.value !== '' && c.value != null && !(kind === 'each' && c.field === each));
  const add = () => {
    const where = Object.fromEntries(usable.map(c => [c.field, c.value]));
    if (kind === 'one' && usable.length === 0) return;
    onAdd(kind === 'each' ? (usable.length ? { each, where } : { each }) : { where });
  };
  return (
    <div className="flex flex-col gap-2 text-sm mt-1 p-2" style={BOX}>
      <div className="flex flex-wrap items-center gap-2">
        <select style={SELECT} value={kind} onChange={e => setKind(e.target.value)} aria-label="Goal type">
          <option value="each">one of every</option>
          <option value="one">a parcel with</option>
        </select>
        {kind === 'each' && (
          <select style={SELECT} value={each} onChange={e => setEach(e.target.value)} aria-label="Collect one of every">
            {fieldNames.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
          </select>
        )}
      </div>
      {conds.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="opacity-60">{kind === 'each' ? (i === 0 ? 'where' : 'and') : (i === 0 ? '' : 'and')}</span>
          <select style={SELECT} value={c.field} onChange={e => setCond(i, { field: e.target.value, value: valuesFor(fields, e.target.value)[0]?.value ?? '' })} aria-label="Condition field">
            {fieldNames.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
          </select>
          <select
            style={SELECT}
            value={String(c.value)}
            onChange={e => {
              const opt = valuesFor(fields, c.field).find(o => String(o.value) === e.target.value);
              setCond(i, { value: opt ? opt.value : e.target.value });
            }}
            aria-label="Condition value"
          >
            {valuesFor(fields, c.field).map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
          <button type="button" className="opacity-50 hover:opacity-100 text-xs" onClick={() => setConds(cs => cs.filter((_, j) => j !== i))}>[×]</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {conds.length < 3 && (
          <button type="button" className="btn-primary btn-xs" onClick={() => setConds(cs => [...cs, { field: 'zone', value: fields.zone[0] }])}>[+ condition]</button>
        )}
        <button type="button" className="btn-primary btn-xs" onClick={add} disabled={kind === 'one' && usable.length === 0}>[add goal]</button>
      </div>
    </div>
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
function Results({ result, loading, children }) {
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

      {groups.map(g => <GoalGroup key={g.id} group={g} />)}
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

// Save the goals as a wishlist: the listings page then marks every listing that
// fills one, while a wallet in this group is connected. Saving needs that
// wallet connected here too, so a wishlist is only ever made by its collector.
function WishlistPanel({ state, result, loading, connected, saved, onConnect, onAdd, onSave, onClear }) {
  const wallets = result.wallets.map(w => w.address);
  const current = { wallets, goals: state.goals, custom: state.custom };
  const same = sameWishlist(saved, current);
  const member = !!connected && wallets.some(a => a.toLowerCase() === connected.toLowerCase());
  const btn = 'btn-primary btn-xs ml-2';
  const remove = <button type="button" className="opacity-50 hover:opacity-100 text-xs ml-2" onClick={onClear}>[remove]</button>;

  let body;
  if (same) {
    body = (
      <>
        <span style={{ color: WISHLIST_COLOR }}>★ saved as your wishlist</span> — every listing that fills one of
        these gaps is marked on the <a href="/listings">listings page</a> while a wallet in this group is connected.
        {remove}
      </>
    );
  } else if (!connected) {
    body = (
      <>
        {saved ? 'Your saved wishlist has different wallets or goals. ' : ''}
        Connect your wallet to save these goals as your wishlist, and every listing that fills one of these gaps is
        marked on the listings page.
        <button type="button" className={btn} onClick={onConnect}>[connect wallet]</button>
        {saved && remove}
      </>
    );
  } else if (!member) {
    body = (
      <>
        The connected wallet ({shortAddr(connected)}) isn&apos;t in this group. Add it to save these goals as your wishlist.
        <button type="button" className={btn} onClick={() => onAdd([connected])}>[+ add it]</button>
        {saved && remove}
      </>
    );
  } else {
    body = (
      <>
        {saved
          ? 'Your saved wishlist has different wallets or goals from these.'
          : 'Save these goals as your wishlist: every listing that fills one of these gaps gets marked on the listings page while a wallet in this group is connected. It is kept in this browser only.'}
        <button type="button" className={btn} onClick={onSave} disabled={loading}>
          {saved ? '[save these instead]' : '[save wishlist]'}
        </button>
        {saved && remove}
      </>
    );
  }
  return (
    <section>
      <h2 className="text-lg mb-1 opacity-80">[wishlist]</h2>
      <p className="text-sm opacity-80">{body}</p>
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

function GoalGroup({ group }) {
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
        <p className="text-xs opacity-40 mt-1">{group.nonexistent} combinations don't exist on any parcel and are left out.</p>
      )}
    </section>
  );
}
