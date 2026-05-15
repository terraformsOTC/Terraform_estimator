import { createPageMetadata } from '@/lib/metadata';

const description = 'Find every Terraforms parcel — minted or unminted — matching a special trait type.';

export const metadata = createPageMetadata('Traits', description, '/traits');

export default function TraitsLayout({ children }) {
  return children;
}
