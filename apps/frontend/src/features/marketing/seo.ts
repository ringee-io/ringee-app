import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from './site';

/**
 * Builds a consistent Metadata object for a public marketing page:
 * unique title + description, canonical URL, and matching Open Graph /
 * Twitter cards. Pass a path beginning with "/" (use "/" for the home page).
 */
export function buildMetadata({
  title,
  description,
  path,
  ogTitle,
  ogDescription
}: {
  title: string;
  description: string;
  path: string;
  ogTitle?: string;
  ogDescription?: string;
}): Metadata {
  const canonical = path === '/' ? SITE_URL : `${SITE_URL}${path}`;
  const resolvedOgTitle = ogTitle ?? title;
  const resolvedOgDescription = ogDescription ?? description;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: `${SITE_NAME}.io`,
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      images: [
        {
          url: `${SITE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — affordable outbound calling software`
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      site: '@ringeeio',
      creator: '@ringeeio',
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      images: [`${SITE_URL}/og-image.png`]
    }
  };
}
