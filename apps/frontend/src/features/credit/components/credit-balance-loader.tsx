'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useCreditStore } from '../store/credit.store';

/**
 * The workspace's balance, loaded once per user and workspace for whoever may
 * see it — admins and freelancers, never an organization member. Mounted once
 * in the dashboard layout.
 *
 * The header's credit popover used to do this first load. With the header
 * gone nothing did, and every surface that only reads the store — "Your line"
 * on the Call page, the keypad's call key — sat on its skeleton for good.
 */
export function CreditBalanceLoader() {
  const api = useApi();
  const { userId, orgId } = useAuth();
  const { canAccessAdminFeatures, isLoaded } = useOrgRole();
  const allowed = isLoaded && canAccessAdminFeatures;

  useEffect(() => {
    if (!allowed || !userId) return;
    // Silent once a balance is on screen, so switching workspace never
    // collapses what is shown back to a skeleton.
    const { hasLoaded, fetchBalance } = useCreditStore.getState();
    void fetchBalance(api, false, hasLoaded);
  }, [allowed, api, userId, orgId]);

  return null;
}
