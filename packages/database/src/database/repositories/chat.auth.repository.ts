import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { ChatAuth, Prisma } from "@prisma/client";
import { OwnershipContext } from "@ringee/platform";

@Injectable()
export class ChatAuthRepository {
  constructor(private prisma: PrismaService) { }

  async createChatAuth(
    ctx: OwnershipContext,
    data: Omit<Prisma.ChatAuthCreateInput, "user" | "organization">,
  ): Promise<ChatAuth> {
    return this.prisma.chatAuth.create({
      data: {
        ...data,
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.chatAuth.findFirst({
      where: {
        phoneNumber,
        deletedAt: null,
      },
      select: {
        id: true,
        phoneNumber: true,
        organizationId: true,
        user: {
          select: {
            id: true,
            emails: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async deleteChatAuth(id: string): Promise<void> {
    await this.prisma.chatAuth.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
