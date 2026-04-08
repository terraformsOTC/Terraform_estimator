export const SITE_URL = 'https://www.terraformestimator.xyz';

const OG_IMAGE = '/og-image.png';

export function createPageMetadata(title, description, route) {
  const url = `${SITE_URL}${route}`;
  const fullTitle = `${title} | Terraform Estimator`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Terraform Estimator' }],
    },
    twitter: {
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}
