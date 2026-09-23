// Unlisted: noindex + nofollow, absent from the sitemap, disallowed in robots.txt
// and not linked from the menu. It is an operator view of how stale the pricing
// model is, not a page for visitors — and a search result for "terraforms
// estimator health" reading STALE would be worse than useless.
export const metadata = {
  title: 'Health',
  robots: { index: false, follow: false, nocache: true },
};

export default function HealthLayout({ children }) {
  return children;
}
