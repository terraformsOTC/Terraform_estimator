import { createPageMetadata } from '@/lib/metadata';

const description = 'Staging comparison of the fitted hedonic pricing model (v2) against the live estimator (v1).';

export const metadata = {
  ...createPageMetadata('Hedonic v2 (staging)', description, '/hedonic'),
  // Unlinked staging page — keep it out of search results while the model is
  // still shadow-only. robots.js disallows the path too; this covers crawlers
  // that reach the page directly without re-reading robots.txt.
  robots: { index: false, follow: false },
};

export default function HedonicLayout({ children }) {
  return children;
}
