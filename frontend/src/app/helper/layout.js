import { createPageMetadata } from '@/lib/metadata';

const description = 'See which zones, biomes, sets and special traits your Terraforms collection is missing across all your wallets, what is listed that fills each gap, and the cheapest way to fill them.';

export const metadata = createPageMetadata('Collection helper', description, '/helper');

export default function HelperLayout({ children }) {
  return children;
}
