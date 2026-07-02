import type { ComponentType } from 'react';
import {
  IconLayoutDashboard,
  IconActivityHeartbeat,
  IconShieldCheck,
  IconCoin,
  IconStack2,
  type IconProps
} from '@tabler/icons-react';

/** The five first-class views inside Usage — each owns one concern. */
export type UsageSection =
  | 'overview'
  | 'performance'
  | 'health'
  | 'cost'
  | 'resource';

export interface UsageSectionMeta {
  id: UsageSection;
  label: string;
  /** One-line hint shown under the label in the secondary sidebar. */
  description: string;
  Icon: ComponentType<IconProps>;
}

export const USAGE_SECTIONS: UsageSectionMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'The executive summary',
    Icon: IconLayoutDashboard
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'How calls are doing',
    Icon: IconActivityHeartbeat
  },
  {
    id: 'health',
    label: 'Operational health',
    description: 'Things to fix',
    Icon: IconShieldCheck
  },
  {
    id: 'cost',
    label: 'Cost & billing',
    description: 'Spend & minutes',
    Icon: IconCoin
  },
  {
    id: 'resource',
    label: 'By resource',
    description: 'Usage per resource',
    Icon: IconStack2
  }
];

export const DEFAULT_USAGE_SECTION: UsageSection = 'overview';

/** Filters are only meaningful on the range/resource-driven views. */
export function sectionUsesFilters(section: UsageSection): boolean {
  return section !== 'health';
}
