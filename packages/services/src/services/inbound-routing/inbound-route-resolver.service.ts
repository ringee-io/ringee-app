import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  ExternalCarrierRepository,
  AiVoiceAgentRepository,
  InboundDestinationType,
  InboundRouteRepository,
  OrganizationRepository,
  RingGroupRepository,
  SipDeviceRepository,
  SipDeviceStatus,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { NumberPurchasedService } from "../number.purchased.service";
import { UserService } from "../user.service";
import type { InboundNumberRecord } from "./inbound-number.types";
import {
  legacyInboundDestination,
  type ImplicitInboundRoute,
} from "./legacy-inbound-fallback";
import type {
  InboundCallOrigin,
  InboundDestination,
  InboundDirectoryEntry,
  InboundRouteResolution,
  InboundRoutingFailure,
} from "./inbound-routing.types";

/** Destination types the router can execute today. */
const IMPLEMENTED: ReadonlySet<InboundDestinationType> = new Set([
  InboundDestinationType.user,
  InboundDestinationType.ring_group,
  InboundDestinationType.desk_phone,
  InboundDestinationType.ai_receptionist,
  InboundDestinationType.extension,
]);

/** Which member a call row is attributed to, when the number names none. */
function destinationOwner(destination: InboundDestination): string {
  switch (destination.type) {
    case "user":
    case "extension":
      return destination.userId;
    case "ai_receptionist":
    case "desk_phone":
      return destination.ownerUserId;
    case "ring_group":
      return destination.ownerUserId;
  }
}

/**
 * The one place that answers **"what destination owns this incoming call?"**.
 *
 * It is carrier-independent by construction: its whole input is a called
 * number, a caller and — optionally — a workspace the carrier already proved.
 * It never reads a provider payload, never issues a provider command, and
 * never learns which carrier delivered the call. A Ringee-managed DID, a BYOC
 * DID, a SIP trunk and any future carrier all arrive here the same way.
 *
 * Every destination it returns has been re-verified against the *number's*
 * workspace on this call, not on the day the route was written: a route whose
 * destination was deleted, disabled or moved to another organization is
 * refused, never followed (WRK-001).
 */
@Injectable()
export class InboundRouteResolverService {
  private readonly logger = new Logger(InboundRouteResolverService.name);

  constructor(
    private readonly numbers: NumberPurchasedService,
    private readonly externalNumbers: ExternalCarrierRepository,
    private readonly routes: InboundRouteRepository,
    private readonly ringGroups: RingGroupRepository,
    private readonly sipDevices: SipDeviceRepository,
    private readonly users: UserService,
    private readonly organizations: OrganizationRepository,
    private readonly agents: AiVoiceAgentRepository,
  ) {}

  /**
   * Resolve an inbound call to its destination.
   *
   * `origin.number` / `origin.ctx` are an optimization and a proof: a carrier
   * that already identified the number (BYOC verifies a signed route key
   * before anything else) hands it over rather than having it looked up from
   * the dialed digits again.
   */
  async resolve(origin: InboundCallOrigin): Promise<InboundRouteResolution> {
    const number = await this.identifyNumber(origin);
    if (!number)
      return {
        kind: "unknown_number",
        detail: `no workspace owns ${origin.toNumber}`,
      };

    const route = await this.routes.findByNumber(number.ref);
    const intent: ImplicitInboundRoute | null =
      route ?? legacyInboundDestination(number);
    const source = route ? "explicit" : "default";
    // The workspace the destination is checked against. `userId` is only read
    // for a personal workspace, which always has an owner.
    const workspace: OwnershipContext = {
      userId: number.ownerUserId ?? "",
      organizationId: number.organizationId,
    };

    const unroutable = (
      reason: InboundRoutingFailure,
      detail: string,
    ): InboundRouteResolution => {
      this.logger.warn(
        `⛔ ${origin.toNumber} is not routable (${reason}): ${detail}`,
      );
      return {
        kind: "unroutable",
        reason,
        detail,
        ctx: workspace,
        number: number.ref,
        routeId: route?.id ?? null,
        destinationType: intent?.destinationType,
        destinationId: intent?.destinationId ?? null,
      };
    };

    if (!intent)
      return unroutable(
        "destination_missing",
        `${number.phoneNumber} has no inbound route and no default destination`,
      );
    if (!IMPLEMENTED.has(intent.destinationType))
      return unroutable(
        "destination_not_implemented",
        `${intent.destinationType} destinations are not routable yet`,
      );

    const destination = await this.resolveDestination(workspace, intent);
    if ("reason" in destination)
      return unroutable(destination.reason, destination.detail);

    return {
      kind: "routed",
      ctx: {
        userId: number.ownerUserId ?? destinationOwner(destination),
        organizationId: number.organizationId,
      },
      number: number.ref,
      phoneNumber: number.phoneNumber,
      routeId: route?.id ?? null,
      source,
      destination,
      legacySipDeviceId: number.legacySipDeviceId,
    };
  }

