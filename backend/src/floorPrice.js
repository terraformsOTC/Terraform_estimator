// The live collection floor, with a fallback source, retry backoff and an age limit
// (security scan finding 3, fixed at James's request 2026-11-12).
//
// Before: when an Alchemy refresh failed, the last floor stayed "live" forever (no age
// limit), and every request retried Alchemy with a 5 s timeout, so an outage slowed
// every page while estimates rested on an old floor that claimed to be current.
//
// Now:
//   - sources are tried in order (Alchemy's OpenSea floor, then OpenSea's own stats
//     floor); the first valid price wins;
//   - a refresh is shared by concurrent callers, never one per request;
//   - after every source fails, nothing retries for `retryMs` (the last floor is served);
//   - a floor older than `staleMs` is served with isLive false, so the site says so;
//   - with no successful refresh yet, the hardcoded fallback is served, not live.
//
// Pure apart from the injected fetchers and clock; tested in test/floorPrice.test.js.

function createFloorSource({
  sources,                        // [{ name, fetch: async () => number }]
  fallbackPrice,
  now = () => Date.now(),
  ttlMs = 5 * 60 * 1000,          // a live floor is reused this long before refreshing
  retryMs = 60 * 1000,            // after every source fails, wait this long to retry
  staleMs = 2 * 60 * 60 * 1000,   // a floor this old is no longer called live
  onLive = () => {},              // (timeMs, price, sourceName) on each successful refresh
  log = console,
}) {
  const state = { price: null, fetchedAt: 0, source: null, lastError: null, nextAttemptAt: 0 };
  let inFlight = null;

  function view(t) {
    const has = state.fetchedAt > 0;
    const ageMs = has ? t - state.fetchedAt : null;
    return {
      price: has ? state.price : fallbackPrice,
      isLive: has && ageMs <= staleMs,
      fetchedAt: has ? state.fetchedAt : null,
      ageMs,
      source: has ? state.source : 'fallback',
      refreshFailing: state.lastError !== null,
    };
  }

  async function refresh(t) {
    const errors = [];
    for (const src of sources) {
      try {
        const price = await src.fetch();
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
          throw new Error(`unexpected floor ${price}`);
        }
        Object.assign(state, { price, fetchedAt: t, source: src.name, lastError: null, nextAttemptAt: 0 });
        onLive(t, price, src.name);
        return view(t);
      } catch (err) {
        errors.push(`${src.name}: ${err.message}`);
      }
    }
    state.lastError = errors.join('; ');
    state.nextAttemptAt = t + retryMs;
    log.warn(`[floor] every source failed (${state.lastError}); serving ${state.fetchedAt ? `the floor from ${Math.round((t - state.fetchedAt) / 60000)} min ago` : 'the hardcoded fallback'}, next try in ${Math.round(retryMs / 1000)} s`);
    return view(t);
  }

  async function get() {
    const t = now();
    if (state.fetchedAt && t - state.fetchedAt < ttlMs) return view(t);
    if (t < state.nextAttemptAt) return view(t);
    if (!inFlight) inFlight = refresh(t).finally(() => { inFlight = null; });
    return inFlight;
  }

  return { get, peek: () => view(now()) };
}

module.exports = { createFloorSource };
