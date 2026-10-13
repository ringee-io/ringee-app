import { Injectable } from "@nestjs/common";
import {
  AiVoiceAgentAutomation,
  AiVoiceAgentType,
  Prisma,
} from "@prisma/client";
import type { OrganizationOwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

/** The organization-wide context the rail drives. */
export const AUTOMATION_WORKSPACE_CONTEXT = "workspace";

export type AutomationClaim =
  | { claimed: true; row: AiVoiceAgentAutomation }
  | { claimed: false; row: AiVoiceAgentAutomation };

/**
 * The rail's quick-action rows: one per organization, capability and context.
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
    ctx: OrganizationOwnershipContext,
    capability: AiVoiceAgentType,
    contextKey = AUTOMATION_WORKSPACE_CONTEXT,
  ): Promise<AiVoiceAgentAutomation | null> {
    return this.prisma.aiVoiceAgentAutomation.findFirst({
      where: { organizationId: ctx.organizationId, capability, contextKey },
    });
  }

  listForOwner(
    ctx: OrganizationOwnershipContext,
  ): Promise<AiVoiceAgentAutomation[]> {
    return this.prisma.aiVoiceAgentAutomation.findMany({
      where: {
        organizationId: ctx.organizationId,
        contextKey: AUTOMATION_WORKSPACE_CONTEXT,
      },
    });
  }

  /**
   * Claims the row so this request may create the agent.
   *
   * The insert is the claim: the unique key lets exactly one concurrent setup
   * through. A row that already exists is claimable only while it has no agent
   * and its previous claim went stale — a crashed request must not block the
   * card forever, and a live one must not be overtaken.
   */
  async claim(
    ctx: OrganizationOwnershipContext,
    capability: AiVoiceAgentType,
    token: string,
    staleBefore: Date,
  ): Promise<AutomationClaim> {
    const now = new Date();
    try {
      const row = await this.prisma.aiVoiceAgentAutomation.create({
        data: {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          capability,
          contextKey: AUTOMATION_WORKSPACE_CONTEXT,
          claimToken: token,
          claimedAt: now,
        },
      });
      return { claimed: true, row };
    } catch (error) {
      // Only the capability key means "someone else got here first"; any
      // other unique violation is a real failure and propagates.
      if (!isUniqueViolationOn(error, "capability")) throw error;
    }

    const existing = await this.findForOwner(ctx, capability);
    if (!existing) {
      // Deleted between the insert and the read: nothing to take over, and a
      // retry of the whole setup will insert again.
      throw new Error("Automation row vanished while being claimed");
    }
    if (
      existing.agentId ||
      (existing.claimToken &&
        existing.claimedAt &&
        existing.claimedAt > staleBefore)
    ) {
      return { claimed: false, row: existing };
    }

    const { count } = await this.prisma.aiVoiceAgentAutomation.updateMany({
      where: {
        id: existing.id,
        agentId: null,
        claimToken: existing.claimToken,
      },
      data: { claimToken: token, claimedAt: now, userId: ctx.userId },
    });
    const current = (await this.findForOwner(ctx, capability)) ?? existing;
    return count === 1
      ? { claimed: true, row: current }
      : { claimed: false, row: current };
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
   * Saves the setup of a capability whose agent already exists. An upsert on
   * the stable key, so re-running a setup converges instead of duplicating.
   */
  upsertForOwner(
    ctx: OrganizationOwnershipContext,
    capability: AiVoiceAgentType,
    data: {
      agentId: string;
      enabled: boolean;
      settings?: Prisma.InputJsonValue;
    },
  ): Promise<AiVoiceAgentAutomation> {
    return this.prisma.aiVoiceAgentAutomation.upsert({
      where: {
        organizationId_capability_contextKey: {
          organizationId: ctx.organizationId,
          capability,
          contextKey: AUTOMATION_WORKSPACE_CONTEXT,
        },
      },
      create: {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        capability,
        contextKey: AUTOMATION_WORKSPACE_CONTEXT,
        ...data,
      },
      update: {
        ...data,
        userId: ctx.userId,
        claimToken: null,
        claimedAt: null,
      },
    });
  }

  async updateForOwner(
    ctx: OrganizationOwnershipContext,
    id: string,
    data: { enabled?: boolean; settings?: Prisma.InputJsonValue },
  ): Promise<AiVoiceAgentAutomation | null> {
    const { count } = await this.prisma.aiVoiceAgentAutomation.updateMany({
      where: { id, organizationId: ctx.organizationId },
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
