import { API_URL } from '@/components/shared';

// Edge-cached proxy for the JSON feeds, the same trick src/app/img/[tokenId] uses
// for parcel SVGs and for the same reason.
//
// The backend is one Render instance in one region with no CDN in front of it.
// Measured warm, /listings is 250ms to first byte and 25ms of transfer — almost
// all of the cost is the round trip, not the payload. Served through here it
// lands on Vercel's edge network instead: the first request for a given feed
// goes to Render, every one after that is answered from the PoP nearest the
// visitor, and it is same-origin so the browser reuses the page's connection
// rather than opening a second one to Render.
//
// The backend already caches these for 30 minutes, so an edge copy is not stale
// in any way the origin was not. `s-maxage` is set well under that: the CDN holds
// it for a minute and revalidates in the background for half an hour, which keeps
// a navigation instant without letting the edge drift further behind than the
// origin already allows.

// Allowlist, not a catch-all `[...path]`: this route is public and unauthenticated,
// so it forwards exactly the three read-only feeds and nothing else. Adding one is
// a deliberate edit.
const FEEDS = {
  listings: '/listings',
  'listings-slim': '/listings-slim',
  sales: '/sales',
};

const EDGE_CACHE = 'public, max-age=60, s-maxage=60, stale-while-revalidate=1800';

export async function GET(request, { params }) {
  const { feed } = await params;
  const upstreamPath = FEEDS[feed];
  if (!upstreamPath) {
    return Response.json({ error: 'Unknown feed' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  // Only the query params the feeds actually take, so a stray ?foo=1 cannot
  // multiply the number of distinct edge cache entries for the same payload.
  const incoming = new URL(request.url).searchParams;
  const qs = new URLSearchParams();
  for (const key of ['mode', 'limit', 'refresh']) {
    const v = incoming.get(key);
    if (v != null) qs.set(key, v);
  }
  const forced = qs.get('refresh') === '1' || qs.get('refresh') === 'true';

  const target = `${API_URL}${upstreamPath}${qs.toString() ? `?${qs}` : ''}`;

  let upstream;
  try {
    // no-store on the fetch itself: the CDN is the cache layer here, not Next's
    // data cache, which would otherwise hold a copy with its own lifetime.
    upstream = await fetch(target, { cache: 'no-store', headers: { accept: 'application/json' } });
  } catch (err) {
    console.warn(`[feed] ${feed}: upstream unreachable — ${err?.message || err}`);
    return Response.json({ error: 'Upstream unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await upstream.text();
  // A 503 from the backend means its own cache is cold or in failure backoff.
  // Never let that get pinned at the edge for half an hour.
  const cacheable = upstream.ok && !forced;

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheable ? EDGE_CACHE : 'no-store',
    },
  });
}
