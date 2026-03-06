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
export function createOwnershipContext(user: CurrentUserData): OwnershipContext {
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
 * Dashboard context extends ownership with role for analytics filtering
 */
export interface DashboardContext extends OwnershipContext {
    isOrgAdmin: boolean;
    filterMemberId?: string | null; // Optional: filter by specific member (admin only)
}

/**
 * Creates dashboard context from current user data
 */
export function createDashboardContext(
    user: CurrentUserData,
    filterMemberId?: string | null
): DashboardContext {
    return {
        userId: user.id,
        organizationId: user.activeOrgId ?? null,
        isOrgAdmin: user.activeOrgRole === "org:admin",
        filterMemberId: filterMemberId ?? null,
    };
}
