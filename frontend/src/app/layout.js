import './globals.css';
import { Analytics } from '@vercel/analytics/react';

export const metadata = {
  title: 'Terraform Estimator',
  description: 'Price estimator for Terraforms by Mathcastles parcels',
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
