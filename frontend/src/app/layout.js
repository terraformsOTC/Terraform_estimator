import './globals.css';

export const metadata = {
  title: 'terraform estimator',
  description: 'Price estimator for Terraforms by Mathcastles parcels',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