  // ── the number ───────────────────────────────────────────────────────────

  /**
   * The called number, normalized, with the workspace that owns it. The
   * workspace always comes from the number row: a carrier's headers, a
   * client's body and a route's own columns are never read as an ownership
   * claim.
   */
  private async identifyNumber(
    origin: InboundCallOrigin,
  ): Promise<InboundNumberRecord | null> {
    const record =
      origin.number?.kind === "external"
        ? await this.externalNumberRecord(origin.number.id)
        : await this.ringeeNumberRecord(origin.number?.id, origin.toNumber);
    if (!record) return null;
    // The carrier and the number row must agree on the workspace. They cannot
    // disagree without something being wrong, and following either one of two
    // answers would be picking a tenant at random.
    if (
      origin.organizationId !== undefined &&
      origin.organizationId !== record.organizationId
    ) {
      this.logger.error(
        `⛔ ${origin.toNumber} was delivered for one workspace and is owned by another`,
      );
      return null;
    }
    return record;
  }

  private async ringeeNumberRecord(
    id: string | undefined,
    phoneNumber: string,
  ): Promise<InboundNumberRecord | null> {
    const number = await this.numbers.findOneByNumber(phoneNumber);
    if (!number || (id && number.id !== id)) return null;
    if (!number.userId) return null;
    // The owner must still exist: the legacy path refused the call otherwise,
    // and a workspace with no user cannot be a routing target.
    const owner = await this.users.getCachedUserById(number.userId);
    if (!owner) return null;
    return {
      ref: { kind: "ringee", id: number.id },
      phoneNumber: number.phoneNumber,
      organizationId: number.organizationId,
      ownerUserId: number.userId,
      legacyMode: number.inboundMode,
      legacySipDeviceId: number.inboundSipDeviceId,
    };
  }

  private async externalNumberRecord(
    id: string,
  ): Promise<InboundNumberRecord | null> {
    const number = await this.externalNumbers.findNumberById(id);
    if (!number || !number.active) return null;
    // A BYOC number belongs to the organization and has no owner of its own,
    // so the member the call is attributed to comes from its destination.
    return {
      ref: { kind: "external", id: number.id },
      phoneNumber: number.phoneNumber,
      organizationId: number.organizationId,
      ownerUserId: null,
      legacyMode: null,
      legacySipDeviceId: number.inboundSipDeviceId,
    };
  }

  // ── the destination ──────────────────────────────────────────────────────

