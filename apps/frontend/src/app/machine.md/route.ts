import { buildClaimsDocument } from '@/features/marketing/content/machine-view';

/**
 * `/machine.md` — the claims document shown on `/machine`, as bytes.
 *
 * The page renders this string; an agent fetches it. Same generator, so the
 * rendering an agent reads and the one a person sees cannot disagree. Served
 * as a route handler (like `robots.txt` and `/SKILL.md`) so the content type,
 * caching and CORS headers are set explicitly.
 *
 * Prerendered at build time — the body is generated from static content
 * modules, never from the request.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildClaimsDocument(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      // A public document meant to be read cross-origin by browser-based
      // clients, the same policy the Agent Skills artifacts carry.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
    }
  });
}
