import { createPageMetadata } from '@/lib/metadata';

const description = 'Terraforms by the numbers — total market cap of minted and unminted parcels, sales volume, and current listings.';

export const metadata = createPageMetadata('Stats', description, '/stats');

export default function StatsLayout({ children }) {
  return children;
}
