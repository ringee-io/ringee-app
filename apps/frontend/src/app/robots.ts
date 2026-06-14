import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/features/marketing/site';

/**
 * robots.txt for Ringee. Allows normal search crawling and AI search crawlers
 * (including OAI-SearchBot), keeps the app/auth areas out of the index, and
 * points to the sitemap. GPTBot is not blocked, matching the project's prior
 * open crawl policy.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/dashboard', '/auth', '/dialer', '/api', '/monitoring'];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
