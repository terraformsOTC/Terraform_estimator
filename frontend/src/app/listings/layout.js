import { createPageMetadata } from '@/lib/metadata';

const description = 'Browse all active Terraforms listings on OpenSea, sorted by newest or price. Filter to bargains listed below the Terraform Estimator valuation model.';

export const metadata = createPageMetadata('Listings', description, '/listings');

export default function ListingsLayout({ children }) {
  return children;
}
