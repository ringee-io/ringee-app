import { Injectable } from "@nestjs/common";
import {
  FollowUpActivation,
  FollowUpActivationStatus,
  Prisma,
} from "@prisma/client";
import {
  buildOwnershipData,
  buildOwnershipFilter,
  workspaceKeyOf,
  type OwnershipContext,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";
import { lockWorkspace } from "./calendar.repository";

/** The outcome of a compare-and-set write on the activation row. */
export type FollowUpActivationWrite =
  | { ok: true; row: FollowUpActivation; created: boolean }
  | { ok: false; reason: "stale_revision"; row: FollowUpActivation | null };

/**
 * One row per workspace and onboarding version (Stage 4C): the saved review,
 * the explicit adoption and the durable opt-outs. Writes are serialized by the
 * workspace lock — the same lock rail claims, bookings and calendar writes
 * take — and compared on `revision`, so a stale tab cannot overwrite a newer
 * save or adopt a configuration it never saw.
 *
 * Persistence only: whether the caller may adopt, and what adoption does, are
 * decided by `VoiceAgentAutomationService`.
 */
@Injectable()
export class FollowUpActivationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findForWorkspace(
    ctx: OwnershipContext,
    version: string,
  ): Promise<FollowUpActivation | null> {
    return this.prisma.followUpActivation.findFirst({
      where: { ...buildOwnershipFilter(ctx), version },
    });
  }

  /**
   * Saves the reviewed configuration. `expectedRevision` null means "there is
   * no row yet"; a number must equal the stored revision. An adopted row stays
   * adopted: saving edits after adoption records the new configuration
   * without withdrawing the authorization (the caller re-adopts explicitly when
   * the scope changes).
   */
  saveConfiguration(
    ctx: OwnershipContext,
    input: {
      version: string;
      configuration: Prisma.InputJsonObject;
      entrySource?: string | null;
      expectedRevision: number | null;
    },
  ): Promise<FollowUpActivationWrite> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.followUpActivation.findFirst({
        where: { ...buildOwnershipFilter(ctx), version: input.version },
      });
      const now = new Date();
      if (!current) {
        if (input.expectedRevision !== null) {
          return { ok: false as const, reason: "stale_revision", row: null };
        }
        const row = await tx.followUpActivation.create({
          data: {
            ...buildOwnershipData(ctx),
            workspaceKey: workspaceKeyOf(ctx),
            version: input.version,
            configuration: input.configuration,
            entrySource: input.entrySource ?? null,
            configuredAt: now,
            configuredByUserId: ctx.userId,
          },
        });
        return { ok: true as const, row, created: true };
      }
      if (input.expectedRevision !== current.revision) {
        return { ok: false as const, reason: "stale_revision", row: current };
      }
      const row = await tx.followUpActivation.update({
        where: { id: current.id },
        data: {
          configuration: input.configuration,
          configuredAt: now,
          configuredByUserId: ctx.userId,
          // An organization's row is not re-owned by whoever saves it: the
          // ownership column of an organization's row is the organization.
          ...(ctx.organizationId ? {} : { userId: ctx.userId }),
          ...(current.entrySource
            ? {}
            : { entrySource: input.entrySource ?? null }),
          revision: { increment: 1 },
        },
      });
      return { ok: true as const, row, created: false };
    });
  }

  /**
   * Records the explicit adoption, once per revision: the configuration and
   * scope that were shown are stored with who adopted and when. A retry with
   * the revision that this adoption produced is answered with the stored row,
   * so a lost response never adopts twice.
   */
  markAdopted(
    ctx: OwnershipContext,
    input: {
      version: string;
      expectedRevision: number;
      configuration: Prisma.InputJsonObject;
      scope: Prisma.InputJsonObject;
      optOuts: Prisma.InputJsonObject;
      entrySource?: string | null;
      adoptedAt: Date;
    },
  ): Promise<FollowUpActivationWrite> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.followUpActivation.findFirst({
        where: { ...buildOwnershipFilter(ctx), version: input.version },
      });
      if (!current || current.revision !== input.expectedRevision) {
        return {
          ok: false as const,
          reason: "stale_revision",
          row: current ?? null,
        };
      }
      const row = await tx.followUpActivation.update({
        where: { id: current.id },
        data: {
          status: FollowUpActivationStatus.adopted,
          configuration: input.configuration,
          scope: input.scope,
          optOuts: input.optOuts,
          adoptedAt: input.adoptedAt,
          adoptedByUserId: ctx.userId,
          configuredAt: input.adoptedAt,
          configuredByUserId: ctx.userId,
          ...(current.entrySource
            ? {}
            : { entrySource: input.entrySource ?? null }),
          revision: { increment: 1 },
        },
      });
      return { ok: true as const, row, created: false };
    });
  }

  /**
   * A durable opt-out written outside the review — a trigger deliberately
   * removed from the rail. Creates the row when the workspace never opened the
   * review, so the next proposal knows the capability was removed on purpose.
   * The configuration of an existing row is left as it was.
   */
  recordOptOut(
    ctx: OwnershipContext,
    input: {
      version: string;
      capability: string;
      reason: string;
      at: Date;
      emptyConfiguration: Prisma.InputJsonObject;
    },
  ): Promise<FollowUpActivation> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.followUpActivation.findFirst({
        where: { ...buildOwnershipFilter(ctx), version: input.version },
      });
      const optOut = {
        reason: input.reason,
        at: input.at.toISOString(),
        userId: ctx.userId,
      };
      if (!current) {
        return tx.followUpActivation.create({
          data: {
            ...buildOwnershipData(ctx),
            workspaceKey: workspaceKeyOf(ctx),
            version: input.version,
            configuration: input.emptyConfiguration,
            optOuts: { [input.capability]: optOut },
            configuredAt: input.at,
            configuredByUserId: ctx.userId,
          },
        });
      }
      const optOuts = {
        ...((current.optOuts as Prisma.JsonObject | null) ?? {}),
        [input.capability]: optOut,
      };
      return tx.followUpActivation.update({
        where: { id: current.id },
        data: { optOuts, revision: { increment: 1 } },
      });
    });
  }

  /**
   * Adopted activations in a stable order, for the analytics projector. Not
   * workspace-scoped on purpose: it runs as the system, and each row carries
   * its own workspace.
   */
  listAdoptedAfter(
    cursor: { at: Date; id: string | null },
    take: number,
  ): Promise<FollowUpActivation[]> {
    return this.prisma.followUpActivation.findMany({
      where: {
        adoptedAt: { not: null },
        OR: [
          { adoptedAt: { gt: cursor.at } },
          ...(cursor.id
            ? [{ adoptedAt: cursor.at, id: { gt: cursor.id } }]
            : []),
        ],
      },
      orderBy: [{ adoptedAt: "asc" }, { id: "asc" }],
      take,
    });
  }

  /** Adopted activations of these workspaces, for result attribution. */
  findAdoptedForWorkspaceKeys(
    workspaceKeys: string[],
    version: string,
  ): Promise<
    Array<Pick<FollowUpActivation, "workspaceKey" | "adoptedAt" | "version">>
  > {
    if (!workspaceKeys.length) return Promise.resolve([]);
    return this.prisma.followUpActivation.findMany({
      where: {
        workspaceKey: { in: workspaceKeys },
        version,
        adoptedAt: { not: null },
      },
      select: { workspaceKey: true, adoptedAt: true, version: true },
    });
  }
}