  /**
   * Current, workspace-owned logical destinations for a caller asking for a
   * person or team. Names are data from the directory, never prompt defaults.
   * Selection is not authorization: resolveDestination rechecks the selected
   * entry immediately before routing, including membership and availability.
   */
  async searchDirectory(
    ctx: OwnershipContext,
    query = "",
  ): Promise<{ destinations: InboundDirectoryEntry[]; hasMore: boolean }> {
    if (typeof query !== "string" || query.length > 200)
      throw new BadRequestException(
        "Directory search must be at most 200 characters.",
      );

    const [memberships, groups, devices] = await Promise.all([
      ctx.organizationId
        ? this.organizations.listMembersWithUsers(ctx.organizationId)
        : this.users
            .getCachedUserById(ctx.userId)
            .then((user) => (user ? [{ id: "", extension: null, user }] : [])),
      this.ringGroups.listByOwner(ctx),
      apiConfiguration.DESK_PHONES_ENABLED
        ? this.sipDevices.listByOwner(ctx)
        : Promise.resolve([]),
    ]);
    const members = memberships.flatMap((membership) =>
      membership.user ? [membership.user] : [],
    );
    const memberIds = new Set(members.map((member) => member.id));
    const entries: InboundDirectoryEntry[] = [];
    for (const member of members) {
      const label = [member.firstName, member.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (label)
        entries.push({
          destinationType: "user",
          destinationId: member.id,
          label,
        });
    }
    for (const membership of memberships) {
      if (membership.extension && membership.user)
        entries.push({
          destinationType: "extension",
          destinationId: membership.id,
          label:
            [membership.user.firstName, membership.user.lastName]
              .filter(Boolean)
              .join(" ") || membership.extension,
          extension: membership.extension,
        });
    }
    for (const group of groups) {
      if (group.members.some((member) => memberIds.has(member.userId)))
        entries.push({
          destinationType: "ring_group",
          destinationId: group.id,
          label: group.name,
        });
    }
    for (const device of devices) {
      if (
        device.allowInbound &&
        device.status !== SipDeviceStatus.disabled &&
        device.status !== SipDeviceStatus.deleted &&
        memberIds.has(device.userId)
      )
        entries.push({
          destinationType: "desk_phone",
          destinationId: device.id,
          label: device.label,
        });
    }

    // Preserve ambiguous matches for the caller to disambiguate; never pick
    // the first person or department with a similar name on their behalf.
    const search = query.trim().toLocaleLowerCase();
    const matches = entries
      .filter(
        (entry) =>
          entry.label.toLocaleLowerCase().includes(search) ||
          entry.extension === search,
      )
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.destinationId.localeCompare(right.destinationId),
      );
    return { destinations: matches.slice(0, 50), hasMore: matches.length > 50 };
  }

  /** Server-only resolution. Its result may contain provider routing details. */
  async resolveDestination(
    ctx: OwnershipContext,
    intent: ImplicitInboundRoute,
  ): Promise<
    InboundDestination | { reason: InboundRoutingFailure; detail: string }
  > {
    switch (intent.destinationType) {
      case InboundDestinationType.ai_receptionist: {
        const agent = ctx.organizationId
          ? await this.agents.findByIdForOwner(ctx, intent.destinationId)
          : null;
        if (
          !agent ||
          agent.status !== "active" ||
          !agent.providerAssistantId ||
          !agent.toolSecretHash
        )
          return {
            reason: "destination_deleted",
            detail: "The voice agent is unavailable.",
          };
        return {
          type: "ai_receptionist",
          agentId: agent.id,
          ownerUserId: agent.userId,
        };
      }
      case InboundDestinationType.extension: {
        const membership = ctx.organizationId
          ? await this.organizations.findExtension(
              ctx.organizationId,
              intent.destinationId,
            )
          : null;
        if (!membership?.userId || !membership.extension)
          return {
            reason: "destination_deleted",
            detail: "The internal extension was not found.",
          };
        const user = await this.resolveUser(ctx, membership.userId);
        return "reason" in user
          ? user
          : {
              type: "extension",
              membershipId: membership.id,
              userId: membership.userId,
              extension: membership.extension,
            };
      }
      case InboundDestinationType.user:
        return this.resolveUser(ctx, intent.destinationId);
      case InboundDestinationType.ring_group:
        return this.resolveRingGroup(ctx, intent.destinationId);
      case InboundDestinationType.desk_phone:
        return this.resolveDeskPhone(ctx, intent.destinationId);
      default:
        return {
          reason: "destination_not_implemented",
          detail: `${intent.destinationType} destinations are not routable yet`,
        };
    }
  }

