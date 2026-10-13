// crosscheck-indexer.js — check minted-traits.json against an independent
// source every night, and repair what has gone stale.
//
// The snapshot is only refreshed by a forced bake (~25 min of RPC), so between
// bakes a parcel that is dreamed, terraformed or has its antenna switched keeps
// its old traits. The terraformexplorer.xyz indexer (a public Ponder GraphQL
// service run by team-tfx) holds every parcel's live traits and answers all
// 9,911 in ~8 seconds, which makes it a cheap way to find those parcels.
//
// It is a cross-check, never the source of truth. It has been wrong — on
// 2026-10-13 it read #7287 as Daydream when the chain said Terraform — so every
// disagreement is re-read from chain (scripts/trait-record.js, the same reader
// the bake uses), and only the chain's answer is written:
//   chain != snapshot  -> the snapshot was stale; update it
//   chain == snapshot  -> the indexer is wrong; report it, change nothing
// If the indexer is unreachable, or disagrees on more parcels than a stale
// snapshot plausibly could, nothing is changed and the run still exits 0: a
// third-party outage must never fail the nightly refit.
//
// Usage:
//   node --env-file=.env scripts/crosscheck-indexer.js [--dry-run]

const fs = require('fs');
const path = require('path');
const { makeContracts, fetchTraitRecord } = require('./trait-record');

const INDEXER_URL = 'https://terraforms-indexer-production-d72b.up.railway.app/graphql';
const SNAPSHOT_PATH = path.join(__dirname, '..', 'src', 'minted-traits.json');
const PAGE_SIZE = 1000;
// More disagreements than this is an indexer fault (a bad deploy, a reindex in
// progress), not a stale snapshot — the worst week of terraforming on record is
// well under a hundred parcels. Verifying thousands would just burn RPC.
const MAX_VERIFY = 300;
// The indexer reports the block it has synced to; behind by more than this
// (~1 hour) and its "current" traits are not current.
const MAX_LAG_BLOCKS = 300;
const VERIFY_BATCH = 8;

const FIELDS = ['zone', 'biome', 'level', 'chroma', 'mode', 'mysteryValue', 'antennaOn', 'antennaFirstTs'];

async function gql(query, variables) {
  const res = await fetch(INDEXER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

async function pullIndexer() {
  const meta = await gql('{ _meta { status } }');
  const syncedBlock = meta?._meta?.status?.mainnet?.block?.number ?? null;
  const items = [];
  let after = null;
  for (;;) {
    const data = await gql(
      `query($after: String) { terraforms(limit: ${PAGE_SIZE}, after: $after) {
        items { tokenId mode chroma biome zone level resource antenna antennaTimestamp }
        pageInfo { hasNextPage endCursor } } }`,
      { after },
    );
    items.push(...data.terraforms.items);
    if (!data.terraforms.pageInfo.hasNextPage) break;
    after = data.terraforms.pageInfo.endCursor;
  }
  return { syncedBlock, items };
}

// The indexer's row in minted-traits.json's shape. It reports the first
// antenna timestamp even when the antenna is now off; the snapshot stores 0
// then, so it is only carried across while the antenna is on.
function fromIndexer(t) {
  return {
    zone: t.zone,
    biome: t.biome,
    level: t.level,
    chroma: t.chroma,
    mode: t.mode,
    mysteryValue: t.resource,
    antennaOn: t.antenna,
    antennaFirstTs: t.antenna && t.antennaTimestamp ? Number(t.antennaTimestamp) : 0,
  };
}

const differing = (a, b) => FIELDS.filter(f => (a[f] ?? null) !== (b[f] ?? null));
const describe = (fields, from, to) => fields.map(f => `${f} ${from[f]} -> ${to[f]}`).join(', ');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const byId = new Map(snapshot.map(r => [r.tokenId, r]));

  let indexer;
  try {
    indexer = await pullIndexer();
  } catch (err) {
    console.log(`[crosscheck] indexer unreachable (${err.message}) — snapshot left as is`);
    return;
  }

  const contracts = makeContracts(process.env.RPC_URL || 'https://ethereum.publicnode.com');
  try {
    const head = await contracts.provider.getBlockNumber();
    const lag = indexer.syncedBlock != null ? head - indexer.syncedBlock : null;
    if (lag == null || lag > MAX_LAG_BLOCKS) {
      console.log(`[crosscheck] WARNING: indexer at block ${indexer.syncedBlock}, chain at ${head} — its traits may be behind`);
    }
  } catch { /* the RPC is checked properly by the verification below */ }

  if (indexer.items.length !== byId.size) {
    console.log(`[crosscheck] WARNING: indexer has ${indexer.items.length} parcels, snapshot ${byId.size}`);
  }

  const suspects = [];
  for (const t of indexer.items) {
    const ours = byId.get(t.tokenId);
    if (ours && differing(ours, fromIndexer(t)).length) suspects.push(t);
  }
  console.log(`[crosscheck] ${indexer.items.length} parcels from the indexer, ${suspects.length} disagree with the snapshot`);
  if (suspects.length === 0) return;
  if (suspects.length > MAX_VERIFY) {
    console.log(`[crosscheck] more than ${MAX_VERIFY} disagreements — treating it as an indexer fault; snapshot left as is`);
    return;
  }

  const updated = [], indexerWrong = [], unverified = [];
  for (let i = 0; i < suspects.length; i += VERIFY_BATCH) {
    const batch = suspects.slice(i, i + VERIFY_BATCH);
    const results = await Promise.allSettled(batch.map(t => fetchTraitRecord(t.tokenId, contracts)));
    results.forEach((r, j) => {
      const t = batch[j];
      const ours = byId.get(t.tokenId);
      if (r.status !== 'fulfilled') {
        unverified.push(t.tokenId);
        console.log(`[crosscheck] #${t.tokenId}: chain read failed (${r.reason?.message || r.reason}) — kept the snapshot`);
        return;
      }
      const chain = r.value;
      const stale = differing(ours, chain);
      if (stale.length) {
        console.log(`[crosscheck] #${t.tokenId}: snapshot stale — ${describe(stale, ours, chain)}`);
        byId.set(t.tokenId, chain);
        updated.push(t.tokenId);
      }
      const wrong = differing(chain, fromIndexer(t));
      if (wrong.length) {
        console.log(`[crosscheck] #${t.tokenId}: indexer disagrees with chain — ${describe(wrong, chain, fromIndexer(t))}`);
        indexerWrong.push(t.tokenId);
      }
    });
  }

  console.log(`[crosscheck] updated ${updated.length}, indexer wrong on ${indexerWrong.length}, unverified ${unverified.length}`);
  if (updated.length && !dryRun) {
    const out = [...byId.values()].sort((a, b) => a.tokenId - b.tokenId);
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(out) + '\n');
    console.log(`[crosscheck] wrote ${SNAPSHOT_PATH}`);
  } else if (updated.length) {
    console.log('[crosscheck] --dry-run: snapshot not written');
  }
}

main().catch(err => {
  // Local faults (an unreadable snapshot) are real errors, but the refit treats
  // this step as advisory either way.
  console.error('[crosscheck] failed:', err.message);
  process.exit(1);
});
