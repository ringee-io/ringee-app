import type { Metadata } from 'next';

import { SITE_LAST_MODIFIED, SITE_NAME, SITE_URL } from './site';

/** Google truncates titles near 60 characters and descriptions near 155. */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 155;

/**
 * The first candidate that fits the limit, or the last one if none does.
 * Templated pages (one per country, per number type) pass their preferred
 * wording first and progressively shorter fallbacks after it, so a long
 * country name drops the brand suffix instead of getting cut mid-word.
 */
function firstThatFits(candidates: string[], limit: number): string {
  return (
    candidates.find((candidate) => candidate.length <= limit) ??
    candidates[candidates.length - 1]
  );
}

export function fitTitle(candidates: string[]): string {
  return firstThatFits(candidates, TITLE_LIMIT);
}

export function fitDescription(candidates: string[]): string {
  return firstThatFits(candidates, DESCRIPTION_LIMIT);
}

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
    // Freshness signal for AI engines (Google AI Overviews, Perplexity, Gemini)
    // and search crawlers. Reflects the current build/deploy.
    other: { 'article:modified_time': SITE_LAST_MODIFIED },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: canonical,
      siteName: `${SITE_NAME}.io`,
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      images: [
        {
          url: `${SITE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — calling infrastructure for humans and AI voice agents`
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
