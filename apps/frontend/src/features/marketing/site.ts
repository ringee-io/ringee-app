/**
 * Central configuration for the Ringee public marketing site.
 *
 * Single source of truth for the canonical URL, navigation, the Product
 * mega-menu, footer, and the real, citable product facts used across pages
 * and structured data. Keep this file framework-agnostic (no React) so it can
 * be imported from both server components and the sitemap/robots routes.
 */

export const SITE_URL = 'https://www.ringee.io';
export const SITE_NAME = 'Ringee';
export const GITHUB_URL = 'https://github.com/ringee-io/ringee-app';
/** GitHub organization profile — used as an entity (sameAs) anchor. */
export const GITHUB_ORG_URL = 'https://github.com/ringee-io';
export const IOS_APP_URL = 'https://apps.apple.com/app/ringee-app/id6773448247';
export const ANDROID_APP_URL =
  'https://play.google.com/store/apps/details?id=io.ringee.twa';
export const CHROME_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/ringee-%E2%80%94-low-cost-outboun/hmgbaielacnpemblmoahpfdlnfdlmeel';
/** Short demo: driving Ringee from Claude over the MCP server. */
export const DEMO_VIDEO_ID = '5yjDOIjfBPM';
export const DEMO_VIDEO_URL = `https://www.youtube.com/watch?v=${DEMO_VIDEO_ID}`;
/** Public developer + content resources (live on their own subdomains). */
export const DOCS_URL = 'https://docs.ringee.io';
export const BLOG_URL = 'https://blog.ringee.io';
export const CLI_NPM_URL = 'https://www.npmjs.com/package/ringee';
export const SIGN_IN_URL = '/auth/sign-in';
export const SIGN_UP_URL = '/auth/sign-up';

/**
 * ISO timestamp used as a freshness signal across the site (schema
 * `dateModified` and the `article:modified_time` meta). Evaluated once when the
 * module loads, so it reflects the current build/deploy. Override with
 * `NEXT_PUBLIC_SITE_LAST_MODIFIED` (YYYY-MM-DD) to pin a specific content date.
 */
export const SITE_LAST_MODIFIED =
  process.env.NEXT_PUBLIC_SITE_LAST_MODIFIED ?? new Date().toISOString();

/**
 * Canonical off-site profiles for the Ringee entity. Used in `Organization`
 * structured data (`sameAs`) so AI engines can reconcile mentions to one entity.
 */
export const SAME_AS = [
  'https://x.com/ringeeio',
  'https://www.linkedin.com/company/ringee-io',
  GITHUB_ORG_URL,
  'https://www.reddit.com/r/ringee/',
  CLI_NPM_URL,
  IOS_APP_URL,
  ANDROID_APP_URL,
  CHROME_EXTENSION_URL,
  BLOG_URL
];

/** Short, repeated calls to action. */
export const CTA = {
  primary: { label: 'Start calling for free', href: SIGN_UP_URL },
  secondary: { label: 'View pricing', href: '/pricing' },
  login: { label: 'Log in', href: SIGN_IN_URL }
} as const;

/** Real, citable pricing facts. Used in copy and Product/Offer JSON-LD. */
export const PRICING = {
  freelancer: {
    name: 'Freelancer',
    price: 0,
    period: 'month',
    blurb:
      'Every Ringee feature for one person — automation, integrations, and AI included. No team, no campaigns.'
  },
  organization: {
    name: 'Organization',
    price: 20,
    period: 'month',
    blurb:
      'Everything in Freelancer plus a team: unlimited members and calling campaigns, one flat price.'
  }
} as const;

export type NavLink = { label: string; href: string; description?: string };

export type ProductMenuGroup = {
  title: string;
  blurb: string;
  links: NavLink[];
};

/**
 * Product mega-menu, grouped into the five Ringee capability categories.
 * Every href resolves to a real public route (some use in-page anchors on the
 * security page for the access/control items that have no dedicated page).
 */
