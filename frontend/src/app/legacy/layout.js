import { createPageMetadata } from '@/lib/metadata';

const description = 'The retired v1 Terraform Estimator pricing model, kept accessible for reference.';

export const metadata = {
  ...createPageMetadata('Legacy model (v1)', description, '/legacy'),
  // Retired and unlinked. It is kept reachable for anyone comparing against an
  // old quote, not for search traffic — robots.js disallows the path too.
  robots: { index: false, follow: false },
};

export default function LegacyLayout({ children }) {
  return children;
}
