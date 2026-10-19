// parcelStore.js — every minted parcel's tokenURI document, held in memory.
//
// Why: /image, /estimate, /wallet and the feeds all start from tokenURI. They
// used to share a 500-entry LRU, so anything that walked the collection (a
// scraper, or just /image/1..9911) missed on every request and turned each hit
// into a ~55KB publicnode read — a few IPs could get the API's RPC throttled and
// take every parcel page down with it. Holding all 9,911 documents removes the
// per-request RPC entirely: requests are served from memory, and the only RPC
// is the store's own, bounded traffic (one warm-up pass, then refreshes).
//
// Memory: the SVG is kept gzipped (~6KB of a ~31KB SVG) — /image sends those
// bytes as-is to any client that accepts gzip — plus the name and attributes.
// Measured for all 9,911: 59MB of buffers + 5MB of heap (~95MB of RSS), a
// little over what the two old 500-entry LRUs could hold (~54MB).
//
// tokenURI is NOT immutable: dreaming, terraforming and antenna changes all
// rewrite the parcel's attributes and image. So the store:
//   - warms every parcel at boot (Render restarts on each deploy, which the
//     nightly refit triggers daily) and again every 24h,
//   - refreshes a parcel within about a minute of an on-chain event that
//     changes it (startParcelEventPoller below).

const zlib = require('zlib');
const { ethers } = require('ethers');

const TOTAL_SUPPLY = 9911;

function decodeTokenURI(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:application/json;base64,')) {
    throw new Error('Unexpected tokenURI format');
  }
  const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  const image = json.image || '';
  let svg = null;
  if (image.startsWith('data:image/svg+xml;base64,')) svg = Buffer.from(image.slice(26), 'base64');
  else if (image.startsWith('data:image/svg+xml,')) svg = Buffer.from(decodeURIComponent(image.slice(19)));
  return {
    name: json.name ?? null,
    attributes: Array.isArray(json.attributes) ? json.attributes : [],
    // Copied out: gzipSync's result is a view into a larger zlib output chunk,
    // so holding it as-is pinned ~155MB instead of 59MB for the collection
    // (measured). Buffer.from gives each its own right-sized copy.
    svgGz: svg ? Buffer.from(zlib.gzipSync(svg, { level: 9 })) : null,
  };
}

class ParcelStore {
  /**
   * @param {object} opts
   * @param {(tokenId: number) => Promise<string>} opts.fetchTokenURI one RPC read
   * @param {number} [opts.totalSupply]
   * @param {object} [opts.log] console-like
   */
  constructor({ fetchTokenURI, totalSupply = TOTAL_SUPPLY, log = console }) {
    this.fetchTokenURI = fetchTokenURI;
    this.totalSupply = totalSupply;
    this.log = log;
    this.docs = new Map();     // tokenId -> { name, attributes, svgGz, fetchedAt }
    this.inFlight = new Map(); // tokenId -> Promise
    this.warming = null;       // Promise of the running warm pass
    this.warmedAt = null;
  }

  isValidId(tokenId) {
    return Number.isInteger(tokenId) && tokenId >= 1 && tokenId <= this.totalSupply;
  }

  /** The parcel's document, from memory when held, else read once (concurrent callers share the read). */
  get(tokenId) {
    const id = Number(tokenId);
    if (!this.isValidId(id)) return Promise.reject(new Error(`Invalid token ID ${tokenId}`));
    const doc = this.docs.get(id);
    if (doc) return Promise.resolve(doc);
    return this.load(id);
  }

  /** Read the parcel from chain and replace what is held. */
  load(tokenId) {
    const id = Number(tokenId);
    if (this.inFlight.has(id)) return this.inFlight.get(id);
    const p = Promise.resolve()
      .then(() => this.fetchTokenURI(id))
      .then(uri => {
        const doc = { ...decodeTokenURI(uri), fetchedAt: Date.now() };
        this.docs.set(id, doc);
        return doc;
      })
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, p);
    return p;
  }

  /** Re-read these parcels in the background (on-chain change events). */
  refresh(tokenIds) {
    for (const id of tokenIds) {
      if (!this.isValidId(Number(id))) continue;
      this.load(Number(id)).catch(err => this.log.warn(`[parcels] refresh #${id} failed: ${err.message}`));
    }
  }

  /**
   * Read every parcel, `concurrency` at a time with `delayMs` between batches.
   * `force` re-reads parcels already held (the daily pass); otherwise only the
   * missing ones. Failures are retried once at the end and then left to the
   * first request that needs them. One pass runs at a time.
   */
  warm({ concurrency = 4, delayMs = 250, force = false } = {}) {
    if (this.warming) return this.warming;
    const started = Date.now();
    this.warming = (async () => {
      const ids = [];
      for (let id = 1; id <= this.totalSupply; id++) if (force || !this.docs.has(id)) ids.push(id);
      let failed = [];
      for (const pass of [1, 2]) {
        const todo = pass === 1 ? ids : failed;
        failed = [];
        for (let i = 0; i < todo.length; i += concurrency) {
          const batch = todo.slice(i, i + concurrency);
          const settled = await Promise.allSettled(batch.map(id => this.load(id)));
          settled.forEach((r, j) => { if (r.status === 'rejected') failed.push(batch[j]); });
          if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        }
        if (failed.length === 0) break;
      }
      this.warmedAt = Date.now();
      const s = this.stats();
      this.log.log(`[parcels] warm${force ? ' (refresh)' : ''}: ${s.held}/${this.totalSupply} held, ${(s.bytes / 1048576).toFixed(1)}MB of SVG, ${failed.length} failed, ${Math.round((Date.now() - started) / 1000)}s`);
      return s;
    })().finally(() => { this.warming = null; });
    return this.warming;
  }

  stats() {
    let bytes = 0;
    for (const d of this.docs.values()) bytes += d.svgGz ? d.svgGz.length : 0;
    return { held: this.docs.size, bytes, warmedAt: this.warmedAt, warming: !!this.warming };
  }
}

