import { Injectable } from "@nestjs/common";
import { AiAgentType, AiConversation, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AiConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    userId: string;
    organizationId?: string | null;
    agent: AiAgentType;
    title?: string | null;
    agentState?: Prisma.InputJsonValue | null;
  }): Promise<AiConversation> {
    return this.prisma.aiConversation.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        agent: input.agent,
        title: input.title ?? null,
        ...(input.agentState != null ? { agentState: input.agentState } : {}),
      },
    });
  }

  findById(id: string): Promise<AiConversation | null> {
    return this.prisma.aiConversation.findUnique({ where: { id } });
  }

  listForOwner(input: {
    userId: string;
    organizationId: string | null;
    agent?: AiAgentType;
    limit?: number;
  }): Promise<AiConversation[]> {
    const where: Prisma.AiConversationWhereInput = {
      archivedAt: null,
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.organizationId
        ? { organizationId: input.organizationId }
        : { userId: input.userId, organizationId: null }),
    };
    return this.prisma.aiConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: input.limit ?? 50,
    });
  }

  updateTitle(id: string, title: string): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { title },
    });
  }

  updateProviderSelection(
    id: string,
    providerSelection: string | null,
  ): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { providerSelection },
    });
  }

  mergeAgentState(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { agentState: patch as Prisma.InputJsonValue },
    });
  }

  setSummary(
    id: string,
    summary: string,
    summaryTokens: number | null,
  ): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { summary, summaryTokens },
    });
  }

  /** Add to the running AI cost total for a conversation. */
  incrementCost(id: string, amount: number): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { totalCostCredits: { increment: amount } },
    });
  }

  touchLastMessageAt(
    id: string,
    at: Date = new Date(),
  ): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { lastMessageAt: at },
    });
  }

  archive(id: string): Promise<AiConversation> {
    return this.prisma.aiConversation.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
