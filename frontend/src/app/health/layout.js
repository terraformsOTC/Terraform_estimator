// Kept out of search: noindex + nofollow, absent from the sitemap, disallowed in
// robots.txt. It is an operator view of how stale the pricing model is, and a
// search result for "terraforms estimator health" reading STALE would be worse
// than useless. Linked from the [more] menu since 2026-10-13 at James's request.
export const metadata = {
  title: 'Site health',
  robots: { index: false, follow: false, nocache: true },
};

export default function HealthLayout({ children }) {
  return children;
}
