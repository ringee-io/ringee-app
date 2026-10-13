import { Injectable } from "@nestjs/common";
import { InboundDestinationType, InboundRoute, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  OwnershipContext,
  buildOwnershipData,
  buildOwnershipFilter,
} from "@ringee/platform";

/** Which number model a route is attached to. */
export type InboundRouteNumberKind = "ringee" | "external";

/** The number a route belongs to, as the API and the resolver name it. */
export type InboundRouteNumberRef = {
  kind: InboundRouteNumberKind;
  id: string;
};

/** Where a paused AI receptionist's number goes back to. */
export type InboundRouteRestoreTarget = {
  destinationType: InboundDestinationType;
  destinationId: string;
};

/** A route as it was read, for a compare-and-set write. */
export type InboundRouteVersion = {
  id: string;
  destinationType: InboundDestinationType;
  destinationId: string;
  version: number;
};

function numberWhere(
  ref: InboundRouteNumberRef,
): Prisma.InboundRouteWhereInput {
  return ref.kind === "ringee"
    ? { numberId: ref.id }
    : { externalNumberId: ref.id };
}

/**
 * Data access for inbound routing. A number has at most one route (both number
 * columns are unique), so "the route for this number" is always a single row.
 */
@Injectable()
export class InboundRouteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The route a call must be delivered by. Read on the inbound path with no
   * ownership filter — the caller has not authenticated as anyone, the number
   * is what proves the workspace — so the resolver verifies the destination's
   * workspace against the number's before anything rings.
   */
  findByNumber(ref: InboundRouteNumberRef): Promise<InboundRoute | null> {
    return this.prisma.inboundRoute.findFirst({ where: numberWhere(ref) });
  }

  /** The workspace's own view of one number's route. */
  findOwnedByNumber(
    ctx: OwnershipContext,
    ref: InboundRouteNumberRef,
  ): Promise<InboundRoute | null> {
    return this.prisma.inboundRoute.findFirst({
      where: { ...buildOwnershipFilter(ctx), ...numberWhere(ref) },
    });
  }

  listByOwner(ctx: OwnershipContext): Promise<InboundRoute[]> {
    return this.prisma.inboundRoute.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Whether any of the organization's calls reach people through legs the
   * server dials: an AI receptionist (which can transfer to anyone), or a BYOC
   * number routed to a person, group or extension.
   */
  async hasControlledRoutes(organizationId: string): Promise<boolean> {
    const route = await this.prisma.inboundRoute.findFirst({
      where: {
        organizationId,
        OR: [
          { destinationType: InboundDestinationType.ai_receptionist },
          {
            externalNumberId: { not: null },
            destinationType: {
              in: [
                InboundDestinationType.user,
                InboundDestinationType.ring_group,
                InboundDestinationType.extension,
              ],
            },
          },
        ],
      },
      select: { id: true },
    });
    return route !== null;
  }

  /** Every route pointing at one destination, e.g. a ring group about to go. */
  listByDestination(
    ctx: OwnershipContext,
    destinationType: InboundDestinationType,
    destinationId: string,
  ): Promise<InboundRoute[]> {
    return this.prisma.inboundRoute.findMany({
      where: { ...buildOwnershipFilter(ctx), destinationType, destinationId },
    });
  }

  /**
   * One route per number: a second write for the same number replaces the
   * destination rather than adding a competing row. Every write moves the
   * route's version, which is what a later compare-and-set checks.
   *
   * `restore` is where calls go back to when an AI receptionist route is
   * paused; the service decides it (it is only kept on receptionist routes).
   */
  async saveForNumber(
    ctx: OwnershipContext,
    ref: InboundRouteNumberRef,
    destination: {
      destinationType: InboundDestinationType;
      destinationId: string;
    },
    restore: InboundRouteRestoreTarget | null = null,
  ): Promise<InboundRoute> {
    const where =
      ref.kind === "ringee"
        ? { numberId: ref.id }
        : { externalNumberId: ref.id };
    const restoreData = {
      restoreDestinationType: restore?.destinationType ?? null,
      restoreDestinationId: restore?.destinationId ?? null,
    };
    return this.prisma.inboundRoute.upsert({
      where,
      update: { ...destination, ...restoreData, version: { increment: 1 } },
      create: {
        ...buildOwnershipData(ctx),
        ...(ref.kind === "ringee"
          ? { numberId: ref.id }
          : { externalNumberId: ref.id }),
        ...destination,
        ...restoreData,
      },
    });
  }

  /**
   * Points a route somewhere else only if nobody changed it since `expected`
   * was read. Returns the new row, or null when another write got there first
   * — which the caller reports instead of overwriting.
   */
  async replaceIfUnchanged(
    ctx: OwnershipContext,
    expected: InboundRouteVersion,
    destination: {
      destinationType: InboundDestinationType;
      destinationId: string;
    },
  ): Promise<InboundRoute | null> {
    const [updated] = await this.prisma.inboundRoute.updateManyAndReturn({
      where: { ...buildOwnershipFilter(ctx), ...expected },
      data: {
        ...destination,
        restoreDestinationType: null,
        restoreDestinationId: null,
        version: { increment: 1 },
      },
    });
    return updated ?? null;
  }

  /** Resets a route to the number's default, under the same compare-and-set. */
  async deleteIfUnchanged(
    ctx: OwnershipContext,
    expected: InboundRouteVersion,
  ): Promise<boolean> {
    const { count } = await this.prisma.inboundRoute.deleteMany({
      where: { ...buildOwnershipFilter(ctx), ...expected },
    });
    return count === 1;
  }

  /** Resets a number to the default inbound behavior. */
  async deleteForNumber(
    ctx: OwnershipContext,
    ref: InboundRouteNumberRef,
  ): Promise<number> {
    const { count } = await this.prisma.inboundRoute.deleteMany({
      where: { ...buildOwnershipFilter(ctx), ...numberWhere(ref) },
    });
    return count;
  }

  /** Drops every route that points at a destination being deleted. */
  async deleteByDestination(
    ctx: OwnershipContext,
    destinationType: InboundDestinationType,
    destinationId: string,
  ): Promise<number> {
    const { count } = await this.prisma.inboundRoute.deleteMany({
      where: { ...buildOwnershipFilter(ctx), destinationType, destinationId },
    });
    return count;
  }
}
