// ownerIndex.js — who holds every parcel, in memory.
//
// Seeded from one Alchemy getOwnersForContract call (every owner and their token
// ids, the same call /collectors makes), refreshed periodically, and moved on
// each Transfer the parcel event poller sees, so a sale shows up within about a
// minute. Looking up a group of wallets then costs nothing, where enumerating
// them on-chain (balanceOf + tokenOfOwnerByIndex) costs one RPC call per parcel.
//
// Alchemy's ownership index can trail the chain by a block or two, so a refresh
// replays the transfers seen shortly before it was requested rather than letting
// a slightly stale snapshot undo them.

const REPLAY_MS = 10 * 60 * 1000;
const RECENT_MAX = 2000;

class OwnerIndex {
  constructor() {
    this.byToken = new Map(); // tokenId -> lowercased owner
    this.byOwner = new Map(); // lowercased owner -> Set(tokenId)
    this.loadedAt = null;
    this.recent = [];         // [{ tokenId, to, at }] transfers seen by the poller
  }

  ready() {
    return this.loadedAt != null;
  }

  /**
   * @param {Array<{ownerAddress: string, tokenBalances?: Array<{tokenId: string}>}>} owners
   * @param {number} requestedAt when the snapshot was requested (ms)
   */
  load(owners, requestedAt = Date.now()) {
    const byToken = new Map();
    const byOwner = new Map();
    for (const o of owners || []) {
      if (!o?.ownerAddress) continue;
      const owner = o.ownerAddress.toLowerCase();
      for (const b of o.tokenBalances || []) {
        const id = Number(b.tokenId);
        if (!Number.isInteger(id) || id < 1) continue;
        byToken.set(id, owner);
        if (!byOwner.has(owner)) byOwner.set(owner, new Set());
        byOwner.get(owner).add(id);
      }
    }
    this.byToken = byToken;
    this.byOwner = byOwner;
    this.loadedAt = Date.now();
    const cutoff = requestedAt - REPLAY_MS;
    this.recent = this.recent.filter(t => t.at >= cutoff);
    for (const t of this.recent) this.move(t.tokenId, t.to);
  }

  applyTransfer(tokenId, to, at = Date.now()) {
    const id = Number(tokenId);
    if (!Number.isInteger(id) || !to) return;
    this.recent.push({ tokenId: id, to: to.toLowerCase(), at });
    if (this.recent.length > RECENT_MAX) this.recent.splice(0, this.recent.length - RECENT_MAX);
    this.move(id, to);
  }

  move(tokenId, to) {
    const owner = to.toLowerCase();
    const prev = this.byToken.get(tokenId);
    if (prev === owner) return;
    if (prev) {
      const set = this.byOwner.get(prev);
      set?.delete(tokenId);
      if (set && set.size === 0) this.byOwner.delete(prev);
    }
    this.byToken.set(tokenId, owner);
    if (!this.byOwner.has(owner)) this.byOwner.set(owner, new Set());
    this.byOwner.get(owner).add(tokenId);
  }

  ownerOf(tokenId) {
    return this.byToken.get(Number(tokenId)) || null;
  }

  countOf(address) {
    return this.byOwner.get(String(address).toLowerCase())?.size || 0;
  }

  /** Every parcel held by any of these addresses, ascending. */
  tokensOf(addresses) {
    const out = new Set();
    for (const a of addresses) for (const id of this.byOwner.get(String(a).toLowerCase()) || []) out.add(id);
    return [...out].sort((a, b) => a - b);
  }
}

module.exports = { OwnerIndex, REPLAY_MS };
