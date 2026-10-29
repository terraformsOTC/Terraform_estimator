import { createPageMetadata, SITE_URL } from '@/lib/metadata';

const description = 'Terraforms by the numbers — total market cap of minted and unminted parcels, sales volume, and current listings.';

export const metadata = createPageMetadata('Stats', description, '/stats');

// schema.org Dataset for the open-data download at the bottom of the page, so the
// licence is machine-readable and dataset search engines can list it. The file
// name changes monthly, so the distribution points at the manifest, which names it.
const DATASET_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Terraforms sales history',
  description: 'Every secondary-market sale of a Terraforms parcel (Mathcastles, contract 0x4E1f41613c9084FdB9E34E11fAE9412427480e56) since mint in December 2021: time, parcel, price, currency, sale type, buyer, seller, transaction and the daily floor index. One row per parcel sold, updated monthly, with a SHA-256 per release.',
  url: `${SITE_URL}/stats`,
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  isAccessibleForFree: true,
  creator: { '@type': 'Organization', name: 'Terraform Estimator', url: SITE_URL },
  temporalCoverage: '2021-12-17/..',
  keywords: ['Terraforms', 'Mathcastles', 'NFT', 'sales', 'Ethereum', 'open data'],
  distribution: [{
    '@type': 'DataDownload',
    encodingFormat: 'application/json',
    contentUrl: `${SITE_URL}/data/sales-dataset.json`,
    description: 'Manifest naming the current gzipped CSV release, its SHA-256 and every past release',
  }],
};

export default function StatsLayout({ children }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(DATASET_JSON_LD) }} />
      {children}
    </>
  );
}
