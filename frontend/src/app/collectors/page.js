import CollectorsPage from './CollectorsPage';
import { fetchApi } from '@/lib/serverData';

export const revalidate = 1800;

export default async function Page() {
  // A cold /collectors takes ~15s on the backend; past that the browser loads it.
  const collectors = await fetchApi('/collectors', { timeoutMs: 25000 });
  return <CollectorsPage initialData={collectors} />;
}
