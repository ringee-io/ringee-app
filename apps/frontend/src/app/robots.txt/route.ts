import { SITE_URL } from '@/features/marketing/site';
import { SKILLS_INDEX_PATH, SKILL_MD_PATH } from '@/features/marketing/skills';

/**
 * robots.txt served as a route handler (instead of the `robots.ts` metadata
 * convention) so we can emit the `Content-Signal` directive and explicit
 * per-bot groups, which the typed `MetadataRoute.Robots` does not support.
 *
 * Policy: welcome every major AI crawler (search, retrieval AND training) plus
 * normal search engines, while keeping the app/auth surfaces out of every
 * index. In 2026 several AI crawlers (notably GPTBot/ClaudeBot) and WAF layers
 * treat the *absence* of an explicit allow rule as an implicit block, so each
 * AI bot is named with its own `Allow: /` group placed above the `*` catch-all
 * (order matters for some AI crawler parsers). Per-bot groups do NOT inherit
 * the `*` rules, so the Disallow list is repeated in every group.
 */
const DISALLOW = ['/dashboard', '/auth', '/dialer', '/api', '/monitoring'];

// Maximally permissive content signal: AI may search, retrieve and train.
const CONTENT_SIGNAL = 'Content-Signal: search=yes, ai-train=yes, ai-retrieval=yes';

// AI crawlers we explicitly welcome (training, search/retrieval and
// user-triggered fetchers across the major providers).
const AI_BOTS = [
  // OpenAI
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  // Google (Gemini / Vertex)
  'Google-Extended',
  'Google-CloudVertexBot',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Apple / Meta / Amazon
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Amazonbot',
  // Mistral / Cohere / DuckDuckGo / Common Crawl
  'MistralAI-User',
  'cohere-ai',
  'DuckAssistBot',
  'CCBot',
  // ByteDance / xAI — declared tokens listed for completeness, but these
  // crawlers are widely reported to ignore robots.txt and spoof browser UAs,
  // so the rules below are best-effort signals rather than enforceable limits.
  'Bytespider',
  'GrokBot',
  'xAI-Grok',
  'Grok-DeepSearch'
];

function group(userAgent: string): string[] {
  return [
    `User-agent: ${userAgent}`,
    CONTENT_SIGNAL,
    'Allow: /',
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    ''
  ];
}

export function GET() {
  const body = [
    '# Ringee — https://www.ringee.io',
    '# AI crawlers are explicitly welcomed (search, retrieval and training).',
    // Agent Skills are not a robots.txt directive, so they are advertised as
    // comments — the machine-readable entry points stay `/.well-known` and
    // `llms.txt`, this is just a signpost for anyone reading the file.
    `# Agent Skills: ${SITE_URL}${SKILL_MD_PATH}`,
    `# Agent Skills index: ${SITE_URL}${SKILLS_INDEX_PATH}`,
    '',
    // AI crawler groups first — order matters for some AI crawler parsers.
    ...AI_BOTS.flatMap(group),
    // Catch-all for normal search engines and everything else.
    ...group('*'),
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
