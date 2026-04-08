import { createPageMetadata } from '@/lib/metadata';

const description = 'Shows any Terraforms parcels listed at a discount according to the Terraform Estimator valuation model — updated every 30 minutes.';

export const metadata = createPageMetadata('Bargains', description, '/bargains');

export default function BargainsLayout({ children }) {
  return children;
}
