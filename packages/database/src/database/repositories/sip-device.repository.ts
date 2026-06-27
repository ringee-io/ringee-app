import { Injectable } from "@nestjs/common";
import {
  Prisma,
  SipDevice,
  NumberPurchased,
  NumberInboundMode,
  SipDeviceStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

export type SipDeviceWithNumber = SipDevice & {
  assignedNumber: NumberPurchased | null;
};

/**
 * Data access for Desk Phones (SIP Devices). Number-routing mutations that
 * touch both SipDevice and NumberPurchased are wrapped in transactions here so
 * the device's `assignedPhoneNumberId` and the number's `inboundSipDeviceId`
 * never drift apart.
 */
@Injectable()
export class SipDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SipDeviceCreateInput): Promise<SipDevice> {
    return this.prisma.sipDevice.create({ data });
  }

  findById(id: string): Promise<SipDeviceWithNumber | null> {
    return this.prisma.sipDevice.findUnique({
      where: { id },
      include: { assignedNumber: true },
    });
  }

  /** A device that exists and has not been soft-deleted. */
  findActiveById(id: string): Promise<SipDeviceWithNumber | null> {
    return this.prisma.sipDevice.findFirst({
      where: { id, deletedAt: null },
      include: { assignedNumber: true },
    });
  }

  findByPublicRef(publicRef: string): Promise<SipDeviceWithNumber | null> {
    return this.prisma.sipDevice.findUnique({
      where: { publicRef },
      include: { assignedNumber: true },
    });
  }

  /** Used by the desk-phone webhook to attribute a parked call to its device. */
  findByConnectionId(
    connectionId: string,
  ): Promise<SipDeviceWithNumber | null> {
    return this.prisma.sipDevice.findFirst({
      where: { telnyxConnectionId: connectionId, deletedAt: null },
      include: { assignedNumber: true },
    });
  }

  listByOwner(ctx: OwnershipContext): Promise<SipDeviceWithNumber[]> {
    return this.prisma.sipDevice.findMany({
      where: { ...buildOwnershipFilter(ctx), deletedAt: null },
      include: { assignedNumber: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Uniqueness probes used while generating publicRef / sipUsername. */
  async publicRefExists(publicRef: string): Promise<boolean> {
    const found = await this.prisma.sipDevice.findUnique({
      where: { publicRef },
      select: { id: true },
    });
    return !!found;
  }

  async sipUsernameExists(sipUsername: string): Promise<boolean> {
    const found = await this.prisma.sipDevice.findUnique({
      where: { sipUsername },
      select: { id: true },
    });
    return !!found;
  }

  update(id: string, data: Prisma.SipDeviceUpdateInput): Promise<SipDevice> {
    return this.prisma.sipDevice.update({ where: { id }, data });
  }

  /**
   * Attach `numberId` to a device: record it as the device's number + caller
   * ID, and — when `routeInbound` — flip the number's inbound routing to this
   * desk phone (so it stops ringing in Ringee Web/Extension/Mobile). Any other
   * device pointing at this number for inbound is detached first.
   */
  async attachNumber(params: {
    deviceId: string;
    numberId: string;
    callerId: string;
    routeInbound: boolean;
  }): Promise<void> {
    const { deviceId, numberId, callerId, routeInbound } = params;
    await this.prisma.$transaction(async (tx) => {
      await tx.sipDevice.update({
        where: { id: deviceId },
        data: { assignedPhoneNumberId: numberId, callerId },
      });
      if (routeInbound) {
        await tx.numberPurchased.update({
          where: { id: numberId },
          data: {
            inboundMode: NumberInboundMode.desk_phone_only,
            inboundSipDeviceId: deviceId,
          },
        });
      }
    });
  }

  /**
   * Detach the device's currently-assigned number and decide what happens to
   * that number's inbound routing:
   * - mode "ringee": the number rings in Ringee apps again (ringee_default).
   * - mode "device": the number's inbound is reassigned to `targetDeviceId`.
   * Only resets the number row when it was actually pointing at this device.
   */
  async detachNumber(params: {
    deviceId: string;
    restore: NumberInboundMode;
    targetDeviceId?: string | null;
  }): Promise<void> {
    const { deviceId, restore, targetDeviceId } = params;
    await this.prisma.$transaction(async (tx) => {
      const device = await tx.sipDevice.findUnique({
        where: { id: deviceId },
        select: { assignedPhoneNumberId: true },
      });
      const numberId = device?.assignedPhoneNumberId ?? null;

      await tx.sipDevice.update({
        where: { id: deviceId },
        data: { assignedPhoneNumberId: null, callerId: null },
      });

      if (numberId) {
        if (restore === NumberInboundMode.desk_phone_only && targetDeviceId) {
          await tx.numberPurchased.update({
            where: { id: numberId },
            data: {
              inboundMode: NumberInboundMode.desk_phone_only,
              inboundSipDeviceId: targetDeviceId,
            },
          });
          await tx.sipDevice.update({
            where: { id: targetDeviceId },
            data: {
              assignedPhoneNumberId: numberId,
            },
          });
        } else {
          await tx.numberPurchased.update({
            where: { id: numberId },
            data: {
              inboundMode: NumberInboundMode.ringee_default,
              inboundSipDeviceId: null,
            },
          });
        }
      }
    });
  }

  /** Soft-delete: mark deleted and clear any inbound routing pointing here. */
  async softDelete(id: string): Promise<void> {
    await this.prisma.sipDevice.update({
      where: { id },
      data: { status: SipDeviceStatus.deleted, deletedAt: new Date() },
    });
  }
}