export const PRODUCT_MENU: ProductMenuGroup[] = [
  {
    title: 'Communicate',
    blurb: 'Calls, campaigns, outcomes, callbacks, and meetings.',
    links: [
      {
        label: 'Outbound calling',
        href: '/features/outbound-calling',
        description: 'Browser-based international dialing'
      },
      {
        label: 'Campaigns',
        href: '/features/campaigns',
        description: 'Run shared team calling campaigns'
      },
      {
        label: 'Caller ID rotation',
        href: '/features/caller-id-rotation',
        description: 'Local-presence dialing for higher pickup'
      },
      {
        label: 'Call outcomes',
        href: '/features/call-outcomes',
        description: 'Log a result on every call'
      },
      {
        label: 'Callbacks',
        href: '/features/callbacks',
        description: 'Never miss a scheduled call-back'
      },
      {
        label: 'Meetings',
        href: '/features/meetings',
        description: 'Book and sync demos instantly'
      }
    ]
  },
  {
    title: 'Record & Learn',
    blurb: 'Record calls, transcribe conversations, review history.',
    links: [
      {
        label: 'Call recording',
        href: '/features/call-recording',
        description: 'Capture every conversation'
      },
      {
        label: 'Call transcription',
        href: '/features/call-transcription',
        description: 'Accurate, searchable transcripts'
      },
      {
        label: 'Call history',
        href: '/features/call-recording',
        description: 'Replay and audit past calls'
      },
      {
        label: 'Conversation review',
        href: '/features/call-transcription',
        description: 'Coach reps with real calls'
      }
    ]
  },
  {
    title: 'Automate',
    blurb: 'Drive outbound from ChatGPT, Claude, MCP agents, and the CLI.',
    links: [
      {
        label: 'AI call automation',
        href: '/features/ai-call-automation',
        description: 'Let agents drive your outbound'
      },
      {
        label: 'ChatGPT workflows',
        href: '/integrations/chatgpt',
        description: 'Dial straight from ChatGPT'
      },
      {
        label: 'Claude workflows',
        href: '/integrations/claude',
        description: 'Run Ringee inside Claude'
      },
      {
        label: 'MCP-compatible agents',
        href: '/integrations/mcp',
        description: 'Connect any MCP-based agent'
      },
      {
        label: 'CLI workflows',
        href: '/integrations/cli',
        description: 'Script calls from your terminal'
      }
    ]
  },
  {
    title: 'Sync',
    blurb: 'Connect lead sources, CRMs, and your calendar to your calling.',
    links: [
      {
        label: 'CRM sync',
        href: '/features/crm-sync',
        description: 'Keep your CRM in step'
      },
      {
        label: 'Apollo',
        href: '/integrations/apollo',
        description: 'Pull and enrich Apollo leads'
      },
      {
        label: 'Prospeo',
        href: '/integrations/prospeo',
        description: 'Enrich contacts with Prospeo'
      },
      {
        label: 'Attio',
        href: '/integrations/attio',
        description: 'Two-way Attio sync'
      },
      {
        label: 'Odoo',
        href: '/integrations/odoo',
        description: 'Connect your Odoo CRM'
      },
      {
        label: 'Google Calendar',
        href: '/integrations/google-calendar',
        description: 'Sync meetings to your calendar'
      }
    ]
  },
  {
    title: 'Control',
    blurb: 'Manage workspaces, teams, security, and hosting.',
    links: [
      {
        label: 'Workspace management',
        href: '/security#workspace-access',
        description: 'Personal and team workspaces'
      },
      {
        label: 'Team access',
        href: '/security#account-security',
        description: 'Control who can see what'
      },
      {
        label: 'Security',
        href: '/security',
        description: 'Encryption and access controls'
      },
      {
        label: 'Self-hosted option',
        href: '/self-hosted',
        description: 'Run Ringee on your own infra'
      }
    ]
  }
];

/** Top-level navigation, in order. "Product" renders the mega-menu above. */
export const MAIN_NAV: NavLink[] = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Use Cases', href: '/use-cases' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Apps', href: '/apps' },
  { label: 'Security', href: '/security' },
  { label: 'Open Source', href: '/open-source' }
];

export type FooterColumn = { title: string; links: NavLink[] };

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Outbound calling', href: '/features/outbound-calling' },
      { label: 'Campaigns', href: '/features/campaigns' },
      { label: 'Call recording', href: '/features/call-recording' },
      { label: 'Call transcription', href: '/features/call-transcription' },
      { label: 'Callbacks', href: '/features/callbacks' },
      { label: 'Meetings', href: '/features/meetings' },
      { label: 'AI call automation', href: '/features/ai-call-automation' },
      { label: 'Apps & extensions', href: '/apps' },
      { label: 'All features', href: '/features' }
    ]
  },
  {
    title: 'Integrations',
    links: [
      { label: 'Apollo', href: '/integrations/apollo' },
      { label: 'Prospeo', href: '/integrations/prospeo' },
      { label: 'Attio', href: '/integrations/attio' },
      { label: 'Odoo', href: '/integrations/odoo' },
      { label: 'Google Calendar', href: '/integrations/google-calendar' },
      { label: 'ChatGPT', href: '/integrations/chatgpt' },
      { label: 'Claude', href: '/integrations/claude' },
      { label: 'All integrations', href: '/integrations' }
    ]
  },
  {
    title: 'Use cases',
    links: [
      { label: 'SDR teams', href: '/use-cases/sdr-teams' },
      { label: 'Recruiters', href: '/use-cases/recruiters' },
      { label: 'Agencies', href: '/use-cases/agencies' },
      { label: 'Freelancers', href: '/use-cases/freelancers' },
      { label: 'Startups', href: '/use-cases/startups' },
      { label: 'Outbound sales', href: '/use-cases/outbound-sales' }
    ]
  },
  {
    title: 'Resources',
    links: [
      { label: 'Developer docs', href: DOCS_URL },
      { label: 'Blog', href: BLOG_URL },
      { label: 'CLI on npm', href: CLI_NPM_URL },
      { label: 'Chrome extension', href: CHROME_EXTENSION_URL },
      { label: 'iOS app', href: IOS_APP_URL },
      { label: 'Android app', href: ANDROID_APP_URL },
      { label: 'GitHub', href: GITHUB_URL }
    ]
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Alternatives', href: '/alternatives' },
      { label: 'Security', href: '/security' },
      { label: 'Open source', href: '/open-source' },
      { label: 'Self-hosted', href: '/self-hosted' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Support', href: '/support' }
    ]
  }
];
