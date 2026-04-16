export type CrmProviderType = 'attio' | 'hubspot' | 'salesforce';
export type CrmConnectionScope = 'personal' | 'organization';
export type CrmConnectionStatus = 'active' | 'error' | 'revoked' | 'disconnected';
export type CrmSyncStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'needs_resolution';

export interface CrmConnectionSummary {
  id: string;
  provider: CrmProviderType;
  scope: CrmConnectionScope;
  status: CrmConnectionStatus;
  accountName: string | null;
  accountId: string;
  lastSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  pending: number;
  failed: number;
  needsResolution: number;
  done: number;
}

export interface CrmCallSyncRow {
  id: string;
  connectionId: string;
  provider: CrmProviderType;
  callId: string;
  status: CrmSyncStatus;
  idempotencyKey: string;
  externalActivityId: string | null;
  externalRecordId: string | null;
  externalRecordType: string | null;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PROVIDER_META: Record<
  CrmProviderType,
  { name: string; description: string; color: string; available: boolean }
> = {
  attio: {
    name: 'Attio',
    description:
      'Sync call activity, dispositions, recordings and notes to your Attio workspace.',
    color: 'bg-violet-500/15 text-violet-500 border-violet-500/20',
    available: true,
  },
  hubspot: {
    name: 'HubSpot',
    description: 'Coming soon — same playbook, different pipeline.',
    color: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
    available: false,
  },
  salesforce: {
    name: 'Salesforce',
    description: 'Coming soon — enterprise-grade sync with SFDC objects.',
    color: 'bg-sky-500/15 text-sky-500 border-sky-500/20',
    available: false,
  },
};
