import { Injectable } from "@nestjs/common";
import { AiToolEvent, AiToolEventKind, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AiToolEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    conversationId: string;
    messageId?: string | null;
    kind: AiToolEventKind;
    payload: Record<string, unknown>;
  }): Promise<AiToolEvent> {
    return this.prisma.aiToolEvent.create({
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        kind: input.kind,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  findById(id: string): Promise<AiToolEvent | null> {
    return this.prisma.aiToolEvent.findUnique({ where: { id } });
  }

  resolve(
    id: string,
    resolutionData: Record<string, unknown>,
  ): Promise<AiToolEvent> {
    return this.prisma.aiToolEvent.update({
      where: { id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolutionData: resolutionData as Prisma.InputJsonValue,
      },
    });
  }

  listForConversation(
    conversationId: string,
    limit = 200,
  ): Promise<AiToolEvent[]> {
    return this.prisma.aiToolEvent.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  listPendingConfirmations(conversationId: string): Promise<AiToolEvent[]> {
    return this.prisma.aiToolEvent.findMany({
      where: {
        conversationId,
        kind: "confirmation_request",
        resolved: false,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
