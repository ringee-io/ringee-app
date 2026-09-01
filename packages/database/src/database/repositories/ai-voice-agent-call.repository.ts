import { Injectable } from "@nestjs/common";
import {
  AiVoiceAgentCall,
  AiVoiceAgentCallStatus,
  AiVoiceAgentOutcome,
  Prisma,
} from "@prisma/client";
import { buildOwnershipFilter, OwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

/**
 * The agent-side half of a call. The telephony half is a `Call` row; the two
 * are joined through `callId`, which stays null until the provider accepts the
 * call.
 */
@Injectable()
export class AiVoiceAgentCallRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.AiVoiceAgentCallUncheckedCreateInput,
  ): Promise<AiVoiceAgentCall> {
    return this.prisma.aiVoiceAgentCall.create({ data });
  }

  findById(id: string): Promise<AiVoiceAgentCall | null> {
    return this.prisma.aiVoiceAgentCall.findUnique({ where: { id } });
  }

  /** Workspace-checked lookup for anything a request can reach. */
  findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<AiVoiceAgentCall | null> {
    return this.prisma.aiVoiceAgentCall.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  findByCallId(callId: string): Promise<AiVoiceAgentCall | null> {
    return this.prisma.aiVoiceAgentCall.findUnique({ where: { callId } });
  }

  findByConversationId(
    providerConversationId: string,
  ): Promise<AiVoiceAgentCall | null> {
    return this.prisma.aiVoiceAgentCall.findUnique({
      where: { providerConversationId },
    });
  }

  findByCallControlId(
    providerCallControlId: string,
  ): Promise<AiVoiceAgentCall | null> {
    return this.prisma.aiVoiceAgentCall.findFirst({
      where: { providerCallControlId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listForAgent(
    ctx: OwnershipContext,
    agentId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: AiVoiceAgentCallStatus;
      outcome?: AiVoiceAgentOutcome;
    },
  ): Promise<{
    data: AiVoiceAgentCall[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.AiVoiceAgentCallWhereInput = {
      agentId,
      ...buildOwnershipFilter(ctx),
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.outcome ? { outcome: options.outcome } : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.aiVoiceAgentCall.count({ where }),
      this.prisma.aiVoiceAgentCall.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  update(
    id: string,
    data: Prisma.AiVoiceAgentCallUncheckedUpdateInput,
  ): Promise<AiVoiceAgentCall> {
    return this.prisma.aiVoiceAgentCall.update({ where: { id }, data });
  }

  /**
   * Settle the AI-usage charge exactly once. `costSettledAt` is the idempotency
   * guard (BILL-003/BILL-004): a replay updates zero rows and returns false.
   */
  async settleAiCostOnce(
    id: string,
    costUsd: number,
    chargedCredits: number,
  ): Promise<boolean> {
    const res = await this.prisma.aiVoiceAgentCall.updateMany({
      where: { id, costSettledAt: null },
      data: {
        aiCostUsd: costUsd,
        aiChargedCredits: chargedCredits,
        costSettledAt: new Date(),
      },
    });
    return res.count === 1;
  }

  /** Records that the debit for a claimed settlement actually went through. */
  async markAiCostDebited(id: string): Promise<void> {
    await this.prisma.aiVoiceAgentCall.update({
      where: { id },
      data: { aiCostDebitedAt: new Date() },
    });
  }

  /**
   * Rows the reconciliation sweep still owes work on.
   *
   * Two kinds, not one: a call that has not been priced yet, and a call whose
   * settlement was claimed but whose debit never completed — a crash between
   * the two leaves `costSettledAt` set with no credits taken, and filtering on
   * `costSettledAt: null` alone would drop that call for good.
   *
   * Either provider handle qualifies. `providerConversationId` is only ever
   * written by the conversation webhook, so requiring it here hid every call
   * whose webhook never arrived — permanently, and silently, because those
   * calls are exactly the ones nothing else was going to settle. The control
   * id is written when the call is placed and is enough to price it.
   *
   * The voice leg counts as outstanding work too. Its marker lives on the
   * `Call` row (`totalCost`), the same one the cost webhook claims, so the two
   * halves of an agent call are settled by whichever path gets there first and
   * neither can strand the other.
   */
  listUnsettled(olderThan: Date, take = 50): Promise<AiVoiceAgentCall[]> {
    return this.prisma.aiVoiceAgentCall.findMany({
      where: {
        OR: [
          { providerConversationId: { not: null } },
          { providerCallControlId: { not: null } },
        ],
        updatedAt: { lt: olderThan },
        AND: [
          {
            OR: [
              { costSettledAt: null },
              { aiCostDebitedAt: null },
              { call: { is: { totalCost: null } } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take,
    });
  }

  /**
   * Calls that connected but whose recording or transcript is still missing.
   *
   * The artifacts of a call are published on their own schedule, independent
   * of the usage records that price it — so a call routinely settles its money
   * on the first sweep while its recording is still being written. Settled
   * calls leave `listUnsettled`, which is why they need a list of their own:
   * without one, an artifact that was a minute late was never fetched again.
   *
   * Bounded at both ends on purpose. Only `completed` calls are considered —
   * a call that was never answered has no audio and no conversation to wait
   * for — and only inside `endedAfter`, so calls whose recording genuinely
   * never existed stop being chased instead of being retried forever.
   */
  listMissingArtifacts(
    window: { endedAfter: Date; updatedBefore: Date },
    take = 50,
  ): Promise<AiVoiceAgentCall[]> {
    return this.prisma.aiVoiceAgentCall.findMany({
      where: {
        status: AiVoiceAgentCallStatus.completed,
        callId: { not: null },
        updatedAt: { gte: window.endedAfter, lt: window.updatedBefore },
        call: {
          is: {
            OR: [
              { recordings: { none: { status: "completed" } } },
              { callTranscriptions: { none: { status: "completed" } } },
            ],
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      take,
    });
  }
}
