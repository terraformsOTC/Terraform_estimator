export default function robots() {
  return {
    // /legacy is the retired v1 model, kept reachable but unlinked. It is not what
    // the product serves, so it should not turn up in search results.
    rules: { userAgent: '*', allow: '/', disallow: '/legacy' },
    sitemap: 'https://www.terraformestimator.xyz/sitemap.xml',
  };
}
