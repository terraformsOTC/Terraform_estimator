export default function sitemap() {
  const base = 'https://www.terraformestimator.xyz';
  return [
    { url: base,              lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${base}/listings`, lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/sales`,    lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/glossary`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/traits`,   lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
  ];
}
