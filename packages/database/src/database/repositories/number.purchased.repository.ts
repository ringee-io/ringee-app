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
  constructor(private readonly prisma: PrismaService) {}

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
    const values = await this.prisma.numberPurchased.findMany({
      // Only real purchased DIDs — verified caller IDs live in the same table
      // but are a different kind and are listed via the caller-id methods below.
      where: { ...ownershipFilter, kind: "purchased" },
      orderBy: { createdAt: "desc" },
      include: {
        userNumbers: true,
      },
    });

    const callerIds = await this.prisma.numberPurchased.findMany({
      where: { ...ownershipFilter, kind: "verified_caller_id", verified: true, verificationStatus: "verified" },
      orderBy: { createdAt: "desc" },
      include: {
        userNumbers: true,
      },
    });
    
    return [...values, ...callerIds];
  }

  countPurchasedByUser(userId: string): Promise<number> {
    return this.prisma.numberPurchased.count({
      where: {
        userId,
        kind: "purchased",
        status: { not: "released" },
      },
    });
  }

  /**
   * Owned numbers that can legitimately be presented as a caller ID for
   * rotation: purchased DIDs plus *verified, active* external caller IDs. Both
   * kinds live in this table — see `kind`. Soft-deleted rows are excluded.
   */
  async findRotatable(ctx: OwnershipContext): Promise<NumberPurchased[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.numberPurchased.findMany({
      where: {
        ...ownershipFilter,
        deletedAt: null,
        OR: [
          { kind: "purchased" },
          { kind: "verified_caller_id", verified: true, active: true },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Find an owned number (any kind) by its E.164 phone, scoped to the owner. */
  async findOwnedByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<NumberPurchased | null> {
    return this.prisma.numberPurchased.findFirst({
      where: { ...buildOwnershipFilter(ctx), phoneNumber, deletedAt: null },
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

  async findById(id: string): Promise<NumberPurchased | null> {
    return this.prisma.numberPurchased.findUnique({ where: { id } });
  }

  /** Looks a number up by its (unique) E.164 value — used for billing lookups. */
  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<NumberPurchased | null> {
    return this.prisma.numberPurchased.findUnique({ where: { phoneNumber } });
  }

  // ─── Verified caller IDs (kind = "verified_caller_id") ──────────────────
  // External numbers a user owns elsewhere and verified through Telnyx Verified
  // Numbers. Stored in this table, discriminated by `kind`, soft-deleted.

  private callerIdScope(
    ctx: OwnershipContext,
  ): Prisma.NumberPurchasedWhereInput {
    return {
      ...buildOwnershipFilter(ctx),
      kind: "verified_caller_id",
      deletedAt: null,
    };
  }

  async listCallerIds(ctx: OwnershipContext): Promise<NumberPurchased[]> {
    return this.prisma.numberPurchased.findMany({
      where: this.callerIdScope(ctx),
      orderBy: { createdAt: "desc" },
    });
  }

  async findCallerIdByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<NumberPurchased | null> {
    return this.prisma.numberPurchased.findFirst({
      where: { ...this.callerIdScope(ctx), phoneNumber },
    });
  }

  async findCallerIdById(id: string): Promise<NumberPurchased | null> {
    return this.prisma.numberPurchased.findFirst({
      where: { id, kind: "verified_caller_id", deletedAt: null },
    });
  }

  async createCallerId(
    ctx: OwnershipContext,
    data: Omit<
      Prisma.NumberPurchasedCreateInput,
      "user" | "organization" | "kind" | "campaigns"
    >,
  ): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.create({
      data: {
        ...data,
        kind: "verified_caller_id",
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async markCallerIdVerified(id: string): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.update({
      where: { id },
      data: {
        verified: true,
        active: true,
        verificationStatus: "verified",
        verifiedAt: new Date(),
      },
    });
  }

  async markCallerIdFailed(
    id: string,
    reason?: string,
  ): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.update({
      where: { id },
      data: {
        verified: false,
        verificationStatus: reason ? `failed:${reason}` : "failed",
      },
    });
  }

  async updateCallerId(
    id: string,
    data: Prisma.NumberPurchasedUpdateInput,
  ): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.update({ where: { id }, data });
  }

  async setCallerIdActive(
    id: string,
    active: boolean,
  ): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.update({
      where: { id },
      data: { active },
    });
  }

  async softDeleteCallerId(id: string): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
  }

  async update(
    id: string,
    data: Prisma.NumberPurchasedUpdateInput,
  ): Promise<NumberPurchased> {
    return this.prisma.numberPurchased.update({ where: { id }, data });
  }

  async updateMessagingForUserNumbers(
    numberId: string,
    data: {
      canSendSms?: boolean;
      canReceiveSms?: boolean;
      canSendMms?: boolean;
      canReceiveMms?: boolean;
    },
  ): Promise<void> {
    await this.prisma.userNumber.updateMany({
      where: { numberId },
      data,
    });
  }

  /**
   * Pending numbers awaiting regulatory approval that still have a provider
   * order to reconcile against. Used by the orchestrator poller.
   */
  async findPendingProviderOrders(): Promise<NumberPurchased[]> {
    return this.prisma.numberPurchased.findMany({
      where: {
        status: "pending",
        providerNumberId: { not: null },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Enables the UserNumber rows for a number once its order is provisioned, so
   * it becomes usable (callable) for the owner.
   */
  async enableUserNumbersOnProvision(
    numberId: string,
    isPrimary: boolean,
  ): Promise<void> {
    await this.prisma.userNumber.updateMany({
      where: { numberId },
      data: {
        enabled: true,
        canCall: true,
        canReceive: true,
        isPrimary,
      },
    });
  }
}
