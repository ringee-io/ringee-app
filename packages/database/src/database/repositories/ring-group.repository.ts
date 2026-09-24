import { Injectable } from "@nestjs/common";
import { Prisma, RingGroup, RingGroupMember } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";

export type RingGroupWithMembers = RingGroup & { members: RingGroupMember[] };

const WITH_MEMBERS = {
  members: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.RingGroupInclude;

/**
 * Data access for ring groups. Deletion is soft: a group named by a call in
 * history stays readable, and the routes that pointed at it are removed by the
 * service so nothing resolves to a group that is gone.
 */
@Injectable()
export class RingGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read for the inbound path: no ownership filter, because an inbound call
   * authenticates as nobody. The resolver compares the group's workspace with
   * the called number's and refuses a mismatch (WRK-001).
   */
  findByIdWithMembers(id: string): Promise<RingGroupWithMembers | null> {
    return this.prisma.ringGroup.findFirst({
      where: { id, deletedAt: null },
      include: WITH_MEMBERS,
    });
  }

  findOwnedById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<RingGroupWithMembers | null> {
    return this.prisma.ringGroup.findFirst({
      where: { id, deletedAt: null, ...buildOwnershipFilter(ctx) },
      include: WITH_MEMBERS,
    });
  }

  listByOwner(ctx: OwnershipContext): Promise<RingGroupWithMembers[]> {
    return this.prisma.ringGroup.findMany({
      where: { deletedAt: null, ...buildOwnershipFilter(ctx) },
      include: WITH_MEMBERS,
      orderBy: { createdAt: "asc" },
    });
  }

  create(
    ctx: OwnershipContext,
    data: { name: string; ringSeconds?: number },
  ): Promise<RingGroupWithMembers> {
    return this.prisma.ringGroup.create({
      data: { ...buildOwnershipData(ctx), ...data },
      include: WITH_MEMBERS,
    });
  }

  /** Scoped update: a row in another workspace matches nothing. */
  async update(
    ctx: OwnershipContext,
    id: string,
    data: { name?: string; ringSeconds?: number },
  ): Promise<RingGroupWithMembers | null> {
    const { count } = await this.prisma.ringGroup.updateMany({
      where: { id, deletedAt: null, ...buildOwnershipFilter(ctx) },
      data,
    });
    return count === 1 ? this.findOwnedById(ctx, id) : null;
  }

  async softDelete(ctx: OwnershipContext, id: string): Promise<boolean> {
    const { count } = await this.prisma.ringGroup.updateMany({
      where: { id, deletedAt: null, ...buildOwnershipFilter(ctx) },
      data: { deletedAt: new Date() },
    });
    return count === 1;
  }

  /** Idempotent: adding an existing member is not an error. */
  async addMember(ringGroupId: string, userId: string): Promise<void> {
    await this.prisma.ringGroupMember.createMany({
      data: [{ ringGroupId, userId }],
      skipDuplicates: true,
    });
  }

  async removeMember(ringGroupId: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.ringGroupMember.deleteMany({
      where: { ringGroupId, userId },
    });
    return count > 0;
  }
}
