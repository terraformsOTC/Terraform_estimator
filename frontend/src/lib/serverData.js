// Server-side reads for the pages whose content otherwise arrives only after the
// browser has fetched it (/stats, /sales, /listings, /collectors). Rendering them
// with real numbers puts the content in the HTML that search engines index and in
// the first paint, instead of "[loading ...]" (Search Console, 2026-10-30: 1 of 10
// sitemap pages indexed). The pages still refetch live data once they load.
//
// Pages using this are regenerated every 30 minutes (`export const revalidate`).
// Any failure returns null and the page falls back to loading in the browser, as
// before — a slow or redeploying backend must never break the page or the build.

// Read here, not from components/shared: this module runs on the server only.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchApi(path, { timeoutMs = 20000 } = {}) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
