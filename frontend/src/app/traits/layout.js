import { createPageMetadata } from '@/lib/metadata';

const description = 'Find every Terraforms parcel — minted or unminted — matching a special trait type, and the collecting sets with an example parcel from every member.';

export const metadata = createPageMetadata('Traits & Sets', description, '/traits');

export default function TraitsLayout({ children }) {
  return children;
}
