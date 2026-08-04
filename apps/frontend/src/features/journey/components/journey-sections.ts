import type { ComponentType } from 'react';
import {
  IconLayoutDashboard,
  IconRoute,
  IconChecklist,
  IconWaveSine,
  IconPlugConnected,
  type IconProps
} from '@tabler/icons-react';

/** The focused views inside Journey — each owns exactly one question. */
export type JourneySection =
  | 'overview'
  | 'actions'
  | 'milestones'
  | 'activity'
  | 'stack';

export interface JourneySectionMeta {
  id: JourneySection;
  label: string;
  /** One-line hint under the label in the secondary sidebar. */
  description: string;
  Icon: ComponentType<IconProps>;
}

export const JOURNEY_SECTIONS: JourneySectionMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'The short version',
    Icon: IconLayoutDashboard
  },
  {
    id: 'actions',
    label: 'What to do next',
    description: 'Your prioritized moves',
    Icon: IconRoute
  },
  {
    id: 'milestones',
    label: 'Milestones',
    description: 'Everything we look at',
    Icon: IconChecklist
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Calls, channels & results',
    Icon: IconWaveSine
  },
  {
    id: 'stack',
    label: 'Connected stack',
    description: 'CRM, calendar, agents',
    Icon: IconPlugConnected
  }
];

export const DEFAULT_JOURNEY_SECTION: JourneySection = 'overview';

export function isJourneySection(value: unknown): value is JourneySection {
  return JOURNEY_SECTIONS.some((s) => s.id === value);
}
