import { Injectable } from "@nestjs/common";
import { CallerId, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

@Injectable()
export class CallerIdRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(
    ctx: OwnershipContext,
    data: Omit<Prisma.CallerIdCreateInput, "user" | "organization">,
  ): Promise<CallerId> {
    return this.prisma.callerId.create({
      data: {
        ...data,
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async findById(id: string): Promise<CallerId | null> {
    return this.prisma.callerId.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<CallerId | null> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.callerId.findFirst({
      where: { ...ownershipFilter, phoneNumber, deletedAt: null },
    });
  }

  async listByOwner(ctx: OwnershipContext): Promise<CallerId[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.callerId.findMany({
      where: { ...ownershipFilter, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async markVerified(id: string): Promise<CallerId> {
    return this.prisma.callerId.update({
      where: { id },
      data: {
        verified: true,
        status: "verified",
        verifiedAt: new Date(),
      },
    });
  }

  async markFailed(id: string, reason?: string): Promise<CallerId> {
    return this.prisma.callerId.update({
      where: { id },
      data: {
        verified: false,
        status: reason ? `failed:${reason}` : "failed",
      },
    });
  }

  async softDelete(id: string): Promise<CallerId> {
    return this.prisma.callerId.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async deletePermanently(id: string): Promise<CallerId> {
    return this.prisma.callerId.delete({ where: { id } });
  }
}
