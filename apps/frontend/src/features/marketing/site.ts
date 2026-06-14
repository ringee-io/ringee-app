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
export const IOS_APP_URL = 'https://apps.apple.com/app/ringee-app/id6773448247';
export const SIGN_IN_URL = '/auth/sign-in';
export const SIGN_UP_URL = '/auth/sign-up';

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
    blurb: 'For solo operators calling on their own — no team, no campaigns.'
  },
  organization: {
    name: 'Organization',
    price: 20,
    period: 'month',
    blurb:
      'Work as a team and run calling campaigns. Unlimited users, one flat price.'
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
    blurb: 'Calls, campaigns, outcomes, notes, and callbacks.',
    links: [
      { label: 'Outbound calling', href: '/features/outbound-calling' },
      { label: 'Campaigns', href: '/features/campaigns' },
      { label: 'Call outcomes', href: '/features/call-outcomes' },
      { label: 'Notes', href: '/features/call-outcomes' },
      { label: 'Callbacks', href: '/features/callbacks' }
    ]
  },
  {
    title: 'Record & Learn',
    blurb: 'Record calls, transcribe conversations, review history.',
    links: [
      { label: 'Call recording', href: '/features/call-recording' },
      { label: 'Call transcription', href: '/features/call-transcription' },
      { label: 'Call history', href: '/features/call-recording' },
      { label: 'Conversation review', href: '/features/call-transcription' }
    ]
  },
  {
    title: 'Automate',
    blurb: 'Drive outbound from ChatGPT, Claude, MCP agents, and the CLI.',
    links: [
      { label: 'AI call automation', href: '/features/ai-call-automation' },
      { label: 'ChatGPT workflows', href: '/integrations/chatgpt' },
      { label: 'Claude workflows', href: '/integrations/claude' },
      { label: 'MCP-compatible agents', href: '/integrations/mcp' },
      { label: 'CLI workflows', href: '/integrations/cli' }
    ]
  },
  {
    title: 'Sync',
    blurb: 'Connect lead sources and CRMs to your calling.',
    links: [
      { label: 'CRM sync', href: '/features/crm-sync' },
      { label: 'Apollo', href: '/integrations/apollo' },
      { label: 'Prospeo', href: '/integrations/prospeo' },
      { label: 'Attio', href: '/integrations/attio' },
      { label: 'Odoo', href: '/integrations/odoo' }
    ]
  },
  {
    title: 'Control',
    blurb: 'Manage workspaces, teams, security, and hosting.',
    links: [
      { label: 'Workspace management', href: '/security#workspace-access' },
      { label: 'Team access', href: '/security#account-security' },
      { label: 'Security', href: '/security' },
      { label: 'Self-hosted option', href: '/self-hosted' }
    ]
  }
];

/** Top-level navigation, in order. "Product" renders the mega-menu above. */
export const MAIN_NAV: NavLink[] = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Use Cases', href: '/use-cases' },
  { label: 'Integrations', href: '/integrations' },
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
      { label: 'AI call automation', href: '/features/ai-call-automation' },
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
    title: 'Company',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Security', href: '/security' },
      { label: 'Open source', href: '/open-source' },
      { label: 'Self-hosted', href: '/self-hosted' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Support', href: '/support' }
    ]
  }
];
