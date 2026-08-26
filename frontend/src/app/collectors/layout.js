import { createPageMetadata } from '@/lib/metadata';

const description = 'The 100 largest Terraforms collectors, with how many parcels each holds and which sets they have completed.';

export const metadata = createPageMetadata('Collectors', description, '/collectors');

export default function CollectorsLayout({ children }) {
  return children;
}
