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
   * destination rather than adding a competing row.
   */
  async saveForNumber(
    ctx: OwnershipContext,
    ref: InboundRouteNumberRef,
    destination: {
      destinationType: InboundDestinationType;
      destinationId: string;
    },
  ): Promise<InboundRoute> {
    const where =
      ref.kind === "ringee"
        ? { numberId: ref.id }
        : { externalNumberId: ref.id };
    return this.prisma.inboundRoute.upsert({
      where,
      update: destination,
      create: {
        ...buildOwnershipData(ctx),
        ...(ref.kind === "ringee"
          ? { numberId: ref.id }
          : { externalNumberId: ref.id }),
        ...destination,
      },
    });
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
