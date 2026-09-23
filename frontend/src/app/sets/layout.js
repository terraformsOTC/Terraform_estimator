import { createPageMetadata } from '@/lib/metadata';

const description = 'The Terraforms collecting sets — what each one requires, and an example parcel from every member.';

export const metadata = createPageMetadata('Sets', description, '/sets');

export default function SetsLayout({ children }) {
  return children;
}
