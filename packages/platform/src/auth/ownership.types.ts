/**
 * Contexto de propiedad para multi-tenancy B2B/B2C
 *
 * - Si `organizationId` existe: filtra solo por organizationId
 * - Si `organizationId` es null/undefined: filtra por userId
 */
export interface OwnershipContext {
  userId: string;
  organizationId?: string | null;
}

/**
 * Datos del usuario actual extraídos del decorator @CurrentUser()
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
 * Crea un contexto de propiedad desde los datos del usuario actual
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
 * Construye el filtro de Prisma basado en el contexto de propiedad
 *
 * - Si hay organizationId: filtra solo por organizationId
 * - Si no hay organizationId: filtra por userId y organizationId = null
 */
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

/**
 * Construye los datos de creación incluyendo ownership
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
 * Dashboard context extends ownership with role for analytics filtering
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
 * Creates dashboard context from current user data
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
