import ListingsPage from './ListingsPage';
import { fetchApi } from '@/lib/serverData';

export const revalidate = 1800;

// The full listing set takes 20-40s to build on a cold backend, so the server
// renders only its summary, from /stats (the same 30-minute OpenSea cache).
export default async function Page() {
  const stats = await fetchApi('/stats');
  const initialSummary = stats?.listings
    ? { ...stats.listings, floor: stats.floor }
    : null;
  return <ListingsPage initialSummary={initialSummary} />;
}
