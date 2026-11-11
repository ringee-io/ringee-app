import { Injectable } from "@nestjs/common";
import {
  FollowUpActivation,
  FollowUpActivationStatus,
  Prisma,
} from "@prisma/client";
import {
  buildOwnershipFilter,
  workspaceKeyOf,
  type OwnershipContext,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";
import { lockWorkspace } from "./calendar.repository";

/** The outcome of a compare-and-set write on the activation row. */
export type FollowUpActivationWrite =
  | { ok: true; row: FollowUpActivation; created: boolean }
  | {
      ok: false;
      /**
       * `stale_revision`: the row moved past the revision the caller saw.
       * `adoption_in_progress`: another request is applying an adoption.
       */
      reason: "stale_revision" | "adoption_in_progress";
      row: FollowUpActivation | null;
    };

/**
 * The adoption a request is applying, stored on the row from the moment it
 * reserved its revision until the adoption is recorded (or it fails).
 */
export interface FollowUpAdoptionAttempt {
  requestKey: string;
  /** The revision the request was based on — what a retry sends again. */
  baseRevision: number | null;
  status: "applying" | "failed";
  /** ISO time the revision was reserved. */
  at: string;
}

/** A durable opt-out: a capability removed or switched off on purpose. */
export interface FollowUpOptOutInput {
  version: string;
  capability: string;
  reason: string;
  at: Date;
  /** The configuration a row created only to hold the opt-out starts with. */
  emptyConfiguration: Prisma.InputJsonObject;
}

/** The attempt stored on a row, when it is well formed. */
export function readAdoptionAttempt(
  row: Pick<FollowUpActivation, "adoptionAttempt"> | null | undefined,
): FollowUpAdoptionAttempt | null {
  const raw = row?.adoptionAttempt;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const attempt = raw as Record<string, unknown>;
  if (
    typeof attempt.requestKey !== "string" ||
    typeof attempt.at !== "string" ||
    (attempt.status !== "applying" && attempt.status !== "failed")
  ) {
    return null;
  }
  return {
    requestKey: attempt.requestKey,
    baseRevision:
      typeof attempt.baseRevision === "number" ? attempt.baseRevision : null,
    status: attempt.status,
    at: attempt.at,
  };
}

/**
 * The revision `reserveAdoption` gave the row for this attempt: a first
 * reservation creates the row at its initial revision (the schema's default,
 * 1), any other moves it to the next. A row at another revision has moved
 * past what the attempt reviewed.
 */
export function reservedRevisionOf(attempt: FollowUpAdoptionAttempt): number {
  return attempt.baseRevision === null ? 1 : attempt.baseRevision + 1;
}

/**
 * Whether another request is applying an adoption on this row right now. An
 * attempt older than `staleBefore` holds nothing: its request died.
 */
function heldByAnotherAttempt(
  row: FollowUpActivation,
  staleBefore: Date,
  requestKey?: string,
): boolean {
  const attempt = readAdoptionAttempt(row);
  return (
    !!attempt &&
    attempt.status === "applying" &&
    attempt.requestKey !== requestKey &&
    new Date(attempt.at).getTime() > staleBefore.getTime()
  );
}

/**
 * The ownership columns of a new row. An organization's row is owned by the
 * organization alone — no member's account is its owner, so deleting one
 * never cascades into the organization's adoption, scope or opt-outs (who
 * saved and who adopted stay in `configuredByUserId` / `adoptedByUserId`). A
 * personal row is its owner's and goes with them. A check constraint in the
 * migration holds this shape.
 */
function activationOwnership(ctx: OwnershipContext): {
  userId: string | null;
  organizationId: string | null;
} {
  return ctx.organizationId
    ? { userId: null, organizationId: ctx.organizationId }
    : { userId: ctx.userId, organizationId: null };
}

/**
 * Writes a durable opt-out inside the caller's transaction, under the
 * workspace lock the caller already took. Creates the row when the
 * workspace never opened the review, so the next proposal knows the
 * capability was removed on purpose. The opt-out is the newest choice for
 * that capability: a saved draft that had it switched on is switched off
 * with it, so only a later explicit save brings it back.
 */
export async function writeFollowUpOptOut(
  tx: Prisma.TransactionClient,
  ctx: OwnershipContext,
  input: FollowUpOptOutInput,
): Promise<FollowUpActivation> {
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
        ...activationOwnership(ctx),
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
  const configuration =
    current.configuration &&
    typeof current.configuration === "object" &&
    !Array.isArray(current.configuration)
      ? (current.configuration as Prisma.JsonObject)
      : null;
  const saved = configuration?.capabilities;
  const capabilities =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? { ...(saved as Prisma.JsonObject), [input.capability]: false }
      : null;
  return tx.followUpActivation.update({
    where: { id: current.id },
    data: {
      optOuts,
      ...(configuration && capabilities
        ? { configuration: { ...configuration, capabilities } }
        : {}),
      revision: { increment: 1 },
    },
  });
}

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
   * the scope changes). A save waits while another request is applying an
   * adoption that reserved the row after `attemptStaleBefore`.
   */
  saveConfiguration(
    ctx: OwnershipContext,
    input: {
      version: string;
      configuration: Prisma.InputJsonObject;
      entrySource?: string | null;
      expectedRevision: number | null;
      attemptStaleBefore: Date;
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
            ...activationOwnership(ctx),
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
      if (heldByAnotherAttempt(current, input.attemptStaleBefore)) {
        return {
          ok: false as const,
          reason: "adoption_in_progress",
          row: current,
        };
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
   * Reserves a revision for one adoption request, before anything live
   * changes. Compared on `expectedRevision` like a save, it stores the draft
   * the request carries (when it carries one) together with the request's
   * key, the revision it was based on and `applying`, and takes a new
   * revision: a stale window can neither save nor adopt over it, and a fresh
   * save waits until the adoption is recorded or fails. Another request's
   * fresh attempt holds the row (`adoption_in_progress`).
   */
  reserveAdoption(
    ctx: OwnershipContext,
    input: {
      version: string;
      requestKey: string;
      expectedRevision: number | null;
      configuration?: Prisma.InputJsonObject;
      entrySource?: string | null;
      at: Date;
      attemptStaleBefore: Date;
    },
  ): Promise<FollowUpActivationWrite> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.followUpActivation.findFirst({
        where: { ...buildOwnershipFilter(ctx), version: input.version },
      });
      const attempt: FollowUpAdoptionAttempt = {
        requestKey: input.requestKey,
        baseRevision: input.expectedRevision,
        status: "applying",
        at: input.at.toISOString(),
      };
      if (!current) {
        if (input.expectedRevision !== null || !input.configuration) {
          return { ok: false as const, reason: "stale_revision", row: null };
        }
        const row = await tx.followUpActivation.create({
          data: {
            ...activationOwnership(ctx),
            workspaceKey: workspaceKeyOf(ctx),
            version: input.version,
            configuration: input.configuration,
            entrySource: input.entrySource ?? null,
            configuredAt: input.at,
            configuredByUserId: ctx.userId,
            adoptionAttempt: { ...attempt },
          },
        });
        return { ok: true as const, row, created: true };
      }
      if (
        heldByAnotherAttempt(
          current,
          input.attemptStaleBefore,
          input.requestKey,
        )
      ) {
        return {
          ok: false as const,
          reason: "adoption_in_progress",
          row: current,
        };
      }
      if (input.expectedRevision !== current.revision) {
        return { ok: false as const, reason: "stale_revision", row: current };
      }
      const row = await tx.followUpActivation.update({
        where: { id: current.id },
        data: {
          ...(input.configuration
            ? {
                configuration: input.configuration,
                configuredAt: input.at,
                configuredByUserId: ctx.userId,
              }
            : {}),
          ...(current.entrySource
            ? {}
            : { entrySource: input.entrySource ?? null }),
          adoptionAttempt: { ...attempt },
          revision: { increment: 1 },
        },
      });
      return { ok: true as const, row, created: false };
    });
  }

  /**
   * Records the explicit adoption, once per revision: the configuration and
   * scope that were shown are stored with who adopted and when, and the
   * attempt that reserved the revision is closed. A retry with the revision
   * that this adoption produced is answered with the stored row, so a lost
   * response never adopts twice.
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
          adoptionAttempt: Prisma.DbNull,
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
   * The attempt of `requestKey` failed: it stops holding the row, so saves
   * and other adoptions go ahead, while a retry of the same request may
   * still resume it. Nothing reviewed changed, so the revision stays.
   */
  markAdoptionFailed(
    ctx: OwnershipContext,
    input: { version: string; requestKey: string },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      const current = await tx.followUpActivation.findFirst({
        where: { ...buildOwnershipFilter(ctx), version: input.version },
      });
      const attempt = readAdoptionAttempt(current);
      if (
        !current ||
        attempt?.requestKey !== input.requestKey ||
        attempt.status !== "applying"
      ) {
        return false;
      }
      await tx.followUpActivation.update({
        where: { id: current.id },
        data: { adoptionAttempt: { ...attempt, status: "failed" } },
      });
      return true;
    });
  }

  /**
   * A durable opt-out written outside the review — see `writeFollowUpOptOut`.
   * A trigger removed from the rail records it together with the deletion
   * (`AiVoiceAgentAutomationRepository.removeForOwner`).
   */
  recordOptOut(
    ctx: OwnershipContext,
    input: FollowUpOptOutInput,
  ): Promise<FollowUpActivation> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, ctx);
      return writeFollowUpOptOut(tx, ctx, input);
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
