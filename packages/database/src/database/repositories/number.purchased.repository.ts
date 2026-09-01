import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  NumberPurchased,
  OutboundSource,
  UserNumber,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

/** Mirrors the `allowedOutboundSources` default in schema.prisma. */
const DEFAULT_OUTBOUND_SOURCES: OutboundSource[] = [
  "web",
  "chrome_extension",
  "mobile",
  "sip_device",
  "ai_voice_agent",
];

@Injectable()
export class NumberPurchasedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ctx: OwnershipContext,
    data: Omit<Prisma.NumberPurchasedCreateInput, "user" | "organization">,
  ): Promise<NumberPurchased> {
    // `phoneNumber` is unique account-wide. A number that was retired (see
    // `releasePermanently`) goes back into the carrier's inventory and can be
    // bought again — by anyone — so the retired row is revived instead of
    // colliding with a create that the customer has already paid for.
    const retired = await this.prisma.numberPurchased.findFirst({
      where: {
        phoneNumber: data.phoneNumber,
        kind: "purchased",
        deletedAt: { not: null },
      },
      select: { id: true },
    });

    if (retired) {
      const { userNumbers, ...rest } = data;
      return this.prisma.numberPurchased.update({
        where: { id: retired.id },
        data: {
          ...rest,
          deletedAt: null,
          active: true,
          // The row is recycled, but for this owner the number starts now —
          // "my numbers" is ordered by createdAt.
          createdAt: new Date(),
          userNumbers,
          user: { connect: { id: ctx.userId } },
          organization: ctx.organizationId
            ? { connect: { id: ctx.organizationId } }
            : { disconnect: true },
        },
      });
    }

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
      // Retired numbers (subscription cancelled, released at the carrier) are
      // soft-deleted and must not resurface as owned numbers.
      where: { ...ownershipFilter, kind: "purchased", deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        userNumbers: true,
      },
    });

    const callerIds = await this.prisma.numberPurchased.findMany({
      where: {
        ...ownershipFilter,
        kind: "verified_caller_id",
        verified: true,
        verificationStatus: "verified",
        // Caller IDs are soft-deleted: without this a removed caller ID keeps
        // showing up as a dialable number.
        deletedAt: null,
        active: true,
      },
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
        deletedAt: null,
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

  /**
   * Re-home a number across workspace boundaries. Workspace-specific routing,
   * campaign and rotation links are intentionally reset so the destination can
   * configure the number without inheriting cross-tenant references.
   */
  async transferWorkspace(
    numberId: string,
    source: { userId: string; organizationId: string | null },
    target: { userId: string; organizationId: string | null },
  ): Promise<NumberPurchased> {
    return this.prisma.$transaction(async (tx) => {
      const number = await tx.numberPurchased.findUnique({
        where: { id: numberId },
      });
      if (!number) throw new NotFoundException("Number not found");
      const stillOwnedBySource = source.organizationId
        ? number.organizationId === source.organizationId
        : number.organizationId === null && number.userId === source.userId;
      if (!stillOwnedBySource) {
        throw new NotFoundException("Number is no longer in this workspace");
      }

      const previousUserNumber = await tx.userNumber.findFirst({
        where: { numberId, userId: target.userId },
        orderBy: { enabled: "desc" },
      });

      await tx.sipDevice.updateMany({
        where: { assignedPhoneNumberId: numberId },
        data: { assignedPhoneNumberId: null, callerId: null },
      });
      await tx.campaign.updateMany({
        where: { numberPurchasedId: numberId },
        data: { numberPurchasedId: null },
      });
      await tx.campaign.updateMany({
        where: { callerIdId: numberId },
        data: { callerIdId: null },
      });

      const rotationCampaigns = await tx.campaign.findMany({
        where: { rotationNumberIds: { has: numberId } },
        select: { id: true, rotationNumberIds: true },
      });
      for (const campaign of rotationCampaigns) {
        await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            rotationNumberIds: {
              set: campaign.rotationNumberIds.filter((id) => id !== numberId),
            },
          },
        });
      }

      await tx.callerIdPoolMember.deleteMany({ where: { numberId } });
      await tx.userNumber.deleteMany({ where: { numberId } });

      if (number.kind === "purchased") {
        const hasPrimary = await tx.userNumber.count({
          where: {
            userId: target.userId,
            organizationId: target.organizationId,
            enabled: true,
            isPrimary: true,
          },
        });
        const enabled =
          number.status !== "pending" &&
          number.status !== "released" &&
          number.deletedAt === null;

        await tx.userNumber.create({
          data: {
            userId: target.userId,
            organizationId: target.organizationId,
            numberId,
            enabled,
            isPrimary: enabled && hasPrimary === 0,
            canCall: enabled,
            canReceive: enabled,
            canRecord: previousUserNumber?.canRecord ?? false,
            canSendSms: enabled && number.smsEnabled,
            canReceiveSms: enabled && number.smsEnabled,
            canSendMms: enabled && number.mmsEnabled,
            canReceiveMms: enabled && number.mmsEnabled,
          },
        });
      }

      return tx.numberPurchased.update({
        where: { id: numberId },
        data: {
          userId: target.userId,
          organizationId: target.organizationId,
          inboundMode: "ringee_default",
          inboundSipDeviceId: null,
          allowedOutboundUserIds: [],
        },
      });
    });
  }

  /**
   * Permanently retires a number: the subscription that paid for it is gone and
   * the DID has been (or is about to be) released at the carrier, so every
   * reference that could still route a call through it is cleared and the row
   * is soft-deleted. Historical `Call.callerIdId` links are deliberately kept
   * so past calls stay attributable — the row survives, hidden.
   *
   * A released DID goes back into the carrier's inventory and may be bought
   * again by *someone else*, reviving this very row (see `create`). Everything
   * that belongs to the outgoing owner is therefore wiped here rather than at
   * revive time: regulatory submissions (documents/addresses would otherwise
   * prefill a stranger's verification form), rotation counters, routing
   * restrictions and the carrier capability snapshot.
   */
  async releasePermanently(numberId: string): Promise<NumberPurchased> {
    return this.prisma.$transaction(async (tx) => {
      await tx.sipDevice.updateMany({
        where: { assignedPhoneNumberId: numberId },
        data: { assignedPhoneNumberId: null, callerId: null },
      });
      await tx.campaign.updateMany({
        where: { numberPurchasedId: numberId },
        data: { numberPurchasedId: null },
      });
      await tx.campaign.updateMany({
        where: { callerIdId: numberId },
        data: { callerIdId: null },
      });

      const rotationCampaigns = await tx.campaign.findMany({
        where: { rotationNumberIds: { has: numberId } },
        select: { id: true, rotationNumberIds: true },
      });
      for (const campaign of rotationCampaigns) {
        await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            rotationNumberIds: {
              set: campaign.rotationNumberIds.filter((id) => id !== numberId),
            },
          },
        });
      }

      await tx.callerIdPoolMember.deleteMany({ where: { numberId } });
      await tx.callerIdDailyUsage.deleteMany({ where: { numberId } });
      await tx.userNumber.deleteMany({ where: { numberId } });
      await tx.numberRequirementValue.deleteMany({
        where: { numberPurchasedId: numberId },
      });

      return tx.numberPurchased.update({
        where: { id: numberId },
        data: {
          userId: null,
          organizationId: null,
          status: "released",
          assignedDate: null,
          deletedAt: new Date(),
          active: false,
          inboundMode: "ringee_default",
          inboundSipDeviceId: null,
          allowedOutboundUserIds: [],
          allowedOutboundSources: DEFAULT_OUTBOUND_SOURCES,
          providerConnectionId: null,
          providerConnectionName: null,
          providerMessagingProfileId: null,
          messagingEnabled: false,
          messagingStatus: null,
          messagingError: null,
          smsEnabled: false,
          mmsEnabled: false,
          voiceEnabled: false,
          faxEnabled: false,
          hdVoiceEnabled: false,
          internationalSmsEnabled: false,
          emergencyEnabled: false,
          features: Prisma.DbNull,
        },
      });
    });
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
