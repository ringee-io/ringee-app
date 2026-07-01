'use client';

import { useMemo } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  CreateConnectionResult,
  InfraEvent,
  InfraLinkableItem,
  InfraOverview,
  InfrastructureResourceType,
  InfraNumberSearchResult,
  InfraCheckoutResult,
  InfraCompletePhoneResult,
  InfraCreateResult,
  InfraSipCreateResult,
  InfraNumberDocuments,
  InfraConfigPatch
} from './types';

const BASE = '/infrastructure';

export function useInfraApi() {
  const api = useApi();

  return useMemo(
    () => ({
      getOverview: () => api.get<InfraOverview>(`${BASE}/overview`),

      listLinkable: () => api.get<InfraLinkableItem[]>(`${BASE}/linkable`),

      listEntities: () => api.get<InfraLinkableItem[]>(`${BASE}/entities`),

      listEvents: (resourceId: string) =>
        api.get<InfraEvent[]>(`${BASE}/resources/${resourceId}/events`),

      updatePosition: (resourceId: string, x: number, y: number) =>
        api.patch(`${BASE}/resources/${resourceId}/position`, { x, y }),

      rename: (resourceId: string, name: string) =>
        api.patch(`${BASE}/resources/${resourceId}`, { name }),

      hide: (resourceId: string) =>
        api.post(`${BASE}/resources/${resourceId}/hide`),

      link: (
        type: InfrastructureResourceType,
        referenceId: string,
        position?: { x: number; y: number }
      ) =>
        api.post<{ id: string }>(`${BASE}/resources/link`, {
          type,
          referenceId,
          x: position?.x,
          y: position?.y
        }),

      createConnection: (sourceResourceId: string, targetResourceId: string) =>
        api.post<CreateConnectionResult>(`${BASE}/connections`, {
          sourceResourceId,
          targetResourceId
        }),

      deleteConnection: (connectionId: string) =>
        api.delete(`${BASE}/connections/${encodeURIComponent(connectionId)}`),

      // ── Native creation flows ──────────────────────────────────────────────

      addTeamMembers: (
        userIds: string[],
        position?: { x: number; y: number }
      ) =>
        api.post<{ resourceIds: string[] }>(`${BASE}/resources/team-member`, {
          userIds,
          x: position?.x,
          y: position?.y
        }),

      searchNumbers: (params: {
        country: string;
        numberType?: 'local' | 'toll_free' | 'mobile';
        areaCode?: string;
        limit?: number;
      }) =>
        api.post<InfraNumberSearchResult>(
          `${BASE}/resources/phone-number/search`,
          params
        ),

      phoneCheckout: (phoneNumber: string) =>
        api.post<InfraCheckoutResult>(
          `${BASE}/resources/phone-number/checkout`,
          { phoneNumber, frontendOrigin: window.location.origin }
        ),

      phoneComplete: (
        sessionId: string,
        phoneNumber: string,
        position?: { x: number; y: number }
      ) =>
        api.post<InfraCompletePhoneResult>(
          `${BASE}/resources/phone-number/complete`,
          { sessionId, phoneNumber, x: position?.x, y: position?.y }
        ),

      createSipDevice: (input: {
        label: string;
        deviceType?: string;
        assignedUserId?: string;
        numberId?: string;
        allowInbound?: boolean;
        position?: { x: number; y: number };
      }) =>
        api.post<InfraSipCreateResult>(`${BASE}/resources/sip-device`, {
          label: input.label,
          deviceType: input.deviceType,
          assignedUserId: input.assignedUserId,
          numberId: input.numberId,
          allowInbound: input.allowInbound,
          x: input.position?.x,
          y: input.position?.y
        }),

      createCampaign: (input: {
        name: string;
        description?: string;
        dialerMode?: string;
        agentUserIds?: string[];
        numberPurchasedId?: string;
        position?: { x: number; y: number };
      }) =>
        api.post<InfraCreateResult>(`${BASE}/resources/campaign`, {
          name: input.name,
          description: input.description,
          dialerMode: input.dialerMode,
          agentUserIds: input.agentUserIds,
          numberPurchasedId: input.numberPurchasedId,
          x: input.position?.x,
          y: input.position?.y
        }),

      // ── Inspector edits ────────────────────────────────────────────────────

      updateConfiguration: (resourceId: string, patch: InfraConfigPatch) =>
        api.patch<{ ok: true }>(
          `${BASE}/resources/${resourceId}/configuration`,
          patch
        ),

      regenerateCredentials: (resourceId: string) =>
        api.post<{
          ok: true;
          credentials: InfraSipCreateResult['credentials'];
        }>(`${BASE}/resources/${resourceId}/regenerate-credentials`),

      assign: (
        resourceId: string,
        targetType: InfrastructureResourceType,
        targetReferenceId: string
      ) =>
        api.post<CreateConnectionResult>(
          `${BASE}/resources/${resourceId}/assign`,
          {
            targetType,
            targetReferenceId
          }
        ),

      unassign: (
        resourceId: string,
        targetType: InfrastructureResourceType,
        targetReferenceId: string
      ) =>
        api.post(`${BASE}/resources/${resourceId}/unassign`, {
          targetType,
          targetReferenceId
        }),

      deleteResource: (resourceId: string) =>
        api.delete(`${BASE}/resources/${encodeURIComponent(resourceId)}`),

      getDocuments: (resourceId: string) =>
        api.get<InfraNumberDocuments>(
          `${BASE}/resources/${resourceId}/documents`
        )
    }),
    [api]
  );
}
