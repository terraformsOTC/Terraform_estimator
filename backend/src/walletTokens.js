// walletTokens.js — which parcels a group of wallets holds, for GET /wallet.
//
// Enumerating a wallet on-chain costs one RPC call per parcel (balanceOf, then
// tokenOfOwnerByIndex for each index): up to ~1,000 calls for one request. The
// owner index (ownerIndex.js) already knows who holds every parcel, so a wallet
// is read from it whenever the index agrees with the chain on how many parcels
// the wallet holds: one balanceOf per wallet instead of one call per parcel.
// When it disagrees (a transfer in the last minute, before the poller moved it)
// or isn't loaded yet, that wallet is enumerated on-chain exactly as before.

const ENUM_BATCH_SIZE = 20;
const ENUM_BUDGET_MS = 30_000;

/**
 * @param {Array<{address: string}>} wallets deduplicated; each gets totalParcels,
 *   fetchCount and source ('index' | 'chain') set on it
 * @param {object} deps
 * @param {object} deps.ownerIndex OwnerIndex
 * @param {object} deps.contract Terraforms contract (balanceOf, tokenOfOwnerByIndex)
 * @param {Function} deps.withTimeout
 * @param {number} deps.maxPerWallet
 * @param {number} deps.maxTotal
 * @param {object} [deps.log]
 * @returns {Promise<{tokenIds: number[], holderOf: Map<number, string>}>}
 */
async function walletTokenIds(wallets, { ownerIndex, contract, withTimeout, maxPerWallet, maxTotal, log = console }) {
  const balances = await Promise.all(wallets.map(w => withTimeout(contract.balanceOf(w.address))));
  let budget = maxTotal;
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    w.totalParcels = Number(balances[i]);
    w.fetchCount = Math.min(w.totalParcels, maxPerWallet, budget);
    budget -= w.fetchCount;
    if (w.fetchCount < w.totalParcels) {
      log.warn(`[wallet] ${w.address}: balance=${w.totalParcels} exceeds cap, clamping to ${w.fetchCount}`);
    }
  }

  const tokenIds = [];
  const holderOf = new Map(); // tokenId -> the wallet holding it
  const add = (id, address) => {
    if (holderOf.has(id)) return;
    holderOf.set(id, address);
    tokenIds.push(id);
  };

  const indexReady = ownerIndex?.ready?.() === true;
  const enumStart = Date.now();
  for (const w of wallets) {
    if (w.fetchCount === 0) { w.source = indexReady ? 'index' : 'chain'; continue; }
    if (indexReady && ownerIndex.countOf(w.address) === w.totalParcels) {
      w.source = 'index';
      for (const id of ownerIndex.tokensOf([w.address]).slice(0, w.fetchCount)) add(id, w.address);
      continue;
    }
    if (indexReady) {
      log.warn(`[wallet] ${w.address}: owner index has ${ownerIndex.countOf(w.address)}, chain says ${w.totalParcels}; enumerating on-chain`);
    }
    w.source = 'chain';
    // Batched so public RPCs (which silently drop calls beyond ~20-50 at once)
    // don't corrupt the list; the walltime budget spans every wallet.
    for (let i = 0; i < w.fetchCount; i += ENUM_BATCH_SIZE) {
      if (Date.now() - enumStart > ENUM_BUDGET_MS) throw new Error('Wallet enumeration timed out');
      const end = Math.min(i + ENUM_BATCH_SIZE, w.fetchCount);
      const batch = await Promise.all(
        Array.from({ length: end - i }, (_, k) => withTimeout(contract.tokenOfOwnerByIndex(w.address, i + k))),
      );
      for (const id of batch) add(Number(id), w.address);
    }
  }
  return { tokenIds, holderOf };
}

module.exports = { walletTokenIds };
