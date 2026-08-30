import { Injectable } from "@nestjs/common";
import {
  AiVoiceAgent,
  AiVoiceAgentKnowledgeSource,
  AiVoiceAgentKnowledgeStatus,
  AiVoiceAgentStatus,
  AiVoiceAgentType,
  Prisma,
} from "@prisma/client";
import {
  buildOwnershipData,
  buildOwnershipFilter,
  OwnershipContext,
} from "@ringee/platform";
import { PrismaService } from "../prisma.service";

export interface AiVoiceAgentWithSources extends AiVoiceAgent {
  knowledgeSources: AiVoiceAgentKnowledgeSource[];
}

/**
 * Agents and their knowledge sources. Every workspace-scoped read goes through
 * the ownership filter; `findByIdForOwner` is the only lookup services should
 * use before acting on an agent.
 */
@Injectable()
export class AiVoiceAgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Agents ───────────────────────────────────────────────────

  create(
    ctx: OwnershipContext,
    data: Omit<
      Prisma.AiVoiceAgentUncheckedCreateInput,
      "userId" | "organizationId"
    >,
  ): Promise<AiVoiceAgent> {
    return this.prisma.aiVoiceAgent.create({
      data: { ...data, ...buildOwnershipData(ctx) },
    });
  }

  /** Workspace-checked lookup. Never load an agent by id alone. */
  findByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<AiVoiceAgentWithSources | null> {
    return this.prisma.aiVoiceAgent.findFirst({
      where: { id, deletedAt: null, ...buildOwnershipFilter(ctx) },
      include: { knowledgeSources: { orderBy: { createdAt: "asc" } } },
    });
  }

  /**
   * Lookup by the provider's assistant id, used when a provider callback names
   * an assistant. The caller still has to prove the workspace matches.
   */
  findByProviderAssistantId(
    providerAssistantId: string,
  ): Promise<AiVoiceAgent | null> {
    return this.prisma.aiVoiceAgent.findFirst({
      where: { providerAssistantId, deletedAt: null },
    });
  }

  /**
   * Lookup by id alone, for the provider tool callbacks: those arrive with no
   * Ringee session, so the caller proves itself with the agent's shared secret
   * and derives the workspace from this row. Never use it on a request that
   * carries a user.
   */
  findByIdForToolCallback(id: string): Promise<AiVoiceAgent | null> {
    return this.prisma.aiVoiceAgent.findUnique({ where: { id } });
  }

  async listForOwner(
    ctx: OwnershipContext,
    options?: {
      page?: number;
      limit?: number;
      type?: AiVoiceAgentType;
      status?: AiVoiceAgentStatus;
    },
  ): Promise<{
    data: AiVoiceAgent[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Prisma.AiVoiceAgentWhereInput = {
      deletedAt: null,
      ...buildOwnershipFilter(ctx),
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.status ? { status: options.status } : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.aiVoiceAgent.count({ where }),
      this.prisma.aiVoiceAgent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  /** Call counts per agent, for the list screen. */
  async countCallsByAgent(agentIds: string[]): Promise<Map<string, number>> {
    if (agentIds.length === 0) return new Map();
    const rows = await this.prisma.aiVoiceAgentCall.groupBy({
      by: ["agentId"],
      where: { agentId: { in: agentIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.agentId, r._count._all]));
  }

  update(
    id: string,
    data: Prisma.AiVoiceAgentUncheckedUpdateInput,
  ): Promise<AiVoiceAgent> {
    return this.prisma.aiVoiceAgent.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<AiVoiceAgent> {
    return this.prisma.aiVoiceAgent.update({
      where: { id },
      data: { deletedAt: new Date(), status: AiVoiceAgentStatus.disabled },
    });
  }

  // ── Knowledge sources ────────────────────────────────────────

  createKnowledgeSource(
    data: Prisma.AiVoiceAgentKnowledgeSourceUncheckedCreateInput,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    return this.prisma.aiVoiceAgentKnowledgeSource.create({ data });
  }

  listKnowledgeSources(
    agentId: string,
  ): Promise<AiVoiceAgentKnowledgeSource[]> {
    return this.prisma.aiVoiceAgentKnowledgeSource.findMany({
      where: { agentId },
      orderBy: { createdAt: "asc" },
    });
  }

  findKnowledgeSource(
    agentId: string,
    id: string,
  ): Promise<AiVoiceAgentKnowledgeSource | null> {
    return this.prisma.aiVoiceAgentKnowledgeSource.findFirst({
      where: { id, agentId },
    });
  }

  updateKnowledgeSource(
    id: string,
    data: Prisma.AiVoiceAgentKnowledgeSourceUncheckedUpdateInput,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    return this.prisma.aiVoiceAgentKnowledgeSource.update({
      where: { id },
      data,
    });
  }

  setKnowledgeSourceStatus(
    id: string,
    status: AiVoiceAgentKnowledgeStatus,
    lastError?: string | null,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    return this.prisma.aiVoiceAgentKnowledgeSource.update({
      where: { id },
      data: { status, lastError: lastError ?? null },
    });
  }

  deleteKnowledgeSource(id: string): Promise<AiVoiceAgentKnowledgeSource> {
    return this.prisma.aiVoiceAgentKnowledgeSource.delete({ where: { id } });
  }
}
