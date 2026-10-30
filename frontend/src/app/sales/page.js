import SalesPage from './SalesPage';
import { fetchApi } from '@/lib/serverData';

export const revalidate = 1800;

// The first page of unfiltered sales, as the page asks for it (PAGE_SIZE).
export default async function Page() {
  const first = await fetchApi('/sales-history?limit=50');
  return <SalesPage initialData={first?.sales ? first : null} />;
}
