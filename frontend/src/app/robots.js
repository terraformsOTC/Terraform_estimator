export default function robots() {
  return {
    // /hedonic is an unlinked staging page for the shadow pricing model — it is
    // not what the product serves, so it should not turn up in search results.
    rules: { userAgent: '*', allow: '/', disallow: '/hedonic' },
    sitemap: 'https://www.terraformestimator.xyz/sitemap.xml',
  };
}