  private async resolveUser(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<
    InboundDestination | { reason: InboundRoutingFailure; detail: string }
  > {
    const user = await this.users.getCachedUserById(userId).catch(() => null);
    if (!user)
      return {
        reason: "destination_deleted",
        detail: `user ${userId} is gone`,
      };
    if (!(await this.userInWorkspace(ctx, userId)))
      return {
        reason: "destination_foreign_workspace",
        detail: `user ${userId} is not in the number's workspace`,
      };
    return { type: "user", userId };
  }

  private async resolveRingGroup(
    ctx: OwnershipContext,
    ringGroupId: string,
  ): Promise<
    InboundDestination | { reason: InboundRoutingFailure; detail: string }
  > {
    const group = await this.ringGroups.findByIdWithMembers(ringGroupId);
    if (!group)
      return {
        reason: "destination_deleted",
        detail: `ring group ${ringGroupId} is gone`,
      };
    if (!this.rowInWorkspace(ctx, group))
      return {
        reason: "destination_foreign_workspace",
        detail: `ring group ${ringGroupId} belongs to another workspace`,
      };
    if (group.members.length === 0)
      return {
        reason: "ring_group_empty",
        detail: `ring group ${group.name} has no members`,
      };

    // A member who left the organization stops being a target immediately,
    // without anyone having to edit the group.
    const memberUserIds: string[] = [];
    for (const member of group.members)
      if (await this.userInWorkspace(ctx, member.userId))
        memberUserIds.push(member.userId);
    if (memberUserIds.length === 0)
      return {
        reason: "ring_group_empty",
        detail: `no member of ${group.name} is still in the workspace`,
      };

    return {
      type: "ring_group",
      ringGroupId: group.id,
      name: group.name,
      ringSeconds: group.ringSeconds,
      memberUserIds,
      ownerUserId: memberUserIds[0],
    };
  }

  private async resolveDeskPhone(
    ctx: OwnershipContext,
    sipDeviceId: string,
  ): Promise<
    InboundDestination | { reason: InboundRoutingFailure; detail: string }
  > {
    if (!apiConfiguration.DESK_PHONES_ENABLED)
      return {
        reason: "desk_phone_unavailable",
        detail: "desk phones are disabled in this environment",
      };
    const device = await this.sipDevices.findActiveById(sipDeviceId);
    if (!device)
      return {
        reason: "destination_deleted",
        detail: `desk phone ${sipDeviceId} is gone`,
      };
    if (!this.rowInWorkspace(ctx, device))
      return {
        reason: "destination_foreign_workspace",
        detail: `desk phone ${sipDeviceId} belongs to another workspace`,
      };
    if (
      !device.allowInbound ||
      device.status === SipDeviceStatus.disabled ||
      device.status === SipDeviceStatus.deleted
    )
      return {
        reason: "desk_phone_unavailable",
        detail: `desk phone ${device.publicRef} cannot take calls`,
      };
    // Its owner must still be in the workspace, or the call would reach
    // someone who no longer belongs to it.
    if (!(await this.userInWorkspace(ctx, device.userId)))
      return {
        reason: "destination_foreign_workspace",
        detail: `the owner of desk phone ${device.publicRef} left the workspace`,
      };
    return {
      type: "desk_phone",
      sipDeviceId: device.id,
      sipUsername: device.sipUsername,
      ownerUserId: device.userId,
    };
  }

  // ── workspace checks ─────────────────────────────────────────────────────

  /** A workspace-scoped row is the number's only when both halves match. */
  private rowInWorkspace(
    ctx: OwnershipContext,
    row: { userId: string; organizationId: string | null },
  ): boolean {
    if (ctx.organizationId) return row.organizationId === ctx.organizationId;
    return row.userId === ctx.userId && !row.organizationId;
  }

  /** A user is in an organization workspace only by membership. */
  private async userInWorkspace(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<boolean> {
    if (ctx.organizationId)
      return this.organizations.isMember(userId, ctx.organizationId);
    return userId === ctx.userId;
  }
}
