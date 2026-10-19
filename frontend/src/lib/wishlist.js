// The collection helper's wishlist: goals a collector saved on /helper, so the
// listings page can mark every listing that fills one of their gaps.
//
// It is kept in this browser's localStorage and nowhere else. The listings page
// sends the saved wallets and goals to /collection (view=wishlist), as the
// helper itself does, and the server stores nothing.
//
// It is a snapshot taken when the collector presses save, not the helper's live
// state: opening someone else's shared /helper link rewrites the live state, and
// that must not quietly change what the listings page marks. It shows only while
// a wallet in the saved group is connected, so a shared computer doesn't show
// one collector's wishlist to the next person.

import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/components/shared';

const KEY = 'helper:wishlist:v1';

// Pink: not a colour the listings page already uses for a trait, a tier or the
// price-vs-model badge.
export const WISHLIST_COLOR = '#f472b6';
export const WISHLIST_TINT = 'rgba(244,114,182,0.08)';

// ─── storage ─────────────────────────────────────────────────────────────────
export function readWishlist() {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (w && Array.isArray(w.wallets) && w.wallets.length && Array.isArray(w.goals) && Array.isArray(w.custom)) return w;
  } catch { /* storage unavailable, or not ours */ }
  return null;
}

/** Save resolved wallet addresses + goals. Returns what was saved, or null if storage is unavailable. */
export function saveWishlist({ wallets, goals, custom }) {
  const w = { v: 1, wallets, goals, custom, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
    return w;
  } catch {
    return null;
  }
}

export function clearWishlist() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

const norm = w => JSON.stringify([
  [...w.wallets].map(a => a.toLowerCase()).sort(),
  [...w.goals].sort(),
  w.custom,
]);
export const sameWishlist = (a, b) => !!a && !!b && norm(a) === norm(b);

export const inWishlist = (w, address) =>
  !!w && !!address && w.wallets.some(a => a.toLowerCase() === address.toLowerCase());

// ─── encoding (the /collection API's for custom goals) ───────────────────────
export function toB64url(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}

// ─── wallet ──────────────────────────────────────────────────────────────────
/** Accounts the site may already read: no prompt (EIP-1193 eth_accounts). */
export async function authorizedAccounts() {
  if (typeof window === 'undefined' || !window.ethereum?.request) return [];
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

/** One fill as a reader sees it: "Biome 12 (Full biome)". */
export function fillText(f) {
  const groups = f.groups.filter(g => g !== f.label);
  return groups.length ? `${f.label} (${groups.join(', ')})` : f.label;
}

/**
 * The listings page's side. Nothing happens unless a wishlist is saved here;
 * then it checks, without prompting, whether a wallet in the saved group is
 * connected, and if so asks /collection which listings fill a gap.
 *
 * status: 'off' (none saved) | 'disconnected' | 'other-wallet' | 'loading' | 'on' | 'error'
 * marks:  Map tokenId -> [{ id, label, groups }] while 'on'
 */
export function useWishlistMarks() {
  const [saved, setSaved] = useState(null);
  const [connected, setConnected] = useState(null);
  const [status, setStatus] = useState('off');
  const [marks, setMarks] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [checked, setChecked] = useState(false); // the silent wallet check has answered

  const member = inWishlist(saved, connected);

  const pick = useCallback((w, accounts) => {
    const list = accounts || [];
    setConnected(list.find(a => inWishlist(w, a)) || list[0] || null);
  }, []);

  useEffect(() => {
    const w = readWishlist();
    setSaved(w);
    if (!w) return undefined;
    let live = true;
    authorizedAccounts().then(accounts => {
      if (!live) return;
      pick(w, accounts);
      setChecked(true);
    });
    const onChange = accounts => pick(w, accounts);
    window.ethereum?.on?.('accountsChanged', onChange);
    return () => {
      live = false;
      window.ethereum?.removeListener?.('accountsChanged', onChange);
    };
  }, [pick]);

  useEffect(() => {
    if (!saved) { setStatus('off'); return undefined; }
    if (!checked) { setStatus('loading'); return undefined; }
    if (!member) {
      setMarks(null);
      setStatus(connected ? 'other-wallet' : 'disconnected');
      return undefined;
    }
    const ctrl = new AbortController();
    setStatus('loading');
    const q = new URLSearchParams({ wallets: saved.wallets.join(','), view: 'wishlist' });
    if (saved.goals.length) q.set('goals', saved.goals.join(','));
    if (saved.custom.length) q.set('custom', toB64url(saved.custom));
    fetch(`${API_URL}/collection?${q}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `request failed (${r.status})`);
        return j;
      })
      .then(j => {
        setMarks(new Map((j.wishlist || []).map(x => [x.tokenId, x.fills])));
        setStatus('on');
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setStatus('error');
      });
    return () => ctrl.abort();
  }, [saved, checked, member, connected, reload]);

  const connect = useCallback(async () => {
    if (!window.ethereum?.request) {
      setError('No browser wallet found.');
      setStatus('error');
      return;
    }
    try {
      pick(saved, await window.ethereum.request({ method: 'eth_requestAccounts' }));
    } catch (err) {
      if (err?.code !== 4001) { setError('The wallet did not connect.'); setStatus('error'); }
    }
  }, [saved, pick]);

  // Local only, like the rest of the site's [disconnect]: the marks go until the
  // next visit, when the wallet extension still reports the site as connected.
  const disconnect = useCallback(() => setConnected(null), []);
  const refresh = useCallback(() => setReload(n => n + 1), []);

  return { saved, connected, status, marks, error, connect, disconnect, refresh };
}