// ─── ON-CHAIN CHANGE EVENTS ──────────────────────────────────────────────────
// Signatures checked against live logs (2026-10-19): Daydreaming and Terraformed
// carry the tokenId in the first data word (not indexed); Transfer in topic 3.
// ParcelModified / AttunementSet are the Antenna contract's (ArtGod's ABI; none
// were emitted in the two weeks sampled) — a miss there is covered by the daily
// refresh and the nightly minted-traits snapshot.
const TOPIC = {
  transfer: ethers.id('Transfer(address,address,uint256)'),
  daydreaming: ethers.id('Daydreaming(uint256)'),
  terraformed: ethers.id('Terraformed(uint256,address)'),
  parcelModified: ethers.id('ParcelModified(uint256,uint8)'),
  attunementSet: ethers.id('AttunementSet(uint256,int256)'),
};

function wordAsTokenId(hex) {
  if (!hex || hex.length < 66) return null;
  const n = BigInt(hex.slice(0, 66));
  return n >= 1n && n <= BigInt(TOTAL_SUPPLY) ? Number(n) : null;
}

/**
 * Which parcels a batch of logs touched: changed (re-read tokenURI), antenna,
 * transferred, and `transfers` in log order with the new owner of each.
 */
function parcelIdsFromLogs(logs) {
  const changed = new Set(), antenna = new Set(), transferred = new Set();
  const transfers = [];
  for (const log of logs || []) {
    const t0 = log.topics?.[0];
    if (t0 === TOPIC.transfer && log.topics.length === 4) {
      const id = wordAsTokenId(log.topics[3]);
      if (id) {
        transferred.add(id);
        transfers.push({ tokenId: id, from: ethers.getAddress('0x' + log.topics[1].slice(26)), to: ethers.getAddress('0x' + log.topics[2].slice(26)) });
      }
    } else if (t0 === TOPIC.daydreaming || t0 === TOPIC.terraformed) {
      const id = wordAsTokenId(log.data);
      if (id) changed.add(id);
    } else if (t0 === TOPIC.parcelModified) {
      const id = wordAsTokenId(log.data);
      if (id) { changed.add(id); antenna.add(id); }
    } else if (t0 === TOPIC.attunementSet && log.topics.length >= 2) {
      const id = wordAsTokenId(log.topics[1]);
      if (id) { changed.add(id); antenna.add(id); }
    }
  }
  return { changed, antenna, transferred, transfers };
}

/**
 * Poll the Terraforms and Antenna contracts' logs every `intervalMs` and report
 * the parcels they touched. Starts from the current head (the boot warm-up
 * covers everything before it). publicnode only serves recent log ranges, so
 * a stall longer than `maxSpan` blocks skips ahead and calls onGap — the caller
 * re-warms the store, which is the complete answer to a gap anyway.
 */
function startParcelEventPoller({ provider, addresses, intervalMs = 60_000, maxSpan = 100, onLogs, onGap, log = console }) {
  let last = null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const head = await provider.getBlockNumber();
      if (last == null) { last = head; return; }
      if (head <= last) return;
      let from = last + 1;
      if (head - from + 1 > maxSpan) {
        log.warn(`[parcels] event poller ${head - last} blocks behind — skipping ahead and re-warming`);
        from = head - maxSpan + 1;
        onGap?.();
      }
      const logs = await provider.getLogs({ address: addresses, fromBlock: from, toBlock: head });
      last = head;
      onLogs(parcelIdsFromLogs(logs));
    } catch (err) {
      // Leave `last` alone so the next tick retries the same range.
      log.warn(`[parcels] event poll failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return { stop: () => clearInterval(timer), tick };
}

module.exports = { ParcelStore, decodeTokenURI, parcelIdsFromLogs, startParcelEventPoller, TOPIC, TOTAL_SUPPLY };
