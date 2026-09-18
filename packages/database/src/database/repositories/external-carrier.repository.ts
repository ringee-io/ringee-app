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
/** What a dial needs to know about an external number; never credentials. */
const callingRouteSelect = {
  id: true,
  phoneNumber: true,
  active: true,
  endpoint: {
    select: {
      id: true,
      carrierId: true,
      syncStatus: true,
      providerConnectionId: true,
      providerFqdn: true,
      carrier: { select: { id: true, status: true } },
    },
  },
} satisfies Prisma.ExternalPhoneNumberSelect;
export type ExternalCallingRoute = Prisma.ExternalPhoneNumberGetPayload<{
  select: typeof callingRouteSelect;
}>;
type OrganizationOwner = OwnershipContext & { organizationId: string };
export type CarrierMutation = OrganizationOwner & {
  carrierId: string;
  token: string;
};

@Injectable()
export class ExternalCarrierRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCallingNumbers(ctx: OrganizationOwner) {
    return this.prisma.externalPhoneNumber.findMany({
      where: {
        organizationId: ctx.organizationId,
        active: true,
        endpoint: {
          organizationId: ctx.organizationId,
          syncStatus: "synced",
          providerConnectionId: { not: null },
          carrier: { ...buildOwnershipFilter(ctx), status: "active" },
        },
      },
      select: { id: true, phoneNumber: true },
      orderBy: { phoneNumber: "asc" },
    });
  }

  /** Scoped to the workspace: another organization's number is "not found". */
  findCallingRoute(
    ctx: OrganizationOwner,
    number: { id: string } | { phoneNumber: string; endpointId: string },
  ): Promise<ExternalCallingRoute | null> {
    return this.prisma.externalPhoneNumber.findFirst({
      where: {
        ...number,
        organizationId: ctx.organizationId,
        endpoint: {
          organizationId: ctx.organizationId,
          carrier: buildOwnershipFilter(ctx),
        },
      },
      select: callingRouteSelect,
    });
  }

  async recordProviderFqdn(
    ctx: OrganizationOwner,
    endpointId: string,
    providerFqdn: string,
    providerConnectionId: string,
  ) {
    await this.prisma.externalSipEndpoint.updateMany({
      where: {
        id: endpointId,
        organizationId: ctx.organizationId,
        providerConnectionId,
      },
      data: { providerFqdn },
    });
  }

  /**
   * Deliberately unscoped: a WebRTC leg addressed to ANY workspace's carrier
   * host must present that workspace's authorization, whoever placed it.
   */
  async isProviderFqdn(host: string): Promise<boolean> {
    return !!(await this.prisma.externalSipEndpoint.findFirst({
      where: { providerFqdn: host },
      select: { id: true },
    }));
  }

  /**
   * The endpoint a verified routing key names, with its numbers and the
   * desk phone each rings. Unscoped by design — the signed key is the proof —
   * so the caller checks every row against the endpoint's organization.
   */
  findInboundRoute(endpointId: string) {
    return this.prisma.externalSipEndpoint.findUnique({
      where: { id: endpointId },
      select: {
        id: true,
        organizationId: true,
        carrierId: true,
        syncStatus: true,
        providerConnectionId: true,
        carrier: { select: { organizationId: true, status: true } },
        numbers: {
          select: {
            id: true,
            active: true,
            organizationId: true,
            phoneNumber: true,
            inboundSipDevice: {
              select: {
                id: true,
                userId: true,
                organizationId: true,
                sipUsername: true,
                allowInbound: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
  }

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
    data: {
      phoneNumber: string;
      active: boolean;
      /** Undefined keeps the current desk phone; null clears it. */
      inboundSipDeviceId?: string | null;
    },
    id?: string,
  ) {
    const endpoint = { id: endpointId, carrier: this.mutationWhere(ctx) };
    const { inboundSipDeviceId, ...number } = data;
    // Validated by the service; connecting through the workspace also makes a
    // foreign or deleted phone fail here rather than link.
    const connect = inboundSipDeviceId
      ? {
          connect: {
            id: inboundSipDeviceId,
            organizationId: ctx.organizationId,
            deletedAt: null,
          },
        }
      : undefined;
    return id
      ? this.prisma.externalPhoneNumber.update({
          where: { id, endpoint: { carrier: this.mutationWhere(ctx) } },
          data: {
            ...number,
            endpoint: { connect: endpoint },
            inboundSipDevice:
              connect ??
              (inboundSipDeviceId === null ? { disconnect: true } : undefined),
          },
        })
      : this.prisma.externalPhoneNumber.create({
          data: {
            ...number,
            endpoint: { connect: endpoint },
            inboundSipDevice: connect,
          },
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
