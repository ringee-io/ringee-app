/**
 * Ownership context for B2B/B2C multi-tenancy.
 *
 * - `organizationId` set: scope to that organization alone.
 * - `organizationId` null/undefined: scope to the user's personal data.
 */
export interface OwnershipContext {
  userId: string;
  organizationId?: string | null;
}

/**
 * The current user, as resolved by the @CurrentUser() decorator.
 */
export interface CurrentUserData {
  id: string;
  clerkId?: string;
  firstName?: string | null;
  lastName?: string | null;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

/**
 * Builds an ownership context from the current user.
 */
export function createOwnershipContext(
  user: CurrentUserData,
): OwnershipContext {
  return {
    userId: user.id,
    organizationId: user.activeOrgId ?? null,
  };
}

/**
 * Builds the Prisma filter for an ownership context (WRK-001).
 *
 * - With an organizationId: filter by organizationId ONLY. Org data belongs to
 *   the org, not to whoever created each row.
 * - Without one: filter by userId AND organizationId = null. Omitting the null
 *   check would pull in the same user's organization rows.
 */
export function buildOwnershipFilter(
  ctx: OwnershipContext & { organizationId: string },
): { organizationId: string };
export function buildOwnershipFilter(ctx: OwnershipContext): {
  userId?: string;
  organizationId?: string | null;
};
export function buildOwnershipFilter(ctx: OwnershipContext): {
  userId?: string;
  organizationId?: string | null;
} {
  if (ctx.organizationId) {
    return {
      organizationId: ctx.organizationId,
    };
  }
  return {
    userId: ctx.userId,
    organizationId: null,
  };
}

/** The ownership columns of a stored workspace row. */
export interface WorkspaceOwnedRow {
  userId?: string | null;
  organizationId?: string | null;
}

/**
 * Whether a stored row belongs to the workspace `ctx` names (WRK-001) — the
 * hand-written form of `buildOwnershipFilter`. An organization row matches on
 * `organizationId` alone; a personal row needs `organizationId: null` **and**
 * the owner's `userId`, because every personal row has a null organization.
 */
export function isInWorkspace(
  ctx: OwnershipContext,
  row: WorkspaceOwnedRow,
): boolean {
  if (ctx.organizationId) return row.organizationId === ctx.organizationId;
  return (
    !row.organizationId && Boolean(row.userId) && row.userId === ctx.userId
  );
}

/**
 * Whether two stored rows belong to one workspace. Comparing their
 * `organizationId` alone is not enough: two personal rows of different people
 * both carry `null`.
 */
export function isSameWorkspace(
  a: WorkspaceOwnedRow,
  b: WorkspaceOwnedRow,
): boolean {
  if (a.organizationId || b.organizationId) {
    return Boolean(a.organizationId) && a.organizationId === b.organizationId;
  }
  return Boolean(a.userId) && a.userId === b.userId;
}

/**
 * The workspace a stored row belongs to, as an ownership context. Deferred
 * work rebuilds its scope from what was persisted — never from the owner's
 * currently active workspace.
 */
export function workspaceOf(row: {
  userId: string;
  organizationId: string | null;
}): OwnershipContext {
  return { userId: row.userId, organizationId: row.organizationId ?? null };
}

/**
 * Builds the ownership fields to persist when creating a row.
 */
export function buildOwnershipData(ctx: OwnershipContext): {
  userId: string;
  organizationId: string | null;
} {
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId ?? null,
  };
}

/**
 * Resolve the effective `userId` constraint for a member-scoped list endpoint
 * (pending actions, recordings, call history). Returns the userId that results
 * should be narrowed to, or `undefined` for no extra narrowing.
 *
 * - Freelancer (no org): `undefined` — the ownership context already restricts
 *   results to the user's own personal data.
 * - Org admin: the requested `memberId`, or `undefined` to see the whole org.
 * - Org member: forced to their own `user.id` regardless of any requested id.
 */
export function resolveMemberFilter(
  user: CurrentUserData,
  memberId?: string | null,
): string | undefined {
  if (!user.activeOrgId) return undefined;
  const isOrgAdmin = user.activeOrgRole === "org:admin";
  if (isOrgAdmin) {
    return memberId && memberId !== "null" && memberId !== "undefined"
      ? memberId
      : undefined;
  }
  return user.id;
}

/**
 * Dashboard context: ownership plus the role and filters analytics needs.
 */
export interface DashboardContext extends OwnershipContext {
  isOrgAdmin: boolean;
  filterMemberId?: string | null; // Optional: filter by specific member (admin only)
  /**
   * Scope of the dashboard view. "personal" forces userId-only filtering,
   * "organization" allows admins to see org-wide data.
   * Defaults to "organization" for org users and "personal" for non-org users.
   */
  scope?: "personal" | "organization";
  /**
   * Optional date range filter (inclusive). When omitted, callers should
   * fall back to a default (e.g. last 30 days).
   */
  dateRange?: { start: Date; end: Date };
  /**
   * Optional campaign filter — restricts results to calls associated with
   * the given campaign (via CallAttempt.campaignId).
   */
  campaignId?: string | null;
  /**
   * Optional outcome filter — restricts results to calls with the given
   * CallOutcome.
   */
  outcome?: string | null;
}

/**
 * Builds a dashboard context from the current user.
 */
export function createDashboardContext(
  user: CurrentUserData,
  options?: {
    filterMemberId?: string | null;
    scope?: "personal" | "organization";
    dateRange?: { start: Date; end: Date };
    campaignId?: string | null;
    outcome?: string | null;
  },
): DashboardContext {
  const isOrgAdmin = user.activeOrgRole === "org:admin";
  const hasOrg = !!user.activeOrgId;
  const scope = options?.scope ?? (hasOrg ? "organization" : "personal");

  return {
    userId: user.id,
    organizationId: user.activeOrgId ?? null,
    isOrgAdmin,
    filterMemberId: options?.filterMemberId ?? null,
    scope,
    dateRange: options?.dateRange,
    campaignId: options?.campaignId ?? null,
    outcome: options?.outcome ?? null,
  };
}
