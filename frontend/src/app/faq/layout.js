import { createPageMetadata } from '@/lib/metadata';

const description = 'How the Terraform Estimator values parcels: the hedonic pricing model, what the range means, and where the numbers come from.';

export const metadata = createPageMetadata('FAQ', description, '/faq');

export default function FaqLayout({ children }) {
  return children;
}
