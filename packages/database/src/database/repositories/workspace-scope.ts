import { Prisma } from "@prisma/client";
import { buildOwnershipFilter, type OwnershipContext } from "@ringee/platform";

/**
 * Which workspaces a worker may claim automated work for (AGENT-018). Decided
 * by the voice-agent access policy in `@ringee/services`; repositories only
 * apply it inside their claim queries, so a workspace left out can never take
 * a claim slot from one that is admitted.
 *
 * - `organizationIds`: the admitted organizations, or `null` for every one.
 * - `personalUserIds`: the owners of the admitted personal workspaces. A
 *   personal row is admitted by its own `userId` with `organizationId IS NULL`,
 *   never by the organization list.
 */
export interface WorkspaceAdmission {
  organizationIds: string[] | null;
  personalUserIds: string[];
}

/** The admission as a Prisma condition on a model's own ownership columns. */
export function workspaceAdmissionWhere(admission: WorkspaceAdmission): {
  OR: Array<{
    organizationId?: { in: string[] } | { not: null } | null;
    userId?: { in: string[] };
  }>;
} {
  return {
    OR: [
      admission.organizationIds === null
        ? { organizationId: { not: null } }
        : { organizationId: { in: admission.organizationIds } },
      { organizationId: null, userId: { in: admission.personalUserIds } },
    ],
  };
}

/**
 * The admission as raw SQL over `alias`'s `organizationId` / `userId` columns,
 * wrapped in parentheses so it can be AND-ed into any claim.
 */
export function workspaceAdmissionSql(
  admission: WorkspaceAdmission,
  alias?: string,
): Prisma.Sql {
  const organization = column(alias, "organizationId");
  const user = column(alias, "userId");
  const organizations =
    admission.organizationIds === null
      ? Prisma.sql`${organization} IS NOT NULL`
      : Prisma.sql`${organization}::text = ANY(${admission.organizationIds}::text[])`;
  return Prisma.sql`((${organizations}) OR (${organization} IS NULL AND ${user}::text = ANY(${admission.personalUserIds}::text[])))`;
}

/**
 * The ownership filter of WRK-001 as raw SQL over `alias`'s columns: the
 * organization alone, or the owner **and** `organizationId IS NULL`.
 */
export function workspaceOwnershipSql(
  ctx: OwnershipContext,
  alias?: string,
): Prisma.Sql {
  const owner = buildOwnershipFilter(ctx);
  const organization = column(alias, "organizationId");
  if (owner.organizationId) {
    return Prisma.sql`${organization} = ${owner.organizationId}::uuid`;
  }
  return Prisma.sql`(${organization} IS NULL AND ${column(alias, "userId")} = ${owner.userId}::uuid)`;
}

/**
 * Whether `userId` may act in the workspace right now, read inside the caller's
 * transaction: a current member of the organization, or — in a personal
 * workspace, which has exactly one person — its owner.
 */
export async function isWorkspaceMemberInTransaction(
  tx: Prisma.TransactionClient,
  workspace: OwnershipContext,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  if (!workspace.organizationId) return userId === workspace.userId;
  return (
    (await tx.organizationMembership.count({
      where: { organizationId: workspace.organizationId, userId },
    })) > 0
  );
}

/** Only code constants are spliced: an alias is never request input. */
function column(alias: string | undefined, name: string): Prisma.Sql {
  if (alias !== undefined && !/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`Invalid SQL alias: ${alias}`);
  }
  return Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
}
