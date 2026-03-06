'use client';

import { useOrganization } from '@clerk/nextjs';

/**
 * Hook for checking organization role-based permissions.
 * 
 * Rules:
 * - Users without an organization are NOT restricted
 * - Only organization members are subject to role restrictions
 * - Roles: 'org:admin' (full access), 'org:member' (limited access)
 */
export function useOrgRole() {
  const { organization, membership, isLoaded } = useOrganization();

  const hasOrg = !!organization;
  const orgRole = membership?.role ?? null;
  const isOrgAdmin = hasOrg && orgRole === 'org:admin';
  const isOrgMember = hasOrg && orgRole === 'org:member';

  /**
   * Check if the current user can access admin-only features.
   * Returns true if:
   * - User has no organization (personal account)
   * - User is org admin
   */
  const canAccessAdminFeatures = !hasOrg || isOrgAdmin;

  /**
   * Items to hide from org:member users
   */
  const hiddenForMember = [
    'Rate',
    'Buy Number',
    'Recordings'
  ];

  return {
    isLoaded,
    hasOrg,
    orgRole,
    isOrgAdmin,
    isOrgMember,
    canAccessAdminFeatures,
    hiddenForMember,
  };
}
