/**
 * The product videos in `public/videos`, one entry per rendered video.
 *
 * Each video is four files side by side: `<src>.webm` (VP9 + Opus, 1080p),
 * `<src>.mp4` (H.264 + AAC, 1080p), `<src>-720p.mp4` for small screens and
 * `<src>-poster.jpg`. They are rendered from code, so new copy or a new price
 * means a new render under the same name. Bump `version` when that happens: it
 * is appended to every URL, and `next.config.ts` caches the poster, like every
 * image, as immutable for a year.
 *
 * A page shows only a video in its own language: English pages use the files
 * in `/videos` and `/videos/en`, the Spanish editions those in `/videos/es`.
 * Every claim a video makes must be true in the product today, the same rule
 * as the page copy around it.
 */
export type MarketingVideo = {
  /** Path from the site root, without the extension. */
  src: string;
  /** Render date of the files on disk (YYYY-MM-DD). */
  version: string;
  /** What the video shows, in its own language: the player's accessible name. */
  label: string;
};

export const MARKETING_VIDEOS = {
  'ringee-features': {
    src: '/videos/ringee-features',
    version: '2026-09-26',
    label:
      'Ringee in 15 seconds: browser calling to 180+ countries, campaigns, recording and transcription, AI voice agents, and control from your AI assistant'
  },
  'international-calls': {
    src: '/videos/en/ringee-international-calls',
    version: '2026-09-27',
    label:
      'International calls from the browser, paid per minute from prepaid credit'
  },
  'campaigns-progressive-dialer': {
    src: '/videos/en/ringee-campaigns-progressive-dialer',
    version: '2026-09-27',
    label:
      'Importing leads, launching a campaign and working the queue with the progressive dialer'
  },
  'built-for-agents': {
    src: '/videos/en/ringee-built-for-agents',
    version: '2026-09-27',
    label:
      'AI agents working with Ringee calls, recordings and transcripts through MCP, the ChatGPT app, the CLI and webhooks'
  },
  'bring-your-own-carrier': {
    src: '/videos/en/ringee-bring-your-own-carrier',
    version: '2026-09-27',
    label:
      'Connecting your carrier or PBX to Ringee as a SIP extension and calling through it'
  },
  'numbers-caller-id': {
    src: '/videos/en/ringee-numbers-caller-id',
    version: '2026-09-27',
    label:
      'Local numbers in every market, automatic caller ID rotation and a daily call cap per number'
  },
  // Not on a page: its AI receptionist books a demo on an inbound call, and a
  // receptionist cannot book meetings (AGENT-016). Needs a re-render first.
  'your-carrier-all-of-ringee': {
    src: '/videos/en/ringee-your-carrier-all-of-ringee',
    version: '2026-09-27',
    label:
      'Your carrier connected to Ringee, with the progressive dialer, AI voice agents and calling from web, mobile and Chrome'
  },

  // Not on a page yet: there is no Spanish edition of international calling.
  'llamadas-internacionales': {
    src: '/videos/es/ringee-llamadas-internacionales',
    version: '2026-09-26',
    label:
      'Llamadas internacionales desde el navegador, pagadas por minuto con saldo prepago'
  },
  'campanas-marcador-progresivo': {
    src: '/videos/es/ringee-campanas-marcador-progresivo',
    version: '2026-09-26',
    label:
      'Importar prospectos, lanzar una campaña y trabajar la cola con el marcador progresivo'
  },
  // Not on a page yet: there is no Spanish edition of AI call automation.
  'hecho-para-agentes': {
    src: '/videos/es/ringee-hecho-para-agentes',
    version: '2026-09-26',
    label:
      'Agentes de IA que usan las llamadas, grabaciones y transcripciones de Ringee mediante MCP, la app de ChatGPT, la CLI y webhooks'
  },
  'trae-tu-operador': {
    src: '/videos/es/ringee-trae-tu-operador',
    version: '2026-09-26',
    label:
      'Conectar tu operador o centralita a Ringee como extensión SIP y llamar a través de él'
  },
  'numeros-caller-id': {
    src: '/videos/es/ringee-numeros-caller-id',
    version: '2026-09-26',
    label:
      'Números locales en cada mercado, rotación automática del identificador de llamada y un límite diario de llamadas por número'
  },
  // Not on a page, for the same reason as `your-carrier-all-of-ringee`.
  'operador-todo-ringee': {
    src: '/videos/es/ringee-operador-todo-ringee',
    version: '2026-09-26',
    label:
      'Tu operador conectado a Ringee, con marcador progresivo, agentes de voz con IA y llamadas desde la web, el móvil y Chrome'
  }
} satisfies Record<string, MarketingVideo>;

export type MarketingVideoId = keyof typeof MARKETING_VIDEOS;
