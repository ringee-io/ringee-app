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
/** Public product roadmap and feature requests (Canny). */
export const ROADMAP_URL = 'https://ringee.canny.io/';
export const LINKEDIN_URL = 'https://www.linkedin.com/company/ringee-io';
/** Ringee's public Trustpilot profile, where customers leave a review. */
export const TRUSTPILOT_URL = 'https://www.trustpilot.com/review/ringee.io';

/**
 * Deep links into the developer docs. Marketing pages link to the docs section
 * that continues what the reader was just reading, never to the docs root —
 * landing on a generic index loses the thread. Keep these pointing at real
 * pages in the `ringee-io/docs` repo.
 */
const docsUrl = (path: string) => `${DOCS_URL}${path}`;
export const DOCS_DIALER_SDK_URL = docsUrl('/dialer-sdk/overview');
export const DOCS_DIALER_SDK_QUICKSTART_URL = docsUrl('/dialer-sdk/quickstart');
export const DOCS_MCP_URL = docsUrl('/mcp/overview');
export const DOCS_MCP_CONNECT_URL = docsUrl('/mcp/connect');
export const DOCS_MCP_APPS_URL = docsUrl('/mcp/apps');
export const DOCS_CLI_URL = docsUrl('/cli/overview');
export const DOCS_API_URL = docsUrl('/api/overview');
export const DOCS_INSTALL_URL = docsUrl('/installation/docker-compose');
export const CLI_NPM_URL = 'https://www.npmjs.com/package/ringee';
export const SDK_NPM_URL = 'https://www.npmjs.com/package/@ringee/dialer-sdk';
export const SIGN_IN_URL = '/auth/sign-in';
export const SIGN_UP_URL = '/auth/sign-up';
export const REQUEST_DEMO_URL = '/request-demo';

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
  LINKEDIN_URL,
  GITHUB_ORG_URL,
  'https://www.reddit.com/r/ringee/',
  CLI_NPM_URL,
  SDK_NPM_URL,
  IOS_APP_URL,
  ANDROID_APP_URL,
  CHROME_EXTENSION_URL,
  BLOG_URL
];

/** Short, repeated calls to action. */
export const CTA = {
  primary: { label: 'Get free access', href: REQUEST_DEMO_URL },
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
      'Human calling, automation, and integrations for one person. No team, campaigns, or AI voice agents.'
  },
  organization: {
    name: 'Organization',
    price: 20,
    period: 'month',
    blurb:
      'Everything in Freelancer plus unlimited members, calling campaigns, and AI voice agents, one flat subscription price.'
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
        label: 'Sales dialer',
        href: '/sales-dialer',
        description: 'Progressive and preview dialing for teams'
      },
      {
        label: 'Outbound calling',
        href: '/features/outbound-calling',
        description: 'Browser-based international dialing'
      },
      {
        label: 'Campaigns',
        href: '/features/campaigns',
        description: 'Progressive dialing campaigns for teams'
      },
      {
        label: 'Phone numbers',
        href: '/phone-numbers',
        description: 'Local, toll-free and mobile numbers by country'
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
    blurb: 'Orchestrate outbound and run AI-led phone conversations.',
    links: [
      {
        label: 'AI Voice Agents',
        href: '/ai-voice-agents',
        description: 'Agents that place calls and hold conversations'
      },
      {
        label: 'AI outbound calling',
        href: '/ai-voice-agents/outbound-calling',
        description: 'Agents that place your outbound calls'
      },
      {
        label: 'AI SDR',
        href: '/ai-voice-agents/ai-sdr',
        description: 'Calls leads, qualifies and books meetings'
      },
      {
        label: 'AI call automation',
        href: '/features/ai-call-automation',
        description: 'Automate human-led and AI-led workflows'
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
        label: 'Dialer SDK',
        href: '/dialer-sdk',
        description: 'Embed the dialer in your own app'
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
        label: 'Bring your own carrier',
        href: '/byoc',
        description: 'Keep your carrier and your numbers'
      },
      {
        label: 'Self-hosted option',
        href: '/self-hosted',
        description: 'Run Ringee on your own infra'
      }
    ]
  }
];

