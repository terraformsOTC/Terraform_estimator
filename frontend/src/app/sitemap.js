// lastModified only where it is true. The data pages change with every daily
// refit, which is also when the site rebuilds, so the build time is their last
// change. The reference pages change only when someone edits them, and a date
// that moves every day on them teaches Google to ignore the field altogether
// (Search Console, 2026-10-30), so they carry none.
export default function sitemap() {
  const base = 'https://www.terraformestimator.xyz';
  const built = new Date();
  return [
    { url: base,              lastModified: built, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${base}/listings`, lastModified: built, changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/sales`,    lastModified: built, changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/stats`,    lastModified: built, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${base}/collectors`, lastModified: built, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/glossary`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/desirabilitytiers`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/methodology`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/traits`,   changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${base}/helper`,   changeFrequency: 'monthly', priority: 0.7 },
  ];
}
