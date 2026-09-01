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
   */
  listUnsettled(olderThan: Date, take = 50): Promise<AiVoiceAgentCall[]> {
    return this.prisma.aiVoiceAgentCall.findMany({
      where: {
        providerConversationId: { not: null },
        updatedAt: { lt: olderThan },
        OR: [{ costSettledAt: null }, { aiCostDebitedAt: null }],
      },
      orderBy: { updatedAt: "asc" },
      take,
    });
  }
}
