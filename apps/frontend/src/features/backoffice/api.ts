'use client';

import { useMemo } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { RealtimeDevice } from '@ringee/frontend-shared/realtime';

export type { RealtimeDevice };

export type AccountType = 'user' | 'org';

export type PipelineType =
  | 'follow_up_recommendations'
  | 'script_optimization'
  | 'objection_intelligence';

export interface CallerActivityRow {
  id: string;
  type: AccountType;
  name: string;
  email: string | null;
  calls: number;
  answered: number;
  totalCost: number;
  totalDurationSec: number;
  lastCallAt: string | null;
}

export interface BackofficeDashboard {
  range: { start: string; end: string };
  totals: {
    calls: number;
    totalCost: number;
    users: number;
    organizations: number;
  };
  users: CallerActivityRow[];
  organizations: CallerActivityRow[];
}

export interface AccountListItem {
  id: string;
  type: AccountType;
  name: string;
  email: string | null;
  slug: string | null;
  creditBalance: number;
  numbersCount: number;
  callsCount: number;
  recordAllCalls: boolean;
  transcribeRealtime: boolean;
  transcribeRecordings: boolean;
  aiPipelineEnabled: boolean;
  createdAt: string;
}

export interface AccountListResult {
  items: AccountListItem[];
  total: number;
}

export interface AssignedNumber {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  status: string | null;
}

export interface PipelineFlag {
  type: PipelineType;
  name: string;
  implemented: boolean;
  enabled: boolean;
}

export interface AccountDetail extends AccountListItem {
  numbers: AssignedNumber[];
  pipelines: PipelineFlag[];
  userSettings: UserGeneralSettings | null;
}

export interface UserGeneralSettings {
  canCall: boolean;
  minimumCreditPurchase: number;
  freeCallTrial: boolean;
  numberPurchaseLimit: number | null;
  phoneRequired: boolean;
  access: UserAccessAdminState;
}

export type EditableUserGeneralSettings = Omit<UserGeneralSettings, 'access'>;

export interface UserAccessAdminState {
  ringeeBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  canCall: boolean;
  clerkBanned: boolean | null;
}

/** What a ban / forced disconnect actually did, reported back to the admin. */
export interface EnforcementResult {
  calls: {
    callIds: string[];
    terminated: number;
    withoutControlId: number;
    failed: number;
  };
  devicesNotified: number;
  sessionsDisabled: number;
}

export interface UserAccessEnforcementResponse {
  access: UserAccessAdminState;
  enforcement: EnforcementResult;
}

export interface NumberListItem {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  status: string | null;
  assigned: boolean;
  userId: string | null;
  organizationId: string | null;
}

export interface RecordingSettings {
  recordAllCalls: boolean;
  transcribeRealtime: boolean;
  transcribeRecordings: boolean;
}

// ── Campaign analytics ───────────────────────────────────────

export type CampaignSortKey =
  | 'attempts'
  | 'cost'
  | 'connected'
  | 'conversions'
  | 'leads'
  | 'created'
  | 'lastActivity'
  | 'name';

export type CampaignStatusFilter =
  | 'all'
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed';

/** Rates are already percentages (0-100); cost figures are absolute money. */
export interface CampaignMetrics {
  attempts: number;
  connected: number;
  conversions: number;
  uniqueLeadsDialed: number;
  talkSec: number;
  cost: number;
  contactRate: number;
  conversionRate: number;
  avgHandleTimeSec: number;
  costPerAttempt: number;
  costPerConnect: number;
  costPerConversion: number;
}

export interface CampaignListItem extends CampaignMetrics {
  id: string;
  name: string;
  status: string;
  dialerMode: string;
  createdAt: string;
  isNew: boolean;
  lastActivityAt: string | null;
  totalLeads: number;
  pendingLeads: number;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
}

export interface CampaignListResult {
  items: CampaignListItem[];
  total: number;
  totals: CampaignMetrics & {
    campaigns: number;
    newCampaigns: number;
    activeCampaigns: number;
    totalLeads: number;
  };
}

export interface CampaignOrganizationOption {
  id: string | null;
  name: string;
  campaigns: number;
}

export interface CampaignConfig {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dialerMode: string;
  maxAttempts: number;
  timezone: string;
  workStartMin: number;
  workEndMin: number;
  workDays: number[];
  wrapUpTimeSec: number;
  retryDelayMin: number;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  callerIdNumber: string | null;
  outboundNumber: string | null;
  rotationNumbers: string[];
}

export interface CampaignDailyPoint {
  day: string;
  attempts: number;
  connected: number;
  conversions: number;
  cost: number;
  talkSec: number;
}

export interface CampaignHourlyPoint {
  hour: number;
  attempts: number;
  connected: number;
  cost: number;
}

export interface CampaignDispositionRow {
  code: string;
  label: string | null;
  category: string | null;
  count: number;
  percentage: number;
}

export interface CampaignAgentRow {
  agentUserId: string;
  name: string;
  email: string | null;
  attempts: number;
  connected: number;
  conversions: number;
  talkSec: number;
  cost: number;
  contactRate: number;
  avgHandleTimeSec: number;
}

export interface CampaignLeadStatusRow {
  status: string;
  count: number;
}

export interface CampaignListRow {
  id: string;
  name: string;
  source: string | null;
  leads: number;
  createdAt: string;
}

export interface CampaignMemberRow {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  assignedAt: string;
}

export interface CampaignRetryRuleRow {
  dispositionCategory: string;
  maxAttempts: number;
  delayMinutes: number;
  delayMultiplier: number;
}

