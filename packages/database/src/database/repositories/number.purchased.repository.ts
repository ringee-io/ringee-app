import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, NumberPurchased, UserNumber } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

@Injectable()
export class NumberPurchasedRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(
    ctx: OwnershipContext,
    data: Omit<Prisma.NumberPurchasedCreateInput, "user" | "organization">,
  ): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.create({
      data: {
        ...data,
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async findByOwner(
    ctx: OwnershipContext,
  ): Promise<(NumberPurchased & { userNumbers: UserNumber[] })[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.numberPurchased.findMany({
      where: ownershipFilter,
      orderBy: { createdAt: "desc" },
      include: {
        userNumbers: true,
      },
    });
  }

  async assignToOwner(
    numberId: string,
    ctx: OwnershipContext,
  ): Promise<NumberPurchased> {
    const number = await this.prisma.numberPurchased.findUnique({
      where: { id: numberId },
    });
    if (number === null || number.status === "assigned") {
      throw new NotFoundException("Number not found");
    }

    const userNumber = await this.prisma.userNumber.findMany({
      where: { numberId, enabled: true },
    });

    if (userNumber.length > 0) {
      const alreadyAsignedToUser = userNumber.find(
        (userNumber) => userNumber.userId === ctx.userId,
      );

      if (alreadyAsignedToUser) {
        throw new BadRequestException("Number already assigned to user");
      }

      throw new BadRequestException("Number already assigned to another user");
    }

    const find = await this.prisma.userNumber.findUnique({
      where: {
        userId_numberId_enabled: {
          userId: ctx.userId,
          numberId,
          enabled: false,
        },
      },
    });

    if (find) {
      await this.prisma.userNumber.update({
        where: {
          userId_numberId_enabled: {
            userId: ctx.userId,
            numberId,
            enabled: false,
          },
        },
        data: {
          enabled: true,
          organizationId: ctx.organizationId ?? null,
        },
      });
    }

    return this.prisma.numberPurchased.update({
      where: { id: numberId },
      data: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        assignedDate: new Date(),
        status: "assigned",
      },
    });
  }

  async release(id: string): Promise<NumberPurchased> {
    const existing = await this.prisma.numberPurchased.findUnique({
      where: { id },
    });

    if (existing !== null && existing.status !== "assigned") {
      throw new NotFoundException("Number not found");
    }

    const userNumber = await this.prisma.userNumber.findUnique({
      where: {
        userId_numberId_enabled: {
          userId: existing!.userId!,
          numberId: existing!.id,
          enabled: true,
        },
      },
    });

    if (userNumber === null) {
      throw new NotFoundException("User number not found");
    }

    await this.prisma.userNumber.update({
      where: {
        userId_numberId_enabled: {
          userId: existing!.userId!,
          numberId: existing!.id,
          enabled: true,
        },
      },
      data: {
        enabled: false,
      },
    });

    return this.prisma.numberPurchased.update({
      where: {
        id,
      },
      data: {
        userId: null,
        organizationId: null,
        status: "released",
        assignedDate: null,
      },
    });
  }

  async findOne(
    payload: Prisma.NumberPurchasedWhereInput,
  ): Promise<NumberPurchased | null> {
    return this.prisma.numberPurchased.findFirst({
      where: payload,
    });
  }
}
