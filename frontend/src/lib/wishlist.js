// The collection helper's saved setup, and the wishlist built on it.
//
// /helper saves a collector's setup (wallets, goals, shopping-list limits) in
// this browser as they edit it. A /helper link carrying someone else's view
// opens as a "shared view" that is never saved unless they choose to keep it,
// so opening a link can't change their setup (see HelperView).
//
// The wishlist is that same setup with `wishlist: true`. It is turned on from
// the helper with a wallet in the group connected, and edits there update it.
// The listings page then marks every listing that fills one of its gaps, asking
// /collection (view=wishlist) as the helper itself does — the server stores
// nothing — and only while a wallet in the group is connected, so a shared
// computer doesn't show one collector's wishlist to the next person.

import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/components/shared';

const KEY = 'helper:v1';

// Pink: not a colour the listings page already uses for a trait, a tier or the
// price-vs-model badge.
export const WISHLIST_COLOR = '#f472b6';
export const WISHLIST_TINT = 'rgba(244,114,182,0.08)';

// ─── storage ─────────────────────────────────────────────────────────────────
export function readHelper() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.wallets) && Array.isArray(s.goals) && Array.isArray(s.custom)) return s;
  } catch { /* storage unavailable, or not ours */ }
  return null;
}

export function writeHelper(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** The saved setup when its wishlist is on, else null. */
export function readWishlist() {
  const s = readHelper();
  return s && s.wishlist && s.wallets.length ? s : null;
}

const isAddress = v => /^0x[0-9a-fA-F]{40}$/.test(v);

/** Whether `address` is one of the setup's wallets — entered as an address, or resolved from a name. */
export function inGroup(s, address) {
  if (!s || !address) return false;
  const a = address.toLowerCase();
  return [...(s.addresses || []), ...s.wallets.filter(isAddress)].some(x => x.toLowerCase() === a);
}

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

  const member = inGroup(saved, connected);

  const pick = useCallback((w, accounts) => {
    const list = accounts || [];
    setConnected(list.find(a => inGroup(w, a)) || list[0] || null);
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