export interface CampaignDetail {
  range: { start: string; end: string };
  campaign: CampaignConfig;
  metrics: CampaignMetrics;
  daily: CampaignDailyPoint[];
  hourly: CampaignHourlyPoint[];
  dispositions: CampaignDispositionRow[];
  agents: CampaignAgentRow[];
  leadsByStatus: CampaignLeadStatusRow[];
  lists: CampaignListRow[];
  members: CampaignMemberRow[];
  retryRules: CampaignRetryRuleRow[];
}

export interface CampaignAttemptRow {
  id: string;
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  status: string;
  attemptNumber: number;
  durationSec: number | null;
  hangupCause: string | null;
  dispositionCode: string | null;
  cost: number | null;
  callId: string | null;
  agentUserId: string;
  agentName: string;
  contactName: string | null;
  contactPhone: string | null;
}

export interface CampaignAttemptsResult {
  items: CampaignAttemptRow[];
  total: number;
}

const BASE = '/backoffice';

export function useBackofficeApi() {
  const api = useApi();

  return useMemo(
    () => ({
      getDashboard: (start: Date, end: Date) =>
        api.get<BackofficeDashboard>(`${BASE}/dashboard`, {
          start: start.toISOString(),
          end: end.toISOString()
        }),

      listAccounts: (params: {
        type: AccountType;
        search?: string;
        page?: number;
        pageSize?: number;
      }) => api.get<AccountListResult>(`${BASE}/accounts`, params),

      getAccount: (type: AccountType, id: string) =>
        api.get<AccountDetail>(`${BASE}/accounts/${type}/${id}`),

      setCredit: (
        type: AccountType,
        id: string,
        body: { mode: 'set' | 'adjust'; amount: number }
      ) =>
        api.post<{ balance: number }>(
          `${BASE}/accounts/${type}/${id}/credit`,
          body
        ),

      updateUserGeneralSettings: (
        type: AccountType,
        id: string,
        body: Partial<EditableUserGeneralSettings>
      ) =>
        api.patch<EditableUserGeneralSettings>(
          `${BASE}/accounts/${type}/${id}/general-settings`,
          body
        ),

      restoreStripeAbuse: (id: string) =>
        api.post<UserAccessAdminState>(
          `${BASE}/accounts/user/${id}/access/stripe-abuse/restore`,
          {}
        ),

      removeRingeeBlock: (id: string) =>
        api.post<UserAccessAdminState>(
          `${BASE}/accounts/user/${id}/access/ringee-block/remove`,
          {}
        ),

      /**
       * Full lockdown: Clerk ban + Ringee block + every live call hung up at
       * the provider + `account.blocked` pushed to every connected device.
       */
      banInClerk: (id: string) =>
        api.post<UserAccessEnforcementResponse>(
          `${BASE}/accounts/user/${id}/access/clerk/ban`,
          {}
        ),

      unbanInClerk: (id: string) =>
        api.post<UserAccessEnforcementResponse>(
          `${BASE}/accounts/user/${id}/access/clerk/unban`,
          {}
        ),

      /** Devices holding an open realtime socket right now. */
      listConnectedDevices: (id: string) =>
        api.get<RealtimeDevice[]>(`${BASE}/accounts/user/${id}/access/devices`),

      /** Drop live calls without changing the account's access. */
      terminateActiveCalls: (id: string, reason?: string) =>
        api.post<EnforcementResult>(
          `${BASE}/accounts/user/${id}/access/terminate-calls`,
          reason ? { reason } : {}
        ),

      updateRecordingSettings: (
        type: AccountType,
        id: string,
        body: Partial<RecordingSettings>
      ) =>
        api.put<RecordingSettings>(
          `${BASE}/accounts/${type}/${id}/recording-settings`,
          body
        ),

      setAiPipeline: (
        type: AccountType,
        id: string,
        body: { enabled: boolean; pipelineType?: PipelineType }
      ) =>
        api.put<{ enabled: boolean; pipelines: PipelineType[] }>(
          `${BASE}/accounts/${type}/${id}/ai-pipeline`,
          body
        ),

      listNumbers: (params: {
        status: 'available' | 'assigned' | 'all';
        search?: string;
      }) => api.get<NumberListItem[]>(`${BASE}/numbers`, params),

      listCampaigns: (params: {
        start: Date;
        end: Date;
        search?: string;
        status?: CampaignStatusFilter;
        organizationId?: string;
        onlyNew?: boolean;
        sort?: CampaignSortKey;
        page?: number;
        pageSize?: number;
      }) =>
        api.get<CampaignListResult>(`${BASE}/campaigns`, {
          ...params,
          start: params.start.toISOString(),
          end: params.end.toISOString()
        }),

      listCampaignOrganizations: () =>
        api.get<CampaignOrganizationOption[]>(
          `${BASE}/campaigns/organizations`
        ),

      getCampaign: (id: string, start: Date, end: Date) =>
        api.get<CampaignDetail>(`${BASE}/campaigns/${id}`, {
          start: start.toISOString(),
          end: end.toISOString()
        }),

      listCampaignAttempts: (
        id: string,
        params: { start: Date; end: Date; page?: number; pageSize?: number }
      ) =>
        api.get<CampaignAttemptsResult>(`${BASE}/campaigns/${id}/attempts`, {
          ...params,
          start: params.start.toISOString(),
          end: params.end.toISOString()
        }),

      assignNumber: (type: AccountType, id: string, numberId: string) =>
        api.post(`${BASE}/accounts/${type}/${id}/numbers`, { numberId }),

      unassignNumber: (type: AccountType, id: string, numberId: string) =>
        api.delete(`${BASE}/accounts/${type}/${id}/numbers/${numberId}`)
    }),
    [api]
  );
}
