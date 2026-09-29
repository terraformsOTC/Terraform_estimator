import { createPageMetadata } from '@/lib/metadata';

const description = 'Every Terraforms zone, biome and level, ranked by desirability tier — with the price multiple and parcel count behind each.';

export const metadata = createPageMetadata('Desirability Tiers', description, '/desirabilitytiers');

export default function DesirabilityTiersLayout({ children }) {
  return children;
}
