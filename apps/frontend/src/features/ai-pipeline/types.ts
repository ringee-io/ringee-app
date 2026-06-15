export type ContextDescriptor =
  | { type: 'campaign'; campaignId: string }
  | { type: 'organization_outside_campaign' }
  | { type: 'personal' };

export interface ActivationRow {
  contextKey: string;
  contextType: 'campaign' | 'organization_outside_campaign' | 'personal';
  label: string;
  descriptor: ContextDescriptor;
  enabled: boolean;
  newEligibleSinceLastRun: number;
  lastRunAt: string | null;
  pendingActionCount: number;
  lastConfidence: string | null;
}

export interface ActivationSummary {
  pipeline: {
    type: string;
    name: string;
    valueProposition: string;
    detailRoute: string;
    implemented: boolean;
  };
  campaigns: ActivationRow[];
  organization: ActivationRow | null;
  personal: ActivationRow;
}

export interface RunPreview {
  enabled: boolean;
  isRunning: boolean;
  eligibleCount: number;
  newEligibleSinceLastRun: number;
  estimatedConfidence: 'low' | 'medium' | 'high';
  lowData: boolean;
  lastRunAt: string | null;
}

export function allRows(summary: ActivationSummary): ActivationRow[] {
  return [
    ...summary.campaigns,
    ...(summary.organization ? [summary.organization] : []),
    summary.personal
  ];
}
