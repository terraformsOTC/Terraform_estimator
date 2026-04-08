import { createPageMetadata } from '@/lib/metadata';

const description = 'A reference for all the classifier tags that appear on the Terraform Estimator site.';

export const metadata = createPageMetadata('Glossary', description, '/glossary');

export default function GlossaryLayout({ children }) {
  return children;
}
