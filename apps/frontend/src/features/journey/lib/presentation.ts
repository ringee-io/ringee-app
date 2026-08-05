import {
  IconPhone,
  IconPhonePlus,
  IconUsers,
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
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';

/**
 * Presentation-only mapping for the Journey.
 *
 * The backend decides *what* is true; this file decides only how it looks and
 * where a button goes. There is intentionally no threshold, no ordering rule
 * and no reward amount here — those live in the program definition, and the API
 * ships them with every response.
 *
 * Unknown ids degrade gracefully rather than throwing: the backend can publish
 * a new program version with new stages before this file catches up, and a
 * missing icon must never blank the page.
 */

export interface StagePresentation {
  Icon: ComponentType<IconProps>;
  /** Static Tailwind tokens — never string-concatenated, so JIT keeps them. */
  accent: string;
  tint: string;
  ring: string;
}

const FALLBACK: StagePresentation = {
  Icon: IconCompass,
  accent: 'text-sky-600 dark:text-sky-400',
  tint: 'bg-sky-500/10',
  ring: 'ring-sky-500/30'
};

const STAGE_PRESENTATION: Record<string, StagePresentation> = {
  // Personal ladder.
  foundation: {
    Icon: IconPhone,
    accent: 'text-sky-600 dark:text-sky-400',
    tint: 'bg-sky-500/10',
    ring: 'ring-sky-500/30'
  },
  consistent_caller: {
    Icon: IconPhonePlus,
    accent: 'text-violet-600 dark:text-violet-400',
    tint: 'bg-violet-500/10',
    ring: 'ring-violet-500/30'
  },
  connected_operator: {
    Icon: IconPlugConnected,
    accent: 'text-amber-600 dark:text-amber-400',
    tint: 'bg-amber-500/10',
    ring: 'ring-amber-500/30'
  },
  ai_closer: {
    Icon: IconSparkles,
    accent: 'text-fuchsia-600 dark:text-fuchsia-400',
    tint: 'bg-fuchsia-500/10',
    ring: 'ring-fuchsia-500/30'
  },
  agentic_operator: {
    Icon: IconRobot,
    accent: 'text-emerald-700 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/30'
  },
  // Organization ladder.
  workspace_ready: {
    Icon: IconPhone,
    accent: 'text-sky-600 dark:text-sky-400',
    tint: 'bg-sky-500/10',
    ring: 'ring-sky-500/30'
  },
  team_activated: {
    Icon: IconUsers,
    accent: 'text-violet-600 dark:text-violet-400',
    tint: 'bg-violet-500/10',
    ring: 'ring-violet-500/30'
  },
  campaign_operator: {
    Icon: IconSpeakerphone,
    accent: 'text-amber-600 dark:text-amber-400',
    tint: 'bg-amber-500/10',
    ring: 'ring-amber-500/30'
  },
  connected_sales_operation: {
    Icon: IconPlugConnected,
    accent: 'text-orange-600 dark:text-orange-400',
    tint: 'bg-orange-500/10',
    ring: 'ring-orange-500/30'
  },
  ai_sales_team: {
    Icon: IconSparkles,
    accent: 'text-fuchsia-600 dark:text-fuchsia-400',
    tint: 'bg-fuchsia-500/10',
    ring: 'ring-fuchsia-500/30'
  },
  advanced_operation: {
    Icon: IconShieldCheck,
    accent: 'text-emerald-700 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/30'
  }
};

export function stagePresentation(stageId: string): StagePresentation {
  return STAGE_PRESENTATION[stageId] ?? FALLBACK;
}

/** Where the recommended action for a requirement takes the user. */
const ACTION_ROUTES: Record<string, string> = {
  verify_phone: '/dashboard/profile',
  get_number: '/dashboard/numbers',
  make_call: '/dashboard/call',
  call_more_contacts: '/dashboard/call',
  import_contacts: '/dashboard/contact',
  log_outcomes: '/dashboard/activities',
  invite_team: '/dashboard/organization',
  create_campaign: '/dashboard/campaigns',
  work_campaign: '/dashboard/campaigns',
  connect_crm: '/dashboard/integrations',
  connect_calendar: '/dashboard/integrations',
  connect_custom_integration: '/dashboard/integrations',
  enable_transcription: '/dashboard/settings/recording',
  enable_ai_pipeline: '/dashboard/ai-pipelines',
  connect_mcp: '/dashboard/integrations',
  explore_capabilities: '/dashboard/integrations'
};

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
  enable_transcription: IconSparkles,
  enable_ai_pipeline: IconSparkles,
  connect_mcp: IconRobot,
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
