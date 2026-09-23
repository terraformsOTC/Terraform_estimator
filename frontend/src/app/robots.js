export default function robots() {
  return {
    // /legacy is the retired v1 model, kept reachable but unlinked. It is not what
    // the product serves, so it should not turn up in search results.
    // /health is the unlisted operator dashboard — an indexed page reporting
    // STALE would be worse than not having one.
    rules: { userAgent: '*', allow: '/', disallow: ['/legacy', '/health', '/api/'] },
    sitemap: 'https://www.terraformestimator.xyz/sitemap.xml',
  };
}
