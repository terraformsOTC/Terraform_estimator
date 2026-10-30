import StatsPage from './StatsPage';
import { fetchApi } from '@/lib/serverData';
// Bundled at build: the manifest only changes with a monthly release, which is a
// commit and so a rebuild. Read at runtime it would not be there (public/ is served
// from the CDN, not shipped with the server code).
import manifest from '../../../public/data/sales-dataset.json';

export const revalidate = 1800;

export default async function Page() {
  const stats = await fetchApi('/stats');
  return <StatsPage initialData={stats} initialManifest={manifest} />;
}
