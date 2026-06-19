import { SITE_URL } from '@/features/marketing/site';

/**
 * robots.txt served as a route handler (instead of the `robots.ts` metadata
 * convention) so we can emit the emerging `Content-Signal` directive, which the
 * typed `MetadataRoute.Robots` does not support.
 *
 * Policy: allow normal search + AI search crawlers (incl. OAI-SearchBot and
 * ChatGPT-User), keep the app/auth areas out of the index, and make AI access
 * intentional via Content-Signal (search/training/retrieval all allowed).
 */
const DISALLOW = ['/dashboard', '/auth', '/dialer', '/api', '/monitoring'];

export function GET() {
  const body = [
    '# Ringee — https://www.ringee.io',
    '',
    'User-agent: *',
    'Content-Signal: search=yes, ai-train=yes, ai-retrieval=yes',
    'Allow: /',
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    '',
    '# AI search crawlers — explicitly welcomed',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    `Host: ${SITE_URL}`,
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}
