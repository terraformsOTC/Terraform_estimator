/** @type {import('next').NextConfig} */

const API_ORIGIN = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').origin; }
  catch { return ''; }
})();

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${API_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' https://api.coinbase.com https://vitals.vercel-insights.com https://va.vercel-scripts.com ${API_ORIGIN}`,
  "frame-src https://tokens.mathcastles.xyz",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy',  value: csp },
];

// /img/* is the edge-cached parcel-SVG proxy (src/app/img/[tokenId]/route.js).
// An SVG served as a document needs a *tighter* policy than the site's, not the
// site's — this is the same lockdown the backend puts on /image, kept in step.
const svgHeaders = [
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'Content-Security-Policy', value: "default-src 'none'; style-src 'unsafe-inline'; img-src data:" },
];

const nextConfig = {
  async headers() {
    return [
      // Negative lookahead so the site CSP never lands on /img/* alongside the
      // SVG one — two Content-Security-Policy headers intersect, and the site
      // policy is the looser of the two only by accident.
      { source: '/((?!img/).*)', headers: securityHeaders },
      { source: '/img/:tokenId', headers: svgHeaders },
    ];
  },
};

module.exports = nextConfig;
