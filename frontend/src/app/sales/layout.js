import { createPageMetadata } from '@/lib/metadata';

const description = 'Recent Terraforms sales on OpenSea compared against the Terraform Estimator valuation model — updated every 30 minutes.';

export const metadata = createPageMetadata('Sales', description, '/sales');

export default function SalesLayout({ children }) {
  return children;
}