/**
 * Top-level navigation, in order. "Product" renders the mega-menu above.
 * The bar fits six links next to the menu at `xl`; Security lives in the
 * Product menu and the footer.
 */
export const MAIN_NAV: NavLink[] = [
  { label: 'AI Voice Agents', href: '/ai-voice-agents' },
  { label: 'Sales Dialer', href: '/sales-dialer' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Use Cases', href: '/use-cases' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Open Source', href: '/open-source' }
];

export type FooterColumn = { title: string; links: NavLink[] };

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'AI Voice Agents', href: '/ai-voice-agents' },
      {
        label: 'AI outbound calling',
        href: '/ai-voice-agents/outbound-calling'
      },
      { label: 'AI SDR', href: '/ai-voice-agents/ai-sdr' },
      { label: 'Sales dialer', href: '/sales-dialer' },
      { label: 'Phone numbers by country', href: '/phone-numbers' },
      { label: 'Bring your own carrier', href: '/byoc' },
      { label: 'Outbound calling', href: '/features/outbound-calling' },
      { label: 'Campaigns', href: '/features/campaigns' },
      { label: 'Call recording', href: '/features/call-recording' },
      { label: 'Call transcription', href: '/features/call-transcription' },
      { label: 'Callbacks', href: '/features/callbacks' },
      { label: 'Meetings', href: '/features/meetings' },
      { label: 'AI call automation', href: '/features/ai-call-automation' },
      { label: 'Dialer SDK', href: '/dialer-sdk' },
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
      { label: 'Roadmap', href: ROADMAP_URL },
      { label: 'CLI on npm', href: CLI_NPM_URL },
      { label: 'Dialer SDK on npm', href: SDK_NPM_URL },
      { label: 'Chrome extension', href: CHROME_EXTENSION_URL },
      { label: 'iOS app', href: IOS_APP_URL },
      { label: 'Android app', href: ANDROID_APP_URL },
      { label: 'GitHub', href: GITHUB_URL }
    ]
  },
  {
    title: 'Compare',
    links: [
      { label: 'vs Aircall', href: '/compare/aircall' },
      { label: 'vs Ringover', href: '/compare/ringover' },
      { label: 'vs JustCall', href: '/compare/justcall' },
      { label: 'vs Dapta', href: '/compare/dapta' },
      { label: 'Aircall alternatives', href: '/alternatives/aircall' },
      { label: 'All comparisons', href: '/alternatives' }
    ]
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Wall of love', href: '/wall-of-love' },
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

/** Spanish text for the canonical navigation; destinations and structure stay shared. */
const SITE_TEXT_ES: Record<string, string> = {
  'Ask AI': 'Pregunta a la IA',
  'Ask AI about this page': 'Pregunta a la IA sobre esta página',
  'Open it in your assistant, pre-filled and ready.':
    'Ábrela en tu asistente con la consulta preparada.',
  'Open in ChatGPT': 'Abrir en ChatGPT',
  'Read this page in ChatGPT': 'Lee esta página en ChatGPT',
  'Open in Claude': 'Abrir en Claude',
  'Read this page in Claude': 'Lee esta página en Claude',
  'Open in Gemini': 'Abrir en Gemini',
  'Copy the prompt and open Gemini': 'Copia la consulta y abre Gemini',
  'View as Markdown': 'Ver como Markdown',
  'Open a clean plain-text version': 'Abre una versión de texto sin formato',
  'Copy as Markdown': 'Copiar como Markdown',
  'Copy the page to your clipboard': 'Copia la página al portapapeles',
  'Prompt copied \u2014 paste it into Gemini':
    'Consulta copiada: pégala en Gemini',
  'Page copied as Markdown': 'Página copiada como Markdown',
  'Could not copy to clipboard': 'No se pudo copiar al portapapeles',
  'Preview Ringee Manual Dialer': 'Ver el marcador manual de Ringee',
  'Manual Dialer': 'Marcador manual',
  'Call any number instantly from Ringee.':
    'Llama al instante a cualquier número desde Ringee.',
  'Close preview': 'Cerrar vista previa',
  'Screen recording of the Ringee manual dialer placing a call':
    'Grabación del marcador manual de Ringee haciendo una llamada',

  'Get free access': 'Obtener acceso gratis',
  'View pricing': 'Ver precios',
  'Log in': 'Entrar',
  'AI Voice Agents': 'Agentes de voz con IA',
  'Sales Dialer': 'Marcador de ventas',
  Pricing: 'Precios',
  'Use Cases': 'Casos de uso',
  Integrations: 'Integraciones',
  'Open Source': 'Código abierto',
  Communicate: 'Comunicar',
  'Calls, campaigns, outcomes, callbacks, and meetings.':
    'Llamadas, campañas, resultados, devoluciones de llamada y reuniones.',
  'Sales dialer': 'Marcador de ventas',
  'Progressive and preview dialing for teams':
    'Marcación progresiva y preview para equipos',
  'Outbound calling': 'Llamadas salientes',
  'Browser-based international dialing':
    'Llamadas internacionales desde el navegador',
  Campaigns: 'Campañas',
  'Progressive dialing campaigns for teams':
    'Campañas de marcación progresiva para equipos',
  'Phone numbers': 'Números virtuales',
  'Local, toll-free and mobile numbers by country':
    'Números locales, gratuitos y móviles por país',
  'Caller ID rotation': 'Rotación del identificador',
  'Local-presence dialing for higher pickup':
    'Presencia local para recibir más respuestas',
  'Call outcomes': 'Resultados de llamadas',
  'Log a result on every call': 'Registra un resultado en cada llamada',
  Callbacks: 'Devoluciones de llamada',
  'Never miss a scheduled call-back': 'No pierdas una llamada programada',
  Meetings: 'Reuniones',
  'Book and sync demos instantly': 'Agenda y sincroniza demos al instante',
  'Record & Learn': 'Grabar y aprender',
  'Record calls, transcribe conversations, review history.':
    'Graba llamadas, transcribe conversaciones y revisa el historial.',
  'Call recording': 'Grabación de llamadas',
  'Capture every conversation': 'Guarda cada conversación',
  'Call transcription': 'Transcripción de llamadas',
  'Accurate, searchable transcripts':
    'Transcripciones precisas que puedes buscar',
  'Call history': 'Historial de llamadas',
  'Replay and audit past calls': 'Escucha y revisa llamadas anteriores',
  'Conversation review': 'Revisión de conversaciones',
  'Coach reps with real calls':
    'Forma a tus representantes con llamadas reales',
  Automate: 'Automatizar',
  'Orchestrate outbound and run AI-led phone conversations.':
    'Organiza llamadas salientes y conversaciones telefónicas con IA.',
  'Agents that place calls and hold conversations':
    'Agentes que llaman y mantienen conversaciones',
  'AI outbound calling': 'Llamadas salientes con IA',
  'Agents that place your outbound calls':
    'Agentes que hacen tus llamadas salientes',
  'AI SDR': 'SDR con IA',
  'Calls leads, qualifies and books meetings':
    'Llama a prospectos, cualifica y agenda reuniones',
  'AI call automation': 'Automatización de llamadas con IA',
  'Automate human-led and AI-led workflows':
    'Automatiza flujos de llamadas humanas y de IA',
  'ChatGPT workflows': 'Flujos con ChatGPT',
  'Dial straight from ChatGPT': 'Llama directamente desde ChatGPT',
  'Claude workflows': 'Flujos con Claude',
  'Run Ringee inside Claude': 'Usa Ringee dentro de Claude',
  'MCP-compatible agents': 'Agentes compatibles con MCP',
  'Connect any MCP-based agent': 'Conecta cualquier agente basado en MCP',
  'CLI workflows': 'Flujos con CLI',
  'Script calls from your terminal': 'Programa llamadas desde tu terminal',
  Sync: 'Sincronizar',
  'Connect lead sources, CRMs, and your calendar to your calling.':
    'Conecta fuentes de prospectos, CRM y calendario con tus llamadas.',
  'CRM sync': 'Sincronización del CRM',
  'Keep your CRM in step': 'Mantén tu CRM actualizado',
  'Dialer SDK': 'SDK del marcador',
  'Embed the dialer in your own app': 'Integra el marcador en tu propia app',
  Apollo: 'Apollo',
  'Pull and enrich Apollo leads': 'Incorpora y enriquece prospectos de Apollo',
  Prospeo: 'Prospeo',
  'Enrich contacts with Prospeo': 'Enriquece contactos con Prospeo',
  Attio: 'Attio',
  'Two-way Attio sync': 'Sincronización bidireccional con Attio',
  Odoo: 'Odoo',
  'Connect your Odoo CRM': 'Conecta tu CRM de Odoo',
  'Google Calendar': 'Google Calendar',
  'Sync meetings to your calendar':
    'Sincroniza las reuniones con tu calendario',
  Control: 'Control',
  'Manage workspaces, teams, security, and hosting.':
    'Gestiona espacios de trabajo, equipos, seguridad y alojamiento.',
  'Workspace management': 'Gestión de espacios de trabajo',
  'Personal and team workspaces': 'Espacios personales y de equipo',
  'Team access': 'Acceso del equipo',
  'Control who can see what': 'Controla quién puede ver cada recurso',
  Security: 'Seguridad',
  'Encryption and access controls': 'Cifrado y controles de acceso',
  'Bring your own carrier': 'Conecta tu operador (BYOC)',
  'Keep your carrier and your numbers': 'Conserva tu operador y tus números',
  'Self-hosted option': 'Alojamiento propio',
  'Run Ringee on your own infra': 'Ejecuta Ringee en tu infraestructura',
  Product: 'Producto',
  'Phone numbers by country': 'Números virtuales por país',
  'Apps & extensions': 'Apps y extensiones',
  'All features': 'Todas las funciones',
  ChatGPT: 'ChatGPT',
  Claude: 'Claude',
  'All integrations': 'Todas las integraciones',
  'Use cases': 'Casos de uso',
  'SDR teams': 'Equipos SDR',
  Recruiters: 'Reclutadores',
  Agencies: 'Agencias',
  Freelancers: 'Profesionales independientes',
  Startups: 'Startups',
  'Outbound sales': 'Ventas por teléfono',
  Resources: 'Recursos',
  'Developer docs': 'Documentación para desarrolladores',
  Blog: 'Blog',
  Roadmap: 'Hoja de ruta',
  'CLI on npm': 'CLI en npm',
  'Dialer SDK on npm': 'SDK del marcador en npm',
  'Chrome extension': 'Extensión de Chrome',
  'iOS app': 'App de iOS',
  'Android app': 'App de Android',
  GitHub: 'GitHub',
  Compare: 'Comparar',
  'vs Aircall': 'vs Aircall',
  'vs Ringover': 'vs Ringover',
  'vs JustCall': 'vs JustCall',
  'vs Dapta': 'vs Dapta',
  'Aircall alternatives': 'Alternativas a Aircall',
  'All comparisons': 'Todas las comparativas',
  Company: 'Empresa',
  About: 'Quiénes somos',
  'Wall of love': 'Opiniones',
  Alternatives: 'Alternativas',
  'Open source': 'Código abierto',
  'Self-hosted': 'Alojamiento propio',
  Privacy: 'Privacidad',
  Terms: 'Condiciones',
  Support: 'Soporte',
  'Toggle color theme': 'Cambiar tema de color',
  'Open menu': 'Abrir menú',
  'Close menu': 'Cerrar menú',
  Primary: 'Navegación principal',
  'Ringee home': 'Inicio de Ringee',
  'Ringee on GitHub': 'Ringee en GitHub',
  'Ringee on X': 'Ringee en X',
  'Ringee on Reddit': 'Ringee en Reddit',
  'Open calling infrastructure for human teams and AI voice agents.':
    'Infraestructura abierta de llamadas para equipos y agentes de voz con IA.',
  'One calling stack for humans and AI.':
    'Una plataforma de llamadas para personas e IA.'
};

export function siteText(text: string, locale: 'en' | 'es'): string {
  return locale === 'es' ? (SITE_TEXT_ES[text] ?? text) : text;
}
