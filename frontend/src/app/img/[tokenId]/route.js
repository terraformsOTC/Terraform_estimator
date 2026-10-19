import { API_URL } from '@/components/shared';

// Edge-cached proxy for the backend's /image/:tokenId.
//
// The listings page is ~145 thumbnails, each a ~30KB SVG served straight from
// Render with no CDN in front of it (Render's own Cloudflare returns
// cf-cache-status: DYNAMIC for them). That is 145 round-trips to a single
// origin at 0.2–0.8s each, and it is the whole reason the page feels slow.
//
// Serving them through here puts them on Vercel's edge network: the first
// request for a parcel goes to Render, every one after that — for every
// visitor, from the nearest PoP — is a cache hit. Same-origin also means the
// browser reuses the page's existing connection instead of opening a second
// one to Render.
//
// A parcel's image is NOT immutable: dreaming, terraforming and antenna changes
// redraw it. So the edge and the browser hold it for an hour and then serve it
// stale while revalidating in the background — a changed parcel shows its new
// image within about an hour, and Render (which answers from memory) sees at
// most one revalidation per parcel per PoP per hour.
//
// The upstream error path returns a placeholder SVG with `no-store`; that is
// honoured below so a transient RPC failure never gets pinned at the edge.

const MAX_TOKEN_ID = 9911;
const CACHE = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';

export async function GET(request, { params }) {
  const { tokenId } = await params;

  if (!/^\d+$/.test(tokenId)) {
    return new Response('Invalid token ID', { status: 400 });
  }
  const id = parseInt(tokenId, 10);
  if (id < 1 || id > MAX_TOKEN_ID) {
    return new Response('Invalid token ID', { status: 400 });
  }

  let upstream;
  try {
    // no-store: the CDN is the cache layer here, not Next's data cache.
    upstream = await fetch(`${API_URL}/image/${id}`, { cache: 'no-store' });
  } catch (err) {
    console.warn(`[img] ${id}: upstream unreachable — ${err?.message || err}`);
    return new Response('Upstream unavailable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (!upstream.ok) {
    return new Response('Upstream error', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const body = await upstream.arrayBuffer();
  const upstreamCache = upstream.headers.get('cache-control') || '';
  const cacheable = !/no-store|no-cache/i.test(upstreamCache);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'image/svg+xml',
      'Cache-Control': cacheable ? CACHE : 'no-store',
    },
  });
}
