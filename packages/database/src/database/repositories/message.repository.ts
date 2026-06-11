import { Injectable } from "@nestjs/common";
import { Prisma, Message, MessageStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.MessageCreateInput): Promise<Message> {
    return this.prisma.message.create({ data });
  }

  async findById(id: string): Promise<Message | null> {
    return this.prisma.message.findUnique({ where: { id } });
  }

  async findByProviderId(providerMessageId: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { providerMessageId },
    });
  }

  async findByIdempotencyKey(key: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async update(id: string, data: Prisma.MessageUpdateInput): Promise<Message> {
    return this.prisma.message.update({ where: { id }, data });
  }

  async updateStatus(
    id: string,
    status: MessageStatus,
    extra: Partial<Prisma.MessageUpdateInput> = {},
  ): Promise<Message> {
    return this.prisma.message.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  async updateCost(
    id: string,
    totalCost: number,
    costMeta: Prisma.InputJsonValue,
  ): Promise<Message> {
    return this.prisma.message.update({
      where: { id },
      data: { totalCost, costMeta },
    });
  }
}
