import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { buildOwnershipFilter, OwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

const include = {
  endpoints: {
    include: { numbers: true },
    orderBy: { extension: "asc" as const },
  },
};
export type ExternalCarrierWithEndpoints = Prisma.ExternalCarrierGetPayload<{
  include: typeof include;
}>;
type OrganizationOwner = OwnershipContext & { organizationId: string };
export type CarrierMutation = OrganizationOwner & {
  carrierId: string;
  token: string;
};

@Injectable()
export class ExternalCarrierRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: OrganizationOwner) {
    return this.prisma.externalCarrier.findMany({
      where: buildOwnershipFilter(ctx),
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  find(ctx: OrganizationOwner, id: string) {
    return this.prisma.externalCarrier.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
      include,
    });
  }

  create(ctx: OwnershipContext & { organizationId: string }, name: string) {
    return this.prisma.externalCarrier.create({
      data: { userId: ctx.userId, organizationId: ctx.organizationId, name },
      include,
    });
  }

  async acquire(ctx: CarrierMutation) {
    const result = await this.prisma.externalCarrier.updateMany({
      where: {
        id: ctx.carrierId,
        ...buildOwnershipFilter(ctx),
        OR: [
          { mutationToken: null },
          { mutationExpiresAt: { lt: new Date() } },
        ],
      },
      data: {
        mutationToken: ctx.token,
        mutationExpiresAt: new Date(Date.now() + 300_000),
      },
    });
    return result.count === 1;
  }

  private mutationWhere(ctx: CarrierMutation) {
    return {
      id: ctx.carrierId,
      ...buildOwnershipFilter(ctx),
      mutationToken: ctx.token,
      mutationExpiresAt: { gt: new Date() },
    };
  }

  async renew(ctx: CarrierMutation) {
    return (
      (
        await this.prisma.externalCarrier.updateMany({
          where: this.mutationWhere(ctx),
          data: { mutationExpiresAt: new Date(Date.now() + 300_000) },
        })
      ).count === 1
    );
  }

  async release(ctx: CarrierMutation) {
    await this.prisma.externalCarrier.updateMany({
      where: {
        id: ctx.carrierId,
        ...buildOwnershipFilter(ctx),
        mutationToken: ctx.token,
      },
      data: { mutationToken: null, mutationExpiresAt: null },
    });
  }

  updateCarrier(
    ctx: CarrierMutation,
    data: { name?: string; status?: string },
  ) {
    return this.prisma.externalCarrier.update({
      where: this.mutationWhere(ctx),
      data,
    });
  }

  createEndpoint(
    ctx: CarrierMutation,
    data: Omit<Prisma.ExternalSipEndpointCreateWithoutCarrierInput, "numbers">,
  ) {
    return this.prisma.externalSipEndpoint.create({
      data: { ...data, carrier: { connect: this.mutationWhere(ctx) } },
      include: { numbers: true },
    });
  }

  updateEndpoint(
    ctx: CarrierMutation,
    id: string,
    data: Prisma.ExternalSipEndpointUpdateManyMutationInput,
  ) {
    return this.prisma.externalSipEndpoint.update({
      where: { id, carrier: this.mutationWhere(ctx) },
      data,
      include: { numbers: true },
    });
  }

  saveNumber(
    ctx: CarrierMutation,
    endpointId: string,
    data: { phoneNumber: string; active: boolean },
    id?: string,
  ) {
    const endpoint = { id: endpointId, carrier: this.mutationWhere(ctx) };
    return id
      ? this.prisma.externalPhoneNumber.update({
          where: { id, endpoint: { carrier: this.mutationWhere(ctx) } },
          data: { ...data, endpoint: { connect: endpoint } },
        })
      : this.prisma.externalPhoneNumber.create({
          data: { ...data, endpoint: { connect: endpoint } },
        });
  }

  deleteNumber(ctx: CarrierMutation, id: string) {
    return this.prisma.externalPhoneNumber.delete({
      where: { id, endpoint: { carrier: this.mutationWhere(ctx) } },
    });
  }

  /** Called only after provider deletion. FK RESTRICT protects dependent DIDs. */
  deleteEndpoint(ctx: CarrierMutation, id: string) {
    return this.prisma.externalSipEndpoint.delete({
      where: { id, carrier: this.mutationWhere(ctx) },
    });
  }

  /** Remote resources have all been deleted before this local atomic cleanup. */
  async deleteCarrier(ctx: CarrierMutation) {
    await this.prisma.$transaction(async (tx) => {
      await tx.externalPhoneNumber.deleteMany({
        where: { endpoint: { carrier: this.mutationWhere(ctx) } },
      });
      await tx.externalSipEndpoint.deleteMany({
        where: { carrier: this.mutationWhere(ctx) },
      });
      await tx.externalCarrier.delete({ where: this.mutationWhere(ctx) });
    });
  }
}
