import { Injectable } from "@nestjs/common";
import {
  AiVoiceAgentAutomation,
  AiVoiceAgentType,
  Prisma,
} from "@prisma/client";
import {
  buildOwnershipData,
  buildOwnershipFilter,
  type OwnershipContext,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";
import { lockWorkspace } from "./calendar.repository";
import {
  writeFollowUpOptOut,
  type FollowUpOptOutInput,
} from "./follow-up-activation.repository";
import { workspaceOwnershipSql } from "./workspace-scope";

type AutomationSetup = {
  agentId: string;
  enabled: boolean;
  settings?: Prisma.InputJsonValue;
};

/** The workspace-wide context the rail drives. */
export const AUTOMATION_WORKSPACE_CONTEXT = "workspace";

export type AutomationClaim =
  | { claimed: true; row: AiVoiceAgentAutomation }
  | { claimed: false; row: AiVoiceAgentAutomation };

/**
 * The rail's quick-action rows: one per workspace, capability and context — an
 * organization's keyed by the organization, a personal workspace's by its
 * owner (WRK-001).
 *
 * Creating an agent from the rail is guarded by a claim on this row rather
 * than by the agent table, so a double click or a second tab finds the first
 * setup instead of creating a second agent — while the advanced editor stays
 * free to create as many agents as the workspace wants.
 */
@Injectable()
export class AiVoiceAgentAutomationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findForOwner(
    ctx: OwnershipContext,
    capability: AiVoiceAgentType,
    contextKey = AUTOMATION_WORKSPACE_CONTEXT,
  ): Promise<AiVoiceAgentAutomation | null> {
    return this.prisma.aiVoiceAgentAutomation.findFirst({
      where: { ...buildOwnershipFilter(ctx), capability, contextKey },
    });
  }

  listForOwner(ctx: OwnershipContext): Promise<AiVoiceAgentAutomation[]> {
    return this.prisma.aiVoiceAgentAutomation.findMany({
      where: {
        ...buildOwnershipFilter(ctx),
        contextKey: AUTOMATION_WORKSPACE_CONTEXT,
      },
    });
  }

  /**
   * Claims the row so this request may create the agent.
   *
   * The claim is serialized by the workspace lock: inside it, either no row
   * exists and this request inserts one, or the existing row is claimable only
   * while it has no agent and its previous claim went stale — a crashed
   * request must not block the card forever, and a live one must not be
   * overtaken. The unique keys (the organization's, and the personal partial
   * index) stay the backstop against a writer that does not take the lock.
   */
  async claim(
    ctx: OwnershipContext,
    capability: AiVoiceAgentType,
    token: string,
    staleBefore: Date,
    /** Settings a row created by this claim starts with, so a setup that
     * stops after the claim still leaves its first policy in place. */
    initialSettings?: Prisma.InputJsonObject,
  ): Promise<AutomationClaim> {
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockWorkspace(tx, ctx);
        const existing = await tx.aiVoiceAgentAutomation.findFirst({
          where: {
            ...buildOwnershipFilter(ctx),
            capability,
            contextKey: AUTOMATION_WORKSPACE_CONTEXT,
          },
        });
        if (!existing) {
          const row = await tx.aiVoiceAgentAutomation.create({
            data: {
              ...buildOwnershipData(ctx),
              capability,
              contextKey: AUTOMATION_WORKSPACE_CONTEXT,
              claimToken: token,
              claimedAt: now,
              ...(initialSettings ? { settings: initialSettings } : {}),
            },
          });
          return { claimed: true as const, row };
        }
        if (
          existing.agentId ||
          (existing.claimToken &&
            existing.claimedAt &&
            existing.claimedAt > staleBefore)
        ) {
          return { claimed: false as const, row: existing };
        }
        const { count } = await tx.aiVoiceAgentAutomation.updateMany({
          where: {
            id: existing.id,
            agentId: null,
            claimToken: existing.claimToken,
          },
          data: { claimToken: token, claimedAt: now, userId: ctx.userId },
        });
        const current =
          (await tx.aiVoiceAgentAutomation.findUnique({
            where: { id: existing.id },
          })) ?? existing;
        return count === 1
          ? { claimed: true as const, row: current }
          : { claimed: false as const, row: current };
      });
    } catch (error) {
      // Only the capability key means "someone else got here first" — a writer
      // outside the lock; any other unique violation is a real failure.
      if (!isUniqueViolationOn(error, "capability")) throw error;
    }

    const existing = await this.findForOwner(ctx, capability);
    if (!existing) {
      // Deleted between the insert and the read: nothing to take over, and a
      // retry of the whole setup will insert again.
      throw new Error("Automation row vanished while being claimed");
    }
    return { claimed: false, row: existing };
  }

  /**
   * Finishes a claim: writes the agent and its setup, but only for the claim
   * this request still holds.
   */
  async completeClaim(
    id: string,
    token: string,
    data: {
      userId: string;
      agentId: string;
      enabled: boolean;
      settings?: Prisma.InputJsonValue;
    },
  ): Promise<boolean> {
    const { count } = await this.prisma.aiVoiceAgentAutomation.updateMany({
      where: { id, claimToken: token },
      data: { ...data, claimToken: null, claimedAt: null },
    });
    return count === 1;
  }

  /** Gives up a claim whose agent was never created. */
  async releaseClaim(id: string, token: string): Promise<void> {
    await this.prisma.aiVoiceAgentAutomation.deleteMany({
      where: { id, claimToken: token, agentId: null },
    });
  }

  /**
   * Forgets an agent that was deleted, so the card can be claimed and set up
   * again. Only while the row still names that agent: a setup that moved the
   * card on meanwhile is left alone.
   */
  async clearAgent(
    ctx: OwnershipContext,
    id: string,
    agentId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.aiVoiceAgentAutomation.updateMany({
      where: { id, ...buildOwnershipFilter(ctx), agentId },
      data: { agentId: null },
    });
    return count === 1;
  }

  /**
   * Deletes the card's trigger — the row, never the agent — so the next setup
   * starts from nothing. Only while the row still names that agent: a setup
   * that moved the card on meanwhile is left alone.
   *
   * With `optOut`, the follow-up review's durable opt-out (Stage 4C) is
   * written in the same transaction: the trigger is gone and the removal is
   * remembered, or neither happened.
   */
  async removeForOwner(
    ctx: OwnershipContext,
    id: string,
    agentId: string,
    options: { optOut?: FollowUpOptOutInput } = {},
  ): Promise<boolean> {
    const where = { id, ...buildOwnershipFilter(ctx), agentId };
    const optOut = options.optOut;
    if (!optOut) {
      const { count } = await this.prisma.aiVoiceAgentAutomation.deleteMany({
        where,
      });
      return count === 1;
    }
    return this.prisma.$transaction(async (tx) => {
      // The workspace lock the activation row's writes take.
      await lockWorkspace(tx, ctx);
      const { count } = await tx.aiVoiceAgentAutomation.deleteMany({ where });
      if (count !== 1) return false;
      await writeFollowUpOptOut(tx, ctx, optOut);
      return true;
    });
  }

  /**
   * Saves the setup of a capability whose agent already exists. Find-or-create
   * on the stable key under the workspace lock, so re-running a setup — or two
   * concurrent ones — converges on one row instead of duplicating it. The
   * organization's compound unique key cannot name a personal row (its
   * organization is null), so the row is found by the ownership filter.
   */
  upsertForOwner(
    ctx: OwnershipContext,
    capability: AiVoiceAgentType,
    data:
      | AutomationSetup
      | ((current: AiVoiceAgentAutomation | null) => AutomationSetup),
  ): Promise<AiVoiceAgentAutomation> {
    return this.prisma.$transaction(async (tx) => {
      // The workspace lock covers first creation; the row lock also serializes
      // with direct updates and follow-up dispatch of an existing automation.
      await lockWorkspace(tx, ctx);
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentAutomation"
        WHERE ${workspaceOwnershipSql(ctx)}
          AND "capability" = ${capability}::"AiVoiceAgentType"
          AND "contextKey" = ${AUTOMATION_WORKSPACE_CONTEXT} FOR UPDATE`;
      const current = await tx.aiVoiceAgentAutomation.findFirst({
        where: {
          ...buildOwnershipFilter(ctx),
          capability,
          contextKey: AUTOMATION_WORKSPACE_CONTEXT,
        },
      });
      const setup = typeof data === "function" ? data(current) : data;
      if (current) {
        return tx.aiVoiceAgentAutomation.update({
          where: { id: current.id },
          data: {
            ...setup,
            userId: ctx.userId,
            claimToken: null,
            claimedAt: null,
          },
        });
      }
      return tx.aiVoiceAgentAutomation.create({
        data: {
          ...buildOwnershipData(ctx),
          capability,
          contextKey: AUTOMATION_WORKSPACE_CONTEXT,
          ...setup,
        },
      });
    });
  }

  async updateForOwner(
    ctx: OwnershipContext,
    id: string,
    data: { enabled?: boolean; settings?: Prisma.InputJsonValue },
  ): Promise<AiVoiceAgentAutomation | null> {
    const { count } = await this.prisma.aiVoiceAgentAutomation.updateMany({
      where: { id, ...buildOwnershipFilter(ctx) },
      data,
    });
    if (count !== 1) return null;
    return this.prisma.aiVoiceAgentAutomation.findUnique({ where: { id } });
  }
}

function isUniqueViolationOn(error: unknown, column: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes(column)
    : String(target).includes(column);
}
