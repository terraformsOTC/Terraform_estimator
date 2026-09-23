// Recent pushes to main, for the operator dashboard.
//
// Fetched server-side rather than from the browser for two reasons: the
// unauthenticated GitHub API allows 60 requests an hour per IP, which a page
// polling every 60s would burn through, and doing it here means the response is
// cached once at Vercel's edge and shared by every view.
//
// The repo is public, so no token is involved and none should be — this route is
// reachable by anyone who finds it.

const REPO = 'terraformsOTC/Terraform_estimator';
const PER_PAGE = 60;
// Commits are immutable and new ones are rare; 5 minutes at the edge keeps the
// GitHub budget comfortable while the dashboard still reflects a push quickly.
const EDGE_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

// The pre-push hook commits a floor sample before every push, and the daily refit
// pushes one a day. They are real pushes but they are not changes anyone wants to
// read a list of, so they are counted rather than listed.
const AUTOMATED = /^data: append floor history snapshot/i;

export async function GET() {
  let res;
  try {
    res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?sha=main&per_page=${PER_PAGE}`,
      {
        cache: 'no-store',
        headers: {
          accept: 'application/vnd.github+json',
          // GitHub asks for an identifying UA and answers 403 without one.
          'user-agent': 'terraformestimator-health',
        },
      }
    );
  } catch (err) {
    return Response.json(
      { error: `GitHub unreachable: ${err?.message || err}` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!res.ok) {
    // 403 here is almost always the hourly rate limit rather than a real denial.
    const hint = res.status === 403 ? ' (likely the unauthenticated rate limit)' : '';
    return Response.json(
      { error: `GitHub API ${res.status}${hint}` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const raw = await res.json();
  const all = (Array.isArray(raw) ? raw : []).map((c) => ({
    sha: (c.sha || '').slice(0, 7),
    // First line only: the body carries the reasoning, the subject is the change.
    title: (c.commit?.message || '').split('\n')[0],
    date: c.commit?.author?.date || null,
    author: c.author?.login || c.commit?.author?.name || null,
    url: c.html_url || null,
  }));

  const commits = all.filter((c) => !AUTOMATED.test(c.title));

  return new Response(
    JSON.stringify({
      commits: commits.slice(0, 25),
      automatedCount: all.length - commits.length,
      scanned: all.length,
      repo: REPO,
      fetchedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': EDGE_CACHE } }
  );
}
