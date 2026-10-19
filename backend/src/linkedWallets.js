// linkedWallets.js — wallets probably belonging to the same collector, offered
// as suggestions on the collection helper. Nothing here proves ownership, and
// anyone can delegate to anyone, so the page lists these for the collector to
// tick rather than adding them itself.
//
// Sources (measured 2026-10-19 on the top Terraforms holders):
//   - delegate.xyz, BOTH registries: 5 of the top 50 delegate through the
//     original v1 registry and 1 through v2, so v2 alone would miss most.
//     Counted: delegate-all, and contract- or token-level delegations scoped
//     to Terraforms. Both directions — a vault that delegated to this wallet,
//     and a hot wallet this one delegated to.
//   - Safes: 9 of the top 100 holders are Safes (one holds 123 parcels). For a
//     wallet, the Safes it co-owns (Safe's transaction service, no key needed);
//     for a Safe, its owners (getOwners on chain).

const { ethers } = require('ethers');

const DELEGATE_V1 = '0x00000000000076A84feF008CDAbe6409d2FE638B';
const DELEGATE_V2 = '0x00000000000000447e69651d841bD8D104Bed493';
const SAFE_OWNERS_API = 'https://api.safe.global/tx-service/eth/api/v1/owners';

const V2_DELEGATION = 'tuple(uint8 type_, address to, address from, bytes32 rights, address contract_, uint256 tokenId, uint256 amount)[]';
const V2_ABI = [
  `function getIncomingDelegations(address to) view returns (${V2_DELEGATION})`,
  `function getOutgoingDelegations(address from) view returns (${V2_DELEGATION})`,
];
const V1_ABI = [
  'function getDelegationsByDelegate(address delegate) view returns (tuple(uint8 type_, address vault, address delegate, address contract_, uint256 tokenId)[])',
  'function getDelegatesForAll(address vault) view returns (address[])',
  'function getDelegatesForContract(address vault, address contract_) view returns (address[])',
];
const SAFE_ABI = ['function getOwners() view returns (address[])'];

// Delegation types: v1 NONE 0 / ALL 1 / CONTRACT 2 / TOKEN 3;
// v2 NONE 0 / ALL 1 / CONTRACT 2 / ERC721 3 / ERC20 4 / ERC1155 5.
function coversTerraforms(type, contract, terraforms) {
  const t = Number(type);
  return t === 1 || ((t === 2 || t === 3) && String(contract).toLowerCase() === terraforms);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);
}

/**
 * @returns {Promise<Array<{address: string, relations: string[]}>>} checksummed,
 *   excluding the wallet itself and the zero address
 */
async function discoverLinkedWallets(address, { provider, terraformsAddress, fetchImpl = fetch, timeoutMs = 8000, log = console }) {
  const self = ethers.getAddress(address);
  const tf = terraformsAddress.toLowerCase();
  const found = new Map(); // lowercased -> { address, relations: Set }
  const add = (a, relation) => {
    if (!a || !ethers.isAddress(a)) return;
    const addr = ethers.getAddress(a);
    if (addr === self || addr === ethers.ZeroAddress) return;
    const key = addr.toLowerCase();
    if (!found.has(key)) found.set(key, { address: addr, relations: new Set() });
    found.get(key).relations.add(relation);
  };

  const v2 = new ethers.Contract(DELEGATE_V2, V2_ABI, provider);
  const v1 = new ethers.Contract(DELEGATE_V1, V1_ABI, provider);
  const tasks = {
    'delegate.xyz v2 incoming': async () => {
      for (const d of await v2.getIncomingDelegations(self)) {
        if (coversTerraforms(d.type_, d.contract_, tf)) add(d.from, 'vault that delegated to this wallet (delegate.xyz)');
      }
    },
    'delegate.xyz v2 outgoing': async () => {
      for (const d of await v2.getOutgoingDelegations(self)) {
        if (coversTerraforms(d.type_, d.contract_, tf)) add(d.to, 'wallet this one delegated to (delegate.xyz)');
      }
    },
    'delegate.xyz v1 incoming': async () => {
      for (const d of await v1.getDelegationsByDelegate(self)) {
        if (coversTerraforms(d.type_, d.contract_, tf)) add(d.vault, 'vault that delegated to this wallet (delegate.xyz v1)');
      }
    },
    'delegate.xyz v1 outgoing': async () => {
      const [all, contract] = await Promise.all([v1.getDelegatesForAll(self), v1.getDelegatesForContract(self, terraformsAddress)]);
      for (const a of [...all, ...contract]) add(a, 'wallet this one delegated to (delegate.xyz v1)');
    },
    'safe owners': async () => {
      // Reverts or returns nothing unless this address is a Safe.
      const owners = await new ethers.Contract(self, SAFE_ABI, provider).getOwners();
      for (const o of owners) add(o, 'owner of this Safe');
    },
    'safes owned': async () => {
      const res = await fetchImpl(`${SAFE_OWNERS_API}/${self}/safes/`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`Safe API ${res.status}`);
      const j = await res.json();
      for (const s of j.safes || []) add(s, 'Safe this wallet co-owns');
    },
  };

  const settled = await Promise.allSettled(Object.values(tasks).map(fn => withTimeout(fn(), timeoutMs)));
  settled.forEach((r, i) => {
    const name = Object.keys(tasks)[i];
    // A non-Safe answering getOwners is the normal case, not worth a log line.
    if (r.status === 'rejected' && name !== 'safe owners') log.warn(`[linked] ${self.slice(0, 10)} ${name}: ${r.reason?.message || r.reason}`);
  });
  return [...found.values()].map(f => ({ address: f.address, relations: [...f.relations] }));
}

module.exports = { discoverLinkedWallets, coversTerraforms, DELEGATE_V1, DELEGATE_V2 };
