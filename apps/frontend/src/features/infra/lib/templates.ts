import {
  IconUser,
  IconUsersGroup,
  IconBriefcase,
  IconBuilding,
  IconDeviceLandlinePhone,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import type { InfrastructureResourceType } from '../types';

/**
 * Quick-start scenarios shown in the empty state. Minimal by design: a template
 * doesn't auto-build a graph — it opens the most sensible first create flow and
 * lets the setup checklist guide the rest. The UI is ready to grow into full
 * multi-resource templates later without changing these call sites.
 */
export interface InfraTemplate {
  id: string;
  label: string;
  blurb: string;
  Icon: ComponentType<IconProps>;
  /** Create flow to open first (null → link an existing resource). */
  firstAdd: InfrastructureResourceType | null;
  /** Scenarios that only make sense with a team. */
  orgOnly?: boolean;
}

export const INFRA_TEMPLATES: InfraTemplate[] = [
  {
    id: 'solo',
    label: 'Solo founder',
    blurb: 'One number, your device, start dialing.',
    Icon: IconUser,
    firstAdd: 'PHONE_NUMBER'
  },
  {
    id: 'sales',
    label: 'Small sales team',
    blurb: 'Agents, a number and an outbound campaign.',
    Icon: IconUsersGroup,
    firstAdd: 'CAMPAIGN',
    orgOnly: true
  },
  {
    id: 'recruiting',
    label: 'Recruiting team',
    blurb: 'A team calling candidates from one campaign.',
    Icon: IconBriefcase,
    firstAdd: 'CAMPAIGN',
    orgOnly: true
  },
  {
    id: 'agency',
    label: 'Agency outbound',
    blurb: 'Campaigns with rotating caller IDs.',
    Icon: IconBuilding,
    firstAdd: 'CAMPAIGN',
    orgOnly: true
  },
  {
    id: 'desk',
    label: 'Desk phone setup',
    blurb: 'Connect a physical desk phone over SIP.',
    Icon: IconDeviceLandlinePhone,
    firstAdd: 'SIP_DEVICE'
  }
];

export function templatesForScope(hasOrg: boolean): InfraTemplate[] {
  return INFRA_TEMPLATES.filter((t) => hasOrg || !t.orgOnly);
}
