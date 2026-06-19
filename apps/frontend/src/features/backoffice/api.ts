'use client';

import { useMemo } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

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

      assignNumber: (type: AccountType, id: string, numberId: string) =>
        api.post(`${BASE}/accounts/${type}/${id}/numbers`, { numberId }),

      unassignNumber: (type: AccountType, id: string, numberId: string) =>
        api.delete(`${BASE}/accounts/${type}/${id}/numbers/${numberId}`)
    }),
    [api]
  );
}
