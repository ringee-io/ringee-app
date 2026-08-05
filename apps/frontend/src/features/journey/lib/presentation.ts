import {
  IconPhone,
  IconPhonePlus,
  IconUsers,
  IconUsersGroup,
  IconSpeakerphone,
  IconPlugConnected,
  IconCalendarEvent,
  IconSparkles,
  IconRobot,
  IconAddressBook,
  IconClipboardCheck,
  IconShieldCheck,
  IconWebhook,
  IconCompass,
  IconChartLine,
  IconTargetArrow,
  IconRepeat,
  IconArrowsShuffle,
  IconLink,
  IconPhoneIncoming,
  IconDeviceLandlinePhone,
  IconPhoneCall,
  IconUserSearch,
  IconLayoutGrid,
  IconBolt,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import type { JourneyTrackId } from '../types';

/**
 * Presentation-only mapping for the Journey.
 *
 * The backend decides *what* is true; this file decides only how it looks and
 * where a button goes. There is intentionally no threshold, no dependency rule,
 * no completion rule and no reward amount here — those live in the program
 * definition, and the API ships them with every response.
 *
 * Unknown ids degrade gracefully rather than throwing: the backend can publish
 * a new program version with new nodes before this app catches up, and a
 * missing icon must never blank the page.
 */

export interface TrackPresentation {
  Icon: ComponentType<IconProps>;
  /** Static Tailwind tokens — never string-concatenated, so JIT keeps them. */
  accent: string;
  tint: string;
  ring: string;
  /** The SVG edge colour for this track, as a CSS custom property value. */
  stroke: string;
  /** Solid fill for a completed node. */
  fill: string;
}

const FALLBACK_TRACK: TrackPresentation = {
  Icon: IconCompass,
  accent: 'text-sky-600 dark:text-sky-400',
  tint: 'bg-sky-500/10',
  ring: 'ring-sky-500/40',
  stroke: 'var(--color-sky-500)',
  fill: 'bg-sky-600'
};

/**
 * One accent per track. Reuses the palette the v2 stage cards already used, so
 * the graph does not introduce a second visual language into the dashboard.
 */
const TRACK_PRESENTATION: Record<JourneyTrackId, TrackPresentation> = {
  core: {
    Icon: IconPhone,
    accent: 'text-sky-600 dark:text-sky-400',
    tint: 'bg-sky-500/10',
    ring: 'ring-sky-500/40',
    stroke: 'var(--color-sky-500)',
    fill: 'bg-sky-600'
  },
  team: {
    Icon: IconUsers,
    accent: 'text-violet-600 dark:text-violet-400',
    tint: 'bg-violet-500/10',
    ring: 'ring-violet-500/40',
    stroke: 'var(--color-violet-500)',
    fill: 'bg-violet-600'
  },
  campaigns: {
    Icon: IconSpeakerphone,
    accent: 'text-amber-600 dark:text-amber-400',
    tint: 'bg-amber-500/10',
    ring: 'ring-amber-500/40',
    stroke: 'var(--color-amber-500)',
    fill: 'bg-amber-600'
  },
  integrations: {
    Icon: IconPlugConnected,
    accent: 'text-orange-600 dark:text-orange-400',
    tint: 'bg-orange-500/10',
    ring: 'ring-orange-500/40',
    stroke: 'var(--color-orange-500)',
    fill: 'bg-orange-600'
  },
  ai: {
    Icon: IconSparkles,
    accent: 'text-fuchsia-600 dark:text-fuchsia-400',
    tint: 'bg-fuchsia-500/10',
    ring: 'ring-fuchsia-500/40',
    stroke: 'var(--color-fuchsia-500)',
    fill: 'bg-fuchsia-600'
  },
  automation: {
    Icon: IconBolt,
    accent: 'text-emerald-700 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/40',
    stroke: 'var(--color-emerald-500)',
    fill: 'bg-emerald-600'
  },
  inbound: {
    Icon: IconPhoneIncoming,
    accent: 'text-teal-600 dark:text-teal-400',
    tint: 'bg-teal-500/10',
    ring: 'ring-teal-500/40',
    stroke: 'var(--color-teal-500)',
    fill: 'bg-teal-600'
  }
};

export function trackPresentation(trackId: string): TrackPresentation {
  return TRACK_PRESENTATION[trackId as JourneyTrackId] ?? FALLBACK_TRACK;
}

/** Per-node icon. Falls back to the track icon, then to a compass. */
const NODE_ICONS: Record<string, ComponentType<IconProps>> = {
  'core.setup': IconPhonePlus,
  'core.first_call': IconPhoneCall,
  'core.rhythm': IconChartLine,
  'core.discipline': IconClipboardCheck,
  'core.scale': IconTargetArrow,

  'team.joined': IconUsers,
  'team.calling': IconUsersGroup,
  'team.coverage': IconShieldCheck,

  'campaigns.first': IconSpeakerphone,
  'campaigns.pipeline': IconAddressBook,
  'campaigns.repeatable': IconRepeat,

  'integrations.crm': IconPlugConnected,
  'integrations.calendar': IconCalendarEvent,
  'integrations.enrichment': IconUserSearch,
  'integrations.custom': IconWebhook,
  'integrations.connected': IconLayoutGrid,

  'ai.transcription': IconSparkles,
  'ai.insights': IconSparkles,
  'ai.team_adoption': IconUsersGroup,

  'automation.callbacks': IconPhoneCall,
  'automation.rotation': IconArrowsShuffle,
  'automation.sessions': IconLink,
  'automation.agents': IconRobot,
  'automation.breadth': IconLayoutGrid,

  'inbound.routing': IconPhoneIncoming,
  'inbound.desk_phones': IconDeviceLandlinePhone,
  'inbound.recovery': IconPhoneCall
};

export function nodeIcon(
  nodeId: string,
  trackId: string
): ComponentType<IconProps> {
  return NODE_ICONS[nodeId] ?? trackPresentation(trackId).Icon;
}

/**
 * Where the recommended action for a requirement takes the user.
 *
 * Every entry is a route that exists. v2 shipped five that did not —
 * `/dashboard/numbers`, `/dashboard/organization`, `/dashboard/integrations`,
 * `/dashboard/ai-pipelines` and `/dashboard/settings/recording` all 404'd — so
 * `journey.routes.spec.ts` now asserts this map against the App Router tree.
 */
const ACTION_ROUTES: Record<string, string> = {
  verify_phone: '/dashboard/profile',
  get_number: '/dashboard/buy-number',
  make_call: '/dashboard/call',
  call_more_contacts: '/dashboard/call',
  import_contacts: '/dashboard/contact',
  log_outcomes: '/dashboard/activities',
  invite_team: '/dashboard/settings/team',
  create_campaign: '/dashboard/campaigns',
  work_campaign: '/dashboard/campaigns',
  connect_crm: '/dashboard/settings/integrations',
  connect_calendar: '/dashboard/settings/integrations',
  connect_custom_integration: '/dashboard/settings/integrations',
  enrich_leads: '/dashboard/contact',
  // Recording and transcription settings live on the settings overview.
  enable_transcription: '/dashboard/settings/overview',
  enable_ai_pipeline: '/dashboard/ai-pipeline',
  connect_mcp: '/dashboard/settings/integrations',
  work_callbacks: '/dashboard/callbacks',
  enable_rotation: '/dashboard/number-rotation',
  create_call_session: '/dashboard/call',
  configure_inbound: '/dashboard/desk-phones',
  setup_desk_phone: '/dashboard/desk-phones',
  explore_capabilities: '/dashboard/settings/integrations'
};

/** Every route the Journey can send a user to. Used by the route contract test. */
export const JOURNEY_ACTION_ROUTES = ACTION_ROUTES;

export function actionRoute(actionKey: string): string {
  return ACTION_ROUTES[actionKey] ?? '/dashboard/overview';
}

const ACTION_ICONS: Record<string, ComponentType<IconProps>> = {
  verify_phone: IconShieldCheck,
  get_number: IconPhonePlus,
  make_call: IconPhone,
  call_more_contacts: IconPhone,
  import_contacts: IconAddressBook,
  log_outcomes: IconClipboardCheck,
  invite_team: IconUsers,
  create_campaign: IconSpeakerphone,
  work_campaign: IconSpeakerphone,
  connect_crm: IconPlugConnected,
  connect_calendar: IconCalendarEvent,
  connect_custom_integration: IconWebhook,
  enrich_leads: IconUserSearch,
  enable_transcription: IconSparkles,
  enable_ai_pipeline: IconSparkles,
  connect_mcp: IconRobot,
  work_callbacks: IconPhoneCall,
  enable_rotation: IconArrowsShuffle,
  create_call_session: IconLink,
  configure_inbound: IconPhoneIncoming,
  setup_desk_phone: IconDeviceLandlinePhone,
  explore_capabilities: IconCompass
};

export function actionIcon(actionKey: string): ComponentType<IconProps> {
  return ACTION_ICONS[actionKey] ?? IconCompass;
}

/** Cents → a locale-formatted currency string. */
export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}
