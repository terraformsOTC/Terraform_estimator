import './globals.css';
import { Analytics } from '@vercel/analytics/react';

const SITE_URL = 'https://www.terraformestimator.xyz';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Terraform Estimator',
    template: '%s | Terraform Estimator',
  },
  description: 'Estimate the value of any Terraforms by Mathcastles parcel. Covers all 11,104 parcels — minted and unminted.',
  openGraph: {
    siteName: 'Terraform Estimator',
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    title: 'Terraform Estimator',
    description: 'Estimate the value of any Terraforms by Mathcastles parcel. Covers all 11,104 parcels — minted and unminted.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Terraform Estimator' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terraform Estimator',
    description: 'Estimate the value of any Terraforms by Mathcastles parcel. Covers all 11,104 parcels — minted and unminted.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
