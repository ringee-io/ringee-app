import {
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  ExternalCarrierRepository,
  InboundDestinationType,
  InboundRoute,
  InboundRouteRepository,
  NumberInboundMode,
  NumberPurchasedRepository,
  OrganizationRepository,
  RingGroupRepository,
  SipDeviceRepository,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { UserService } from "../user.service";
import { InboundCallRouterService } from "./inbound-call-router.service";
import { legacyInboundDestination } from "./legacy-inbound-fallback";
import type {
  InboundNumberRef,
  InboundTransport,
} from "./inbound-routing.types";

/** Destination types a route may name today. */
const ROUTABLE: readonly InboundDestinationType[] = [
  InboundDestinationType.user,
  InboundDestinationType.ring_group,
  InboundDestinationType.desk_phone,
];

/** How calls to a number reach Ringee, which limits what it can route to. */
function transportOf(ref: InboundNumberRef): InboundTransport {
  return ref.kind === "external" ? "call_control" : "ringee_webrtc";
}

/** The part of a number this service needs, from either number model. */
interface OwnedNumber {
  phoneNumber: string;
  inboundSipDeviceId: string | null;
  legacyMode: NumberInboundMode | null;
  /** The number's own owner; a BYOC DID has none. */
  ownerUserId: string | null;
}

/** A number's inbound configuration, explicit or defaulted. */
export interface InboundRouteView {
  number: InboundNumberRef;
  phoneNumber: string;
  destinationType: InboundDestinationType;
  destinationId: string | null;
  /** The name of whatever the destination points at, when there is one. */
  destinationLabel: string | null;
  /** False when no route is stored and the number's default is shown. */
  configured: boolean;
  /** Destination types this number can actually be routed to. */
  availableDestinationTypes: InboundDestinationType[];
  updatedAt: Date | null;
}

/**
 * The configuration side of inbound routing: reading and writing the route a
 * number answers by. It never rings anything — that is the router — and it
 * never trusts an id from a request body without loading the row behind it and
 * checking it against the caller's workspace.
 *
 * A route is refused when the number could never deliver to it, rather than
 * accepted and failed on the first real call. Today that is what stops a BYOC
 * number being pointed at a browser destination it cannot reach (`DEBT-020`).
 */
@Injectable()
export class InboundRouteService {
  constructor(
    private readonly routes: InboundRouteRepository,
    private readonly numbers: NumberPurchasedRepository,
    private readonly externalNumbers: ExternalCarrierRepository,
    private readonly ringGroups: RingGroupRepository,
    private readonly sipDevices: SipDeviceRepository,
    private readonly organizations: OrganizationRepository,
    private readonly users: UserService,
    private readonly router: InboundCallRouterService,
  ) {}

  /** Every number in the workspace that has an explicit route. */
  async list(ctx: OwnershipContext): Promise<InboundRouteView[]> {
    const routes = await this.routes.listByOwner(ctx);
    return Promise.all(
      routes.map(async (route) => {
        const ref: InboundNumberRef = route.numberId
          ? { kind: "ringee", id: route.numberId }
          : { kind: "external", id: route.externalNumberId! };
        const number = await this.requireNumber(ctx, ref);
        return this.view(ctx, ref, number, route);
      }),
    );
  }

  /** The route for one number, or the default it falls back to. */
  async getForNumber(
    ctx: OwnershipContext,
    ref: InboundNumberRef,
  ): Promise<InboundRouteView> {
    const number = await this.requireNumber(ctx, ref);
    const route = await this.routes.findOwnedByNumber(ctx, ref);
    return this.view(ctx, ref, number, route);
  }

  /**
   * Point a number at a destination. One route per number: writing a second
   * one replaces the first rather than leaving two to disagree.
   */
  async saveForNumber(
    ctx: OwnershipContext,
    ref: InboundNumberRef,
    input: {
      destinationType: InboundDestinationType;
      destinationId: string;
    },
  ): Promise<InboundRouteView> {
    const number = await this.requireNumber(ctx, ref);

    if (!ROUTABLE.includes(input.destinationType))
      throw new NotImplementedException(
        `${input.destinationType} destinations are not available yet.`,
      );
    if (
      !this.router
        .transportsFor(input.destinationType)
        .includes(transportOf(ref))
    )
      throw new ConflictException(
        ref.kind === "external"
          ? "A carrier number can only ring a desk phone today."
          : `This number cannot ring a ${input.destinationType} destination.`,
      );

    await this.assertDestinationInWorkspace(ctx, input);
    const route = await this.routes.saveForNumber(ctx, ref, input);
    return this.view(ctx, ref, number, route);
  }

  /** Reset a number to its default inbound behavior. */
  async deleteForNumber(
    ctx: OwnershipContext,
    ref: InboundNumberRef,
  ): Promise<InboundRouteView> {
    const number = await this.requireNumber(ctx, ref);
    await this.routes.deleteForNumber(ctx, ref);
    return this.view(ctx, ref, number, null);
  }

  // ── validation ───────────────────────────────────────────────────────────

  /**
   * The number must be one of the caller's. Loading it by id and checking the
   * workspace — rather than trusting the id — is what stops a route being
   * written for somebody else's DID.
   */
  private async requireNumber(
    ctx: OwnershipContext,
    ref: InboundNumberRef,
  ): Promise<OwnedNumber> {
    if (ref.kind === "ringee") {
      const number = await this.numbers.findById(ref.id);
      if (
        !number ||
        number.deletedAt ||
        !this.rowInWorkspace(ctx, {
          userId: number.userId ?? "",
          organizationId: number.organizationId,
        })
      )
        throw new NotFoundException("Phone number not found.");
      return {
        phoneNumber: number.phoneNumber,
        inboundSipDeviceId: number.inboundSipDeviceId,
        legacyMode: number.inboundMode,
        ownerUserId: number.userId,
      };
    }
    const number = await this.externalNumbers.findNumberById(ref.id);
    if (
      !number ||
      !ctx.organizationId ||
      number.organizationId !== ctx.organizationId
    )
      throw new NotFoundException("Phone number not found.");
    return {
      phoneNumber: number.phoneNumber,
      inboundSipDeviceId: number.inboundSipDeviceId,
      legacyMode: null,
      ownerUserId: null,
    };
  }

  private async assertDestinationInWorkspace(
    ctx: OwnershipContext,
    input: { destinationType: InboundDestinationType; destinationId: string },
  ): Promise<void> {
    const missing = () =>
      new NotFoundException("That routing destination was not found.");

    switch (input.destinationType) {
      case InboundDestinationType.user: {
        const user = await this.users
          .getCachedUserById(input.destinationId)
          .catch(() => null);
        if (!user || !(await this.userInWorkspace(ctx, input.destinationId)))
          throw missing();
        return;
      }
      case InboundDestinationType.ring_group: {
        const group = await this.ringGroups.findOwnedById(
          ctx,
          input.destinationId,
        );
        if (!group) throw missing();
        return;
      }
      case InboundDestinationType.desk_phone: {
        if (!apiConfiguration.DESK_PHONES_ENABLED)
          throw new ConflictException("Desk phones are not enabled.");
        const device = await this.sipDevices.findActiveById(
          input.destinationId,
        );
        if (!device || !this.rowInWorkspace(ctx, device)) throw missing();
        if (!device.allowInbound)
          throw new ConflictException(
            "That desk phone does not accept inbound calls.",
          );
        return;
      }
      default:
        throw new NotImplementedException(
          `${input.destinationType} destinations are not available yet.`,
        );
    }
  }

  private rowInWorkspace(
    ctx: OwnershipContext,
    row: { userId: string; organizationId: string | null },
  ): boolean {
    if (ctx.organizationId) return row.organizationId === ctx.organizationId;
    return row.userId === ctx.userId && !row.organizationId;
  }

  private async userInWorkspace(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<boolean> {
    if (ctx.organizationId)
      return this.organizations.isMember(userId, ctx.organizationId);
    return userId === ctx.userId;
  }

  // ── presentation ─────────────────────────────────────────────────────────

  private async view(
    ctx: OwnershipContext,
    ref: InboundNumberRef,
    number: OwnedNumber,
    route: InboundRoute | null,
  ): Promise<InboundRouteView> {
    const phoneNumber = number.phoneNumber;
    const available = ROUTABLE.filter((type) =>
      this.router.transportsFor(type).includes(transportOf(ref)),
    );
    if (route)
      return {
        number: ref,
        phoneNumber,
        destinationType: route.destinationType,
        destinationId: route.destinationId,
        destinationLabel: await this.label(
          ctx,
          route.destinationType,
          route.destinationId,
        ),
        configured: true,
        availableDestinationTypes: available,
        updatedAt: route.updatedAt,
      };

    // No route: show what the number does today, so the caller sees the same
    // destination the router would pick, from the same function it uses.
    const fallback = legacyInboundDestination({
      ref,
      phoneNumber,
      organizationId: ctx.organizationId ?? null,
      ownerUserId: number.ownerUserId,
      legacyMode: number.legacyMode,
      legacySipDeviceId: number.inboundSipDeviceId,
    });
    return {
      number: ref,
      phoneNumber,
      destinationType: fallback?.destinationType ?? InboundDestinationType.user,
      destinationId: fallback?.destinationId ?? null,
      destinationLabel: fallback
        ? await this.label(
            ctx,
            fallback.destinationType,
            fallback.destinationId,
          )
        : null,
      configured: false,
      availableDestinationTypes: available,
      updatedAt: null,
    };
  }

  private async label(
    ctx: OwnershipContext,
    type: InboundDestinationType,
    id: string,
  ): Promise<string | null> {
    switch (type) {
      case InboundDestinationType.user: {
        const user = await this.users.getCachedUserById(id).catch(() => null);
        return (
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null
        );
      }
      case InboundDestinationType.ring_group:
        return (await this.ringGroups.findOwnedById(ctx, id))?.name ?? null;
      case InboundDestinationType.desk_phone:
        return (await this.sipDevices.findActiveById(id))?.label ?? null;
      default:
        return null;
    }
  }
}
