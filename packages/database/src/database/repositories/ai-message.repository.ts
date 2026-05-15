import { Injectable } from "@nestjs/common";
import {
  AiMessage,
  AiMessageRole,
  AiMessageStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AiMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    conversationId: string;
    userId?: string | null;
    role: AiMessageRole;
    content?: string | null;
    toolName?: string | null;
    toolPayload?: Record<string, unknown> | null;
    status?: AiMessageStatus;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
  }): Promise<AiMessage> {
    return this.prisma.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        userId: input.userId ?? null,
        role: input.role,
        content: input.content ?? null,
        toolName: input.toolName ?? null,
        toolPayload: (input.toolPayload ?? null) as Prisma.InputJsonValue,
        status: input.status ?? "completed",
        model: input.model ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        cachedTokens: input.cachedTokens ?? null,
      },
    });
  }

  appendContent(id: string, delta: string): Promise<AiMessage> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiMessage.findUnique({ where: { id } });
      const next = (existing?.content ?? "") + delta;
      return tx.aiMessage.update({
        where: { id },
        data: { content: next, status: "streaming" },
      });
    });
  }

  /** Attach a tool call to an already-streamed assistant text row. */
  attachToolCall(input: {
    id: string;
    toolName: string;
    toolPayload: Record<string, unknown>;
    content?: string | null;
    status?: AiMessageStatus;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
  }): Promise<AiMessage> {
    return this.prisma.aiMessage.update({
      where: { id: input.id },
      data: {
        toolName: input.toolName,
        toolPayload: input.toolPayload as Prisma.InputJsonValue,
        ...(input.content !== undefined ? { content: input.content } : {}),
        status: input.status ?? "completed",
        model: input.model ?? undefined,
        inputTokens: input.inputTokens ?? undefined,
        outputTokens: input.outputTokens ?? undefined,
        cachedTokens: input.cachedTokens ?? undefined,
      },
    });
  }

  finalize(input: {
    id: string;
    content: string;
    status?: AiMessageStatus;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
  }): Promise<AiMessage> {
    return this.prisma.aiMessage.update({
      where: { id: input.id },
      data: {
        content: input.content,
        status: input.status ?? "completed",
        model: input.model ?? undefined,
        inputTokens: input.inputTokens ?? undefined,
        outputTokens: input.outputTokens ?? undefined,
        cachedTokens: input.cachedTokens ?? undefined,
      },
    });
  }

  listForConversation(
    conversationId: string,
    limit = 200,
  ): Promise<AiMessage[]> {
    return this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  /** Most recent N messages, returned in chronological order. */
  async recent(conversationId: string, take: number): Promise<AiMessage[]> {
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.reverse();
  }
}
