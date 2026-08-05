"use client";

import { useOrganization } from "@clerk/nextjs";

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
  const isOrgAdmin = hasOrg && orgRole === "org:admin";
  const isOrgMember = hasOrg && orgRole === "org:member";

  /**
   * Check if the current user can access admin-only features.
   * Returns true if:
   * - User has no organization (personal account)
   * - User is org admin
   */
  const canAccessAdminFeatures = !hasOrg || isOrgAdmin;

  /**
   * Items to hide from org:member users. Recordings stays visible — members can
   * see their own recordings (scoped server-side); only admins can filter by member.
   *
   * "Journey" is workspace-level (team size, campaign volume, credit rewards)
   * and its API returns 403 to members, so showing the entry would only lead to
   * a dead end. The guard is the real control; this keeps the nav honest.
   */
  const hiddenForMember = ["Rate", "Buy Number", "Journey"];

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
