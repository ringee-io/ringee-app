import { Injectable } from "@nestjs/common";
import { Prisma, MessageEvent } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class MessageEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProviderEventId(
    providerEventId: string,
  ): Promise<MessageEvent | null> {
    return this.prisma.messageEvent.findUnique({
      where: { providerEventId },
    });
  }

  async create(data: Prisma.MessageEventCreateInput): Promise<MessageEvent> {
    return this.prisma.messageEvent.create({ data });
  }

  async markProcessed(id: string): Promise<MessageEvent> {
    return this.prisma.messageEvent.update({
      where: { id },
      data: { processedAt: new Date() },
    });
  }
}
