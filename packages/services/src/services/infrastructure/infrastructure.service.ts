import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  InfrastructureRepository,
  OrganizationRepository,
  UserRepository,
  NumberPurchasedRepository,
  SipDeviceRepository,
  CampaignRepository,
  CampaignMemberRepository,
  CallerIdRotationRepository,
  CustomIntegrationRepository,
  User,
  InfrastructureResource,
  InfrastructureResourceType,
  InfrastructureConnectionType,
  InfrastructureConnectionStatus,
} from "@ringee/database";
import {
  OwnershipContext,
  TelephonyService,
  StripeService,
} from "@ringee/platform";
import {
  CampaignMemberService,
  CampaignConfigService,
  CreateCampaignFullDto,
  UpdateCampaignSettingsDto,
} from "../outbound";
import { SipDeviceService } from "../sip-device";
import { CrmConnectionService } from "../crm";
import { NumberPurchasedService } from "../number.purchased.service";
import { OrganizationService } from "../organization.service";
import { UserService } from "../user.service";
import {
  CreateConnectionResult,
  InfraEdgeDto,
  InfraEventDto,
  InfraLinkableItem,
  InfraNodeDto,
  InfraOverviewDto,
  InfraNumberSearchResult,
  InfraCheckoutResult,
  InfraCompletePhoneResult,
  InfraCreateResult,
  InfraSipCreateResult,
  InfraSipCreateInput,
  InfraCampaignCreateInput,
  InfraConfigPatch,
  InfraConfigResult,
  InfraPosition,
  InfraUsageFilters,
  InfraUsageResult,
  InfraUsageRef,
  InfraUsageResourceRow,
  InfraJourneySignalsDto,
} from "./infrastructure.types";

interface DesiredEntity {
  type: InfrastructureResourceType;
  referenceId: string;
  name: string;
  status: string;
  metadata: Record<string, unknown>;
}

/** Synthetic referenceId for the single per-workspace caller-ID pool node. */
const POOL_REF = "pool";

/** x-offset per resource column so the canvas reads left→right by type. */
const COLUMN_X: Record<InfrastructureResourceType, number> = {
  TEAM_MEMBER: 0,
  PHONE_NUMBER: 360,
  CAMPAIGN: 720,
  SIP_DEVICE: 1080,
  NUMBER_POOL: 1440,
  INTEGRATION: 1800,
  ROUTING_RULE: 2160,
};
const ROW_GAP = 130;

@Injectable()
export class InfrastructureService {
  private readonly logger = new Logger(InfrastructureService.name);

  constructor(
    private readonly infraRepo: InfrastructureRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly userRepo: UserRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly sipRepo: SipDeviceRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly campaignMemberRepo: CampaignMemberRepository,
    private readonly rotationRepo: CallerIdRotationRepository,
    private readonly customIntegrationRepo: CustomIntegrationRepository,
    private readonly campaignMemberService: CampaignMemberService,
    private readonly campaignConfig: CampaignConfigService,
    private readonly sipDeviceService: SipDeviceService,
    private readonly crmService: CrmConnectionService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly telephonyService: TelephonyService,
    private readonly stripeService: StripeService,
    private readonly organizationService: OrganizationService,
    private readonly userService: UserService,
  ) {}

  // ===========================================================================
  // Overview (the live architecture map)
  // ===========================================================================

  async getOverview(ctx: OwnershipContext): Promise<InfraOverviewDto> {
    const [desired, campaignMembers] = await this.loadDesired(ctx);
    const desiredByKey = new Map(
      desired.map((d) => [this.key(d.type, d.referenceId), d]),
    );

    // 1. Reconcile persisted resource rows with the desired set.
    let resources = await this.infraRepo.listResources(ctx);
    const existingByKey = new Map<string, InfrastructureResource>();
    const hiddenKeys = new Set<string>();
    for (const r of resources) {
      const k = this.key(r.type, r.referenceId ?? "");
      existingByKey.set(k, r);
      if (r.hidden) hiddenKeys.add(k);
    }

    // 2. Seed nodes for entities that have neither a row nor a hidden flag.
    const counts = this.initialColumnCounts(resources);
    const toCreate = desired
      .filter((d) => {
        const k = this.key(d.type, d.referenceId);
        return !existingByKey.has(k) && !hiddenKeys.has(k);
      })
      .map((d) => {
        const x = COLUMN_X[d.type];
        const y = (counts[d.type] = (counts[d.type] ?? 0) + 1) * ROW_GAP;
        return {
          type: d.type,
          referenceId: d.referenceId,
          name: d.name,
          status: d.status,
          positionX: x,
          positionY: y,
          metadata: d.metadata as Record<string, never>,
        };
      });
    if (toCreate.length > 0) {
      await this.infraRepo.createManyResources(ctx, toCreate);
      resources = await this.infraRepo.listResources(ctx);
    }

    // 3. Build node DTOs (skip hidden + orphaned rows whose entity disappeared).
    const nodes: InfraNodeDto[] = [];
    const resIdByKey = new Map<string, string>();
    for (const r of resources) {
      if (r.hidden) continue;
      const k = this.key(r.type, r.referenceId ?? "");
      const live = r.referenceId ? desiredByKey.get(k) : undefined;
      if (r.referenceId && !live) continue; // real entity no longer exists
      resIdByKey.set(k, r.id);
      nodes.push({
        id: r.id,
        type: r.type,
        referenceId: r.referenceId,
        name: r.name,
        status: live ? live.status : r.status,
        position: { x: r.positionX, y: r.positionY },
        metadata: live
          ? live.metadata
          : (r.metadata as Record<string, unknown>),
      });
    }
    const nodeIds = new Set(nodes.map((n) => n.id));

    // 4. Derive edges from real relationships + merge persisted draft edges.
    const edges = await this.deriveEdges(ctx, resIdByKey, campaignMembers);
    const derivedKeys = new Set(
      edges.map((e) => `${e.source}:${e.target}:${e.type}`),
    );
    const persisted = await this.infraRepo.listConnections(ctx);
    for (const c of persisted) {
      const k = `${c.sourceResourceId}:${c.targetResourceId}:${c.type}`;
      if (derivedKeys.has(k)) continue; // already shown as a live edge
      const endpointsExist =
        nodeIds.has(c.sourceResourceId) && nodeIds.has(c.targetResourceId);
      edges.push({
        id: c.id,
        source: c.sourceResourceId,
        target: c.targetResourceId,
        type: c.type,
        status: endpointsExist
          ? c.status
          : InfrastructureConnectionStatus.BROKEN,
        applied: false,
      });
    }

    return {
      nodes,
      edges,
      workspace: {
        scope: ctx.organizationId ? "organization" : "personal",
        organizationId: ctx.organizationId ?? null,
      },
    };
  }

  // ===========================================================================
  // Node mutations
  // ===========================================================================

  async updatePosition(
    ctx: OwnershipContext,
    resourceId: string,
    x: number,
    y: number,
  ): Promise<void> {
    await this.getOwnedResource(ctx, resourceId);
    await this.infraRepo.updatePosition(resourceId, x, y);
  }

  async renameResource(
    ctx: OwnershipContext,
    resourceId: string,
    name: string,
  ): Promise<void> {
    const resource = await this.getOwnedResource(ctx, resourceId);
    const clean = name.trim();
    if (!clean) throw new BadRequestException("A name is required.");
    await this.infraRepo.updateResource(resourceId, { name: clean });
    await this.infraRepo.createEvent(ctx, {
      resourceId,
      type: "resource.renamed",
      message: `Renamed "${resource.name}" to "${clean}"`,
    });
  }

  /** Remove a node from the canvas WITHOUT deleting the real entity. */
  async removeFromCanvas(
    ctx: OwnershipContext,
    resourceId: string,
  ): Promise<void> {
    const resource = await this.getOwnedResource(ctx, resourceId);
    await this.infraRepo.updateResource(resourceId, { hidden: true });
    await this.infraRepo.createEvent(ctx, {
      resourceId,
      type: "resource.removed_from_canvas",
      message: `Removed "${resource.name}" from the canvas`,
    });
  }

  async listEvents(
    ctx: OwnershipContext,
    resourceId: string,
  ): Promise<InfraEventDto[]> {
    await this.getOwnedResource(ctx, resourceId);
    const events = await this.infraRepo.listEvents(ctx, resourceId);
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt,
    }));
  }

  // ===========================================================================
  // Usage (uso, salud, gasto) — the module's second view
  // ===========================================================================

  /**
   * Usage & spend for the active workspace, computed over the `Call` table and
   * scoped by the ownership context (org → org-wide, personal → the user's own
   * data). Overview cards use fixed windows; performance/cost/by-resource honour
   * the requested range + resource filters. Member breakdowns are only
   * meaningful in an organization.
   */
  async getUsage(
    ctx: OwnershipContext,
    filters: InfraUsageFilters,
  ): Promise<InfraUsageResult> {
    const end = filters.end ?? new Date();
    const start =
      filters.start ??
      (() => {
        const s = new Date(end);
        s.setDate(s.getDate() - 29);
        s.setHours(0, 0, 0, 0);
        return s;
      })();

    // A number filter is expressed against the call's originating E.164.
    let fromNumber: string | null = null;
    if (filters.numberId) {
      const number = await this.numberRepo.findById(filters.numberId);
      fromNumber = number?.phoneNumber ?? null;
    }
    // Member filter is org-admin territory; personal scope ignores it.
    const memberId = ctx.organizationId ? (filters.memberId ?? null) : null;

    const agg = await this.infraRepo.getUsage(ctx, {
      start,
      end,
      campaignId: filters.campaignId ?? null,
      fromNumber,
      sipDeviceId: filters.sipDeviceId ?? null,
      memberId,
    });

    // Resolve member display names (byMember rows carry ids only).
    const memberNames = await this.resolveMemberNames(
      ctx,
      agg.byMember.map((m) => m.id),
    );
    const byMember: InfraUsageResourceRow[] = agg.byMember.map((m) => ({
      id: m.id,
      name: memberNames.get(m.id) ?? "Agent",
      calls: m.calls,
      minutes: m.minutes,
      cost: m.cost,
    }));

    const topByCalls = (
      rows: { id: string; name: string; calls: number }[],
    ): InfraUsageRef | null => {
      const top = rows[0];
      return top && top.calls > 0
        ? { id: top.id, name: top.name, value: top.calls }
        : null;
    };

    const answerRate =
      agg.performance.totalCalls > 0
        ? Math.round(
            (agg.performance.callsConnected / agg.performance.totalCalls) * 100,
          )
        : 0;

    const spendByNumber = [...agg.byNumber].sort((a, b) => b.cost - a.cost);
    const spendByCampaign = [...agg.byCampaign].sort((a, b) => b.cost - a.cost);

    return {
      scope: ctx.organizationId ? "organization" : "personal",
      currency: "USD",
      range: { start: start.toISOString(), end: end.toISOString() },
      overview: agg.overview,
      performance: {
        totalCalls: agg.performance.totalCalls,
        callsConnected: agg.performance.callsConnected,
        answerRate,
        avgDurationSec: agg.performance.avgDurationSec,
        topCampaign: topByCalls(agg.byCampaign),
        topNumber: topByCalls(agg.byNumber),
        topAgent: topByCalls(byMember),
        topDevice: topByCalls(agg.byDevice),
      },
      cost: {
        spendByNumber,
        spendByCampaign,
        series: agg.series.map((s) => ({
          date: s.date,
          calls: s.calls,
          minutes: s.minutes,
          spend: s.cost,
        })),
      },
      byResource: {
        byCampaign: agg.byCampaign,
        byNumber: agg.byNumber,
        byDevice: agg.byDevice,
        byMember,
      },
    };
  }

  /** Map user ids → display name (org members, or the user themselves). */
  private async resolveMemberNames(
    ctx: OwnershipContext,
    userIds: string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (userIds.length === 0) return names;

    if (ctx.organizationId) {
      const members = await this.orgRepo.listMembersWithUsers(
        ctx.organizationId,
      );
      for (const m of members) {
        if (!m.userId || !m.user) continue;
        const name =
          [m.user.firstName, m.user.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          m.user.emails[0]?.email ||
          "Team member";
        names.set(m.userId, name);
      }
    } else {
      const me = (await this.userRepo.findById(ctx.userId)) as
        | (User & { emails?: { email: string }[] })
        | null;
      if (me) {
        const name =
          [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
          me.emails?.[0]?.email ||
          "You";
        names.set(me.id, name);
      }
    }
    return names;
  }

  /**
   * Journey signals — the raw inputs (beyond the resource inventory the overview
   * already returns) the client needs to place the workspace on its maturity
   * "Journey": a stable 30-day call volume plus the recording / transcription /
   * AI switches. Volume comes from {@link getUsage} over a fixed 30-day window so
   * the classification never depends on whatever filter the Usage view has set.
   */
  async getJourneySignals(
    ctx: OwnershipContext,
  ): Promise<InfraJourneySignalsDto> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);

    const [usage, extra] = await Promise.all([
      this.getUsage(ctx, { start, end }),
      this.infraRepo.getJourneySignals(ctx),
    ]);

    const minutesLast30d = usage.cost.series.reduce(
      (sum, point) => sum + point.minutes,
      0,
    );

    return {
      scope: ctx.organizationId ? "organization" : "personal",
      callsLast30d: usage.performance.totalCalls,
      minutesLast30d: Math.round(minutesLast30d),
      connectedCallsLast30d: usage.performance.callsConnected,
      answerRate: usage.performance.answerRate,
      recordingEnabled: extra.recordAllCalls,
      transcriptionEnabled:
        extra.transcribeRealtime || extra.transcribeRecordings,
      transcriptionsLast30d: extra.transcriptionsLast30d,
      aiEnabled: extra.aiEnabledCount > 0,
    };
  }

  /**
   * Every workspace entity that can be a node, regardless of canvas presence.
   * Powers the inspector/create-flow pickers (assign a number to a campaign,
   * a member to a device, …) which must offer on- and off-canvas resources.
   */
  async listEntities(ctx: OwnershipContext): Promise<InfraLinkableItem[]> {
    const [desired] = await this.loadDesired(ctx);
    return desired.map((d) => ({
      type: d.type,
      referenceId: d.referenceId,
      name: d.name,
      status: d.status,
      subtitle: this.labelForType(d.type),
    }));
  }

  /** Entities in the workspace that are not currently shown on the canvas. */
  async listLinkable(ctx: OwnershipContext): Promise<InfraLinkableItem[]> {
    const [desired] = await this.loadDesired(ctx);
    const resources = await this.infraRepo.listResources(ctx);
    const visibleKeys = new Set(
      resources
        .filter((r) => !r.hidden && r.referenceId)
        .map((r) => this.key(r.type, r.referenceId!)),
    );
    return desired
      .filter((d) => !visibleKeys.has(this.key(d.type, d.referenceId)))
      .map((d) => ({
        type: d.type,
        referenceId: d.referenceId,
        name: d.name,
        status: d.status,
        subtitle: this.labelForType(d.type),
      }));
  }

  /**
   * Add an existing entity back to the canvas. Un-hides a previously removed
   * node, or seeds a fresh one. Returns the resource id.
   */
  async linkResource(
    ctx: OwnershipContext,
    type: InfrastructureResourceType,
    referenceId: string,
    position?: { x: number; y: number },
  ): Promise<{ id: string }> {
    const [desired] = await this.loadDesired(ctx);
    const entity = desired.find(
      (d) => d.type === type && d.referenceId === referenceId,
    );
    if (!entity) {
      throw new NotFoundException("That resource is not in this workspace.");
    }
    const resources = await this.infraRepo.listResources(ctx);
    const existing = resources.find(
      (r) => r.type === type && r.referenceId === referenceId,
    );
    if (existing) {
      await this.infraRepo.updateResource(existing.id, {
        hidden: false,
        ...(position ? { positionX: position.x, positionY: position.y } : {}),
      });
      return { id: existing.id };
    }
    const counts = this.initialColumnCounts(resources);
    const created = await this.infraRepo.createResource(ctx, {
      type,
      referenceId,
      name: entity.name,
      status: entity.status,
      positionX: position?.x ?? COLUMN_X[type],
      positionY: position?.y ?? ((counts[type] ?? 0) + 1) * ROW_GAP,
      metadata: entity.metadata as Record<string, never>,
    });
    await this.infraRepo.createEvent(ctx, {
      resourceId: created.id,
      type: "resource.added_to_canvas",
      message: `Added "${entity.name}" to the canvas`,
    });
    return { id: created.id };
  }

  // ===========================================================================
  // Connections
  // ===========================================================================

  async createConnection(
    ctx: OwnershipContext,
    sourceResourceId: string,
    targetResourceId: string,
  ): Promise<CreateConnectionResult> {
    const source = await this.getOwnedResource(ctx, sourceResourceId);
    const target = await this.getOwnedResource(ctx, targetResourceId);
    if (source.id === target.id) {
      throw new BadRequestException("A node cannot connect to itself.");
    }

    const plan = this.planConnection(source, target);

    if (plan.apply) {
      await this.applyRelationship(ctx, plan.apply, plan.from, plan.to);
      await this.infraRepo.createEvent(ctx, {
        resourceId: plan.from.id,
        connectionId: null,
        type: "connection.applied",
        message: `Connected "${plan.from.name}" → "${plan.to.name}"`,
      });
      return {
        applied: true,
        status: InfrastructureConnectionStatus.ACTIVE,
        message: "Connection applied.",
      };
    }

    // No safe real-world mutation — persist a visual/draft link instead.
    const status = InfrastructureConnectionStatus.DRAFT;
    await this.infraRepo.upsertConnection(ctx, {
      sourceResourceId: source.id,
      targetResourceId: target.id,
      type: plan.type,
      status,
    });
    await this.infraRepo.createEvent(ctx, {
      resourceId: source.id,
      type: "connection.drafted",
      message: `Drafted "${source.name}" → "${target.name}" (not applied)`,
    });
    return {
      applied: false,
      status,
      message: "Saved as a draft link — not yet applied to your workspace.",
    };
  }

  async deleteConnection(
    ctx: OwnershipContext,
    connectionId: string,
  ): Promise<void> {
    if (connectionId.startsWith("derived:")) {
      const [, sourceId, targetId] = connectionId.split(":");
      const source = await this.getOwnedResource(ctx, sourceId);
      const target = await this.getOwnedResource(ctx, targetId);
      const plan = this.planConnection(source, target);
      if (!plan.apply) {
        throw new BadRequestException(
          "This connection reflects a relationship that can't be removed here yet.",
        );
      }
      await this.removeRelationship(ctx, plan.apply, plan.from, plan.to);
      await this.infraRepo.createEvent(ctx, {
        resourceId: plan.from.id,
        type: "connection.removed",
        message: `Disconnected "${plan.from.name}" → "${plan.to.name}"`,
      });
      return;
    }

    const connection = await this.infraRepo.findConnectionById(
      ctx,
      connectionId,
    );
    if (!connection) throw new NotFoundException("Connection not found.");
    await this.infraRepo.deleteConnection(connection.id);
    await this.infraRepo.createEvent(ctx, {
      resourceId: connection.sourceResourceId,
      type: "connection.removed",
      message: "Removed a draft connection",
    });
  }

  // ===========================================================================
  // Connection apply/remove mapping
  // ===========================================================================

  /**
   * Normalize a drawn edge to a canonical (from → to) direction, the connection
   * type, and an optional real mutation to apply. Returns apply=null when the
   * pair has no safe automatic mutation (the edge is stored as a draft).
   */
  private planConnection(
    a: InfrastructureResource,
    b: InfrastructureResource,
  ): {
    from: InfrastructureResource;
    to: InfrastructureResource;
    type: InfrastructureConnectionType;
    apply:
      | "assign_member"
      | "assign_number_to_device"
      | "assign_number_to_campaign"
      | null;
  } {
    const pair = (
      x: InfrastructureResourceType,
      y: InfrastructureResourceType,
    ) => (a.type === x && b.type === y) || (a.type === y && b.type === x);

    const orient = (sourceType: InfrastructureResourceType) =>
      a.type === sourceType ? { from: a, to: b } : { from: b, to: a };

    // Team Member ↔ Campaign → assign the member as a campaign agent.
    if (pair("TEAM_MEMBER", "CAMPAIGN")) {
      return {
        ...orient("TEAM_MEMBER"),
        type: InfrastructureConnectionType.ASSIGNED_TO,
        apply: "assign_member",
      };
    }
    // Phone Number ↔ SIP Device → assign the number to the device.
    if (pair("PHONE_NUMBER", "SIP_DEVICE")) {
      return {
        ...orient("PHONE_NUMBER"),
        type: InfrastructureConnectionType.ROUTES_TO,
        apply: "assign_number_to_device",
      };
    }
    // Phone Number ↔ Campaign → set the campaign's outbound number.
    if (pair("PHONE_NUMBER", "CAMPAIGN")) {
      return {
        ...orient("PHONE_NUMBER"),
        type: InfrastructureConnectionType.USES,
        apply: "assign_number_to_campaign",
      };
    }
    // Team Member ↔ SIP Device → ownership (no safe mutation yet → draft).
    if (pair("TEAM_MEMBER", "SIP_DEVICE")) {
      return {
        ...orient("TEAM_MEMBER"),
        type: InfrastructureConnectionType.OWNS,
        apply: null,
      };
    }
    // Phone Number ↔ Team Member → routing (draft).
    if (pair("PHONE_NUMBER", "TEAM_MEMBER")) {
      return {
        ...orient("PHONE_NUMBER"),
        type: InfrastructureConnectionType.ROUTES_TO,
        apply: null,
      };
    }
    // Anything else is a purely visual link.
    return {
      from: a,
      to: b,
      type: InfrastructureConnectionType.USES,
      apply: null,
    };
  }

  private async applyRelationship(
    ctx: OwnershipContext,
    apply: NonNullable<
      ReturnType<InfrastructureService["planConnection"]>["apply"]
    >,
    from: InfrastructureResource,
    to: InfrastructureResource,
  ): Promise<void> {
    this.assertRef(from);
    this.assertRef(to);
    switch (apply) {
      case "assign_member":
        await this.campaignMemberService.addMember(
          ctx,
          to.referenceId!,
          from.referenceId!,
          "agent",
        );
        return;
      case "assign_number_to_device":
        await this.sipDeviceService.changeNumber(ctx, to.referenceId!, {
          numberId: from.referenceId!,
        });
        return;
      case "assign_number_to_campaign":
        await this.campaignConfig.updateSettings(ctx, to.referenceId!, {
          numberPurchasedId: from.referenceId!,
        });
        return;
    }
  }

  private async removeRelationship(
    ctx: OwnershipContext,
    apply: NonNullable<
      ReturnType<InfrastructureService["planConnection"]>["apply"]
    >,
    from: InfrastructureResource,
    to: InfrastructureResource,
  ): Promise<void> {
    this.assertRef(from);
    this.assertRef(to);
    switch (apply) {
      case "assign_member":
        await this.campaignMemberService.removeMember(
          ctx,
          to.referenceId!,
          from.referenceId!,
        );
        return;
      case "assign_number_to_device":
        await this.sipDeviceService.changeNumber(ctx, to.referenceId!, {
          numberId: null,
        });
        return;
      case "assign_number_to_campaign":
        await this.campaignConfig.updateSettings(ctx, to.referenceId!, {
          numberPurchasedId: null,
        });
        return;
    }
  }

  // ===========================================================================
  // Native resource creation (build flows) — every method reuses the existing
  // domain service so no business logic is duplicated. Infra only orchestrates
  // the call, places the resulting node on the canvas, and records an event.
  // ===========================================================================

  /** Add one or more existing workspace members to the canvas (select-existing). */
  async addTeamMembers(
    ctx: OwnershipContext,
    userIds: string[],
    position?: InfraPosition,
  ): Promise<{ resourceIds: string[] }> {
    const allowed = await this.workspaceMemberIds(ctx);
    const resourceIds: string[] = [];
    let i = 0;
    for (const userId of userIds) {
      if (!allowed.has(userId)) continue;
      const pos = position
        ? { x: position.x, y: position.y + i * ROW_GAP }
        : undefined;
      const { id } = await this.linkResource(ctx, "TEAM_MEMBER", userId, pos);
      resourceIds.push(id);
      i++;
    }
    if (resourceIds.length === 0) {
      throw new BadRequestException("No valid members to add.");
    }
    return { resourceIds };
  }

  /** Available inventory for "Add phone number" — provider inventory + doc flag. */
  async searchNumbers(
    ctx: OwnershipContext,
    params: {
      country: string;
      numberType?: "local" | "toll_free" | "mobile";
      areaCode?: string;
      limit?: number;
    },
  ): Promise<InfraNumberSearchResult> {
    const found =
      (await this.telephonyService.searchAvailableNumbers({
        countryCode: params.country,
        areaCode: params.areaCode,
        numberType: params.numberType,
        limit: params.limit ?? 20,
      })) ?? [];

    let documentsRequired = false;
    try {
      const reqs = await this.telephonyService.getRegulatoryRequirements({
        countryCode: params.country,
        phoneNumberType: params.numberType,
        action: "ordering",
      });
      documentsRequired = !reqs.requirementsMet;
    } catch {
      // Best-effort: never block search because the requirements lookup failed.
    }

    return {
      numbers: found.map((n) => ({
        phoneNumber: n.phoneNumber,
        countryCode: n.countryCode,
        numberType: n.numberType ?? null,
        locality: n.locality ?? null,
        region: n.region ?? null,
        monthlyCost: n.costInformation.monthlyCost,
        upfrontCost: n.costInformation.upfrontCost,
        currency: n.costInformation.currency,
        capabilities: {
          voice: n.capabilities.voice,
          sms: n.capabilities.sms,
        },
      })),
      documentsRequired,
    };
  }

  /**
   * Start a Stripe Checkout to buy a number, returning to /infra/overview.
   * Price is resolved authoritatively from the provider — the client never
   * dictates the amount. Provisioning happens in the existing subscription
   * webhook (shared with the dashboard flow); Infra confirms it on return.
   */
  async createPhoneCheckout(
    ctx: OwnershipContext,
    input: { phoneNumber: string; frontendOrigin: string },
  ): Promise<InfraCheckoutResult> {
    const customerId = await this.resolveCustomerId(ctx);
    const cost = await this.numberPurchasedService.getAuthoritativeCost(
      input.phoneNumber,
    );

    const base = (input.frontendOrigin || "").replace(/\/$/, "");
    const successUrl =
      `${base}/infra/overview?checkout=success&resource=phone_number` +
      `&number=${encodeURIComponent(input.phoneNumber)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${base}/infra/overview?checkout=cancelled&resource=phone_number`;

    const session =
      await this.stripeService.createPhoneNumberSubscriptionSession(
        customerId,
        input.phoneNumber,
        cost.monthlyCost,
        0,
        ctx.userId,
        ctx.organizationId ?? null,
        input.frontendOrigin,
        { successUrl, cancelUrl },
      );

    await this.infraRepo.createEvent(ctx, {
      type: "phone_number.checkout_created",
      message: `Started checkout for ${input.phoneNumber}`,
    });

    return { url: session.url };
  }

  /**
   * Confirm a returning phone checkout. Verifies the Stripe session is paid
   * (never trusting the query param) and that the webhook has provisioned the
   * number in this workspace, then drops its node on the canvas.
   */
  async completePhoneCheckout(
    ctx: OwnershipContext,
    input: { sessionId: string; phoneNumber: string; position?: InfraPosition },
  ): Promise<InfraCompletePhoneResult> {
    let paid = false;
    try {
      const details = await this.stripeService.getCheckoutSessionDetails(
        input.sessionId,
      );
      paid =
        details.paymentStatus === "paid" ||
        details.paymentStatus === "no_payment_required";
    } catch {
      paid = false;
    }
    if (!paid) return { ready: false };

    // The subscription webhook is the source of truth for provisioning; it may
    // lag the redirect, so the client retries while this returns ready: false.
    const numbers = await this.numberRepo.findByOwner(ctx);
    const number = numbers.find((n) => n.phoneNumber === input.phoneNumber);
    if (!number) return { ready: false };

    const { id } = await this.linkResource(
      ctx,
      "PHONE_NUMBER",
      number.id,
      input.position,
    );
    await this.infraRepo.createEvent(ctx, {
      resourceId: id,
      type: "payment.completed",
      message: `Payment completed — ${number.phoneNumber} added`,
    });
    return { ready: true, resourceId: id, status: number.status ?? "active" };
  }

  /** Create a SIP device and place it on the canvas. Credentials returned once. */
  async createSipDevice(
    ctx: OwnershipContext,
    input: InfraSipCreateInput,
  ): Promise<InfraSipCreateResult> {
    const created = await this.sipDeviceService.create(ctx, ctx.userId, {
      label: input.label,
      deviceType: input.deviceType ?? null,
      assignedUserId: input.assignedUserId ?? null,
      numberId: input.numberId ?? null,
      allowInbound: input.allowInbound,
    });
    const { id } = await this.linkResource(
      ctx,
      "SIP_DEVICE",
      created.device.id,
      input.position,
    );
    await this.infraRepo.createEvent(ctx, {
      resourceId: id,
      type: "sip_device.created",
      message: `Created SIP device "${created.device.label}"`,
    });
    return { resourceId: id, credentials: created.credentials };
  }

  /** Create a draft campaign (org-only) and place it on the canvas. */
  async createCampaignResource(
    ctx: OwnershipContext,
    input: InfraCampaignCreateInput,
  ): Promise<InfraCreateResult> {
    const dto: CreateCampaignFullDto = {
      name: input.name,
      description: input.description,
      dialerMode: input.dialerMode as CreateCampaignFullDto["dialerMode"],
      numberPurchasedId: input.numberPurchasedId,
    };
    const campaign = await this.campaignConfig.createCampaign(ctx, dto);

    for (const userId of input.agentUserIds ?? []) {
      await this.campaignMemberService
        .addMember(ctx, campaign.id, userId, "agent")
        .catch(() => undefined);
    }

    const { id } = await this.linkResource(
      ctx,
      "CAMPAIGN",
      campaign.id,
      input.position,
    );
    await this.infraRepo.createEvent(ctx, {
      resourceId: id,
      type: "campaign.created",
      message: `Created campaign "${campaign.name}"`,
    });
    return { resourceId: id };
  }

  // ===========================================================================
  // Inspector edits — property changes + relationship assign/unassign
  // ===========================================================================

  /** Property-level edits from an inspector tab (no relationship edges here). */
  async updateConfiguration(
    ctx: OwnershipContext,
    resourceId: string,
    patch: InfraConfigPatch,
  ): Promise<InfraConfigResult> {
    const resource = await this.getOwnedResource(ctx, resourceId);

    if (patch.name) {
      await this.renameResource(ctx, resourceId, patch.name);
    }

    this.assertRef(resource);
    const ref = resource.referenceId!;

    if (resource.type === "CAMPAIGN") {
      if (patch.campaignSettings) {
        await this.campaignConfig.updateSettings(
          ctx,
          ref,
          patch.campaignSettings as UpdateCampaignSettingsDto,
        );
        await this.infraRepo.createEvent(ctx, {
          resourceId,
          type: "campaign.configured",
          message: `Updated campaign configuration`,
        });
      }
      if (patch.transition) {
        await this.campaignConfig.transitionStatus(ctx, ref, patch.transition);
        await this.infraRepo.createEvent(ctx, {
          resourceId,
          type: `campaign.${patch.transition}`,
          message: `Campaign ${patch.transition}`,
        });
      }
    } else if (resource.type === "SIP_DEVICE") {
      if (typeof patch.enabled === "boolean") {
        await this.sipDeviceService.setEnabled(ctx, ref, patch.enabled);
        await this.infraRepo.createEvent(ctx, {
          resourceId,
          type: patch.enabled ? "sip_device.enabled" : "sip_device.disabled",
          message: `SIP device ${patch.enabled ? "enabled" : "disabled"}`,
        });
      }
    }

    return { ok: true };
  }

  /** Regenerate a SIP device's password (dangerous — returns new credentials). */
  async regenerateSipCredentials(
    ctx: OwnershipContext,
    resourceId: string,
  ): Promise<InfraConfigResult> {
    const resource = await this.getOwnedResource(ctx, resourceId);
    if (resource.type !== "SIP_DEVICE") {
      throw new BadRequestException("Not a SIP device.");
    }
    this.assertRef(resource);
    const created = await this.sipDeviceService.regeneratePassword(
      ctx,
      resource.referenceId!,
    );
    await this.infraRepo.createEvent(ctx, {
      resourceId,
      type: "sip_device.credentials_regenerated",
      message: `Regenerated SIP credentials`,
    });
    return { ok: true, credentials: created.credentials };
  }

  /**
   * Apply a relationship between two resources from an inspector tab. Ensures
   * the target entity has a node, then reuses createConnection (which performs
   * the real DB mutation for supported pairs and draws the edge).
   */
  async assignResource(
    ctx: OwnershipContext,
    sourceResourceId: string,
    targetType: InfrastructureResourceType,
    targetReferenceId: string,
  ): Promise<CreateConnectionResult> {
    await this.getOwnedResource(ctx, sourceResourceId);
    const { id: targetId } = await this.linkResource(
      ctx,
      targetType,
      targetReferenceId,
    );
    return this.createConnection(ctx, sourceResourceId, targetId);
  }

  /** Remove a relationship applied from an inspector tab (reuses deleteConnection). */
  async unassignResource(
    ctx: OwnershipContext,
    sourceResourceId: string,
    targetType: InfrastructureResourceType,
    targetReferenceId: string,
  ): Promise<void> {
    await this.getOwnedResource(ctx, sourceResourceId);
    const resources = await this.infraRepo.listResources(ctx);
    const target = resources.find(
      (r) => r.type === targetType && r.referenceId === targetReferenceId,
    );
    if (!target) return;
    // deleteConnection's derived branch only reads source/target ids, so the
    // trailing type segment is a placeholder; the plan is recomputed there.
    await this.deleteConnection(
      ctx,
      `derived:${sourceResourceId}:${target.id}:x`,
    );
  }

  /** Delete the REAL entity behind a node (type-aware, dangerous). */
  async deleteResource(
    ctx: OwnershipContext,
    resourceId: string,
  ): Promise<void> {
    const resource = await this.getOwnedResource(ctx, resourceId);
    this.assertRef(resource);
    const ref = resource.referenceId!;
    switch (resource.type) {
      case "SIP_DEVICE":
        await this.sipDeviceService.delete(ctx, ref, { reroute: "ringee" });
        break;
      case "CAMPAIGN":
        await this.campaignConfig.deleteCampaign(ctx, ref);
        break;
      default:
        throw new BadRequestException(
          "This resource can't be deleted from Infra yet.",
        );
    }
    await this.infraRepo.updateResource(resourceId, { hidden: true });
    await this.infraRepo.createEvent(ctx, {
      resourceId,
      type: "resource.deleted",
      message: `Deleted "${resource.name}"`,
    });
  }

  /** Regulatory documents/requirements for a pending PHONE_NUMBER node. */
  async getResourceDocuments(ctx: OwnershipContext, resourceId: string) {
    const resource = await this.getOwnedResource(ctx, resourceId);
    if (resource.type !== "PHONE_NUMBER" || !resource.referenceId) {
      throw new BadRequestException("No documents for this resource.");
    }
    return this.numberPurchasedService.getNumberRequirements(
      resource.referenceId,
    );
  }

  // ── Build-flow helpers ─────────────────────────────────────────────────────

  /** Set of userIds that belong to the active workspace (org members or self). */
  private async workspaceMemberIds(
    ctx: OwnershipContext,
  ): Promise<Set<string>> {
    if (ctx.organizationId) {
      const members = await this.orgRepo.listMembersWithUsers(
        ctx.organizationId,
      );
      return new Set(
        members.map((m) => m.userId).filter((id): id is string => Boolean(id)),
      );
    }
    return new Set([ctx.userId]);
  }

  /**
   * Resolve the Stripe customer for the active workspace, creating it on first
   * use. Mirrors StripeController.getOrCreateCustomer — the org customer is used
   * in org context, the personal user customer otherwise.
   */
  private async resolveCustomerId(ctx: OwnershipContext): Promise<string> {
    if (ctx.organizationId) {
      const org = await this.organizationService.getOrganizationById(
        ctx.organizationId,
      );
      if (!org) throw new NotFoundException("Organization not found");
      if (org.customerId) return org.customerId;
      const { id } = await this.stripeService.createCustomer(
        ctx.userId,
        org.name,
      );
      await this.organizationService.updateCustomerId(org.id, id);
      return id;
    }
    const user = await this.userService.getUserById(ctx.userId);
    if (user?.customerId) return user.customerId;
    const name =
      `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "User";
    const { id } = await this.stripeService.createCustomer(ctx.userId, name);
    await this.userService.patchCustomerId(ctx.userId, id);
    return id;
  }

  // ===========================================================================
  // Loading + edge derivation
  // ===========================================================================

  /**
   * Load every workspace entity that should appear as a node, plus the campaign
   * membership rows needed for edge derivation.
   */
  private async loadDesired(
    ctx: OwnershipContext,
  ): Promise<[DesiredEntity[], Array<{ campaignId: string; userId: string }>]> {
    const orgId = ctx.organizationId ?? null;

    const [
      numbers,
      devices,
      poolMembers,
      rotationSettings,
      customIntegrations,
    ] = await Promise.all([
      this.numberRepo.findByOwner(ctx),
      this.sipRepo.listByOwner(ctx),
      this.rotationRepo.listPoolMembers(ctx),
      this.rotationRepo.findSettings(ctx),
      this.customIntegrationRepo.list(ctx),
    ]);

    const campaigns = orgId
      ? (await this.campaignRepo.listByOrganization(orgId, { limit: 500 })).data
      : [];
    const crmConnections = await this.crmService
      .listActive(ctx)
      .catch(() => []);

    // Campaign members (for Team Member → Campaign edges + per-member counts).
    const campaignMemberRows = (
      await Promise.all(
        campaigns.map(async (c) => {
          const members = await this.campaignMemberRepo.findByCampaign(c.id);
          return members.map((m) => ({ campaignId: c.id, userId: m.userId }));
        }),
      )
    ).flat();

    // Per-member rollups for node metadata.
    const campaignsByMember = new Map<string, number>();
    for (const row of campaignMemberRows) {
      campaignsByMember.set(
        row.userId,
        (campaignsByMember.get(row.userId) ?? 0) + 1,
      );
    }
    const devicesByMember = new Map<string, number>();
    for (const d of devices) {
      devicesByMember.set(d.userId, (devicesByMember.get(d.userId) ?? 0) + 1);
    }

    const desired: DesiredEntity[] = [];

    // ── Team members ──────────────────────────────────────────────────────
    if (orgId) {
      const members = await this.orgRepo.listMembersWithUsers(orgId);
      for (const m of members) {
        if (!m.userId || !m.user) continue;
        const fullName =
          [m.user.firstName, m.user.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          m.user.emails[0]?.email ||
          "Team member";
        desired.push({
          type: "TEAM_MEMBER",
          referenceId: m.userId,
          name: fullName,
          status: "ACTIVE",
          metadata: {
            role: this.normalizeRole(m.role),
            email: m.user.emails[0]?.email ?? null,
            avatarUrl: m.user.imageUrl ?? m.user.profileImageUrl ?? null,
            assignedCampaigns: campaignsByMember.get(m.userId) ?? 0,
            assignedSipDevices: devicesByMember.get(m.userId) ?? 0,
          },
        });
      }
    } else {
      const me = (await this.userRepo.findById(ctx.userId)) as
        | (User & { emails: { email: string }[] })
        | null;
      if (me) {
        const fullName =
          [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
          me.emails?.[0]?.email ||
          "You";
        desired.push({
          type: "TEAM_MEMBER",
          referenceId: me.id,
          name: fullName,
          status: "ACTIVE",
          metadata: {
            role: "OWNER",
            email: me.emails[0]?.email ?? null,
            avatarUrl: me.imageUrl ?? me.profileImageUrl ?? null,
            assignedCampaigns: campaignsByMember.get(me.id) ?? 0,
            assignedSipDevices: devicesByMember.get(me.id) ?? 0,
          },
        });
      }
    }

    // ── Phone numbers ─────────────────────────────────────────────────────
    const campaignByNumber = new Map<string, string>();
    for (const c of campaigns) {
      if (c.numberPurchasedId)
        campaignByNumber.set(c.numberPurchasedId, c.name);
      if (c.callerIdId) campaignByNumber.set(c.callerIdId, c.name);
    }
    for (const n of numbers) {
      desired.push({
        type: "PHONE_NUMBER",
        referenceId: n.id,
        name: n.phoneNumber,
        status: n.status ?? "active",
        metadata: {
          country: n.isoCountry,
          numberType: n.phoneNumberType,
          monthlyCost: n.monthlyCost,
          currency: n.currency,
          inboundMode: n.inboundMode,
          assignedCampaign: campaignByNumber.get(n.id) ?? null,
        },
      });
    }

    // ── SIP devices ───────────────────────────────────────────────────────
    for (const d of devices) {
      desired.push({
        type: "SIP_DEVICE",
        referenceId: d.id,
        name: d.label,
        status: d.status,
        metadata: {
          deviceType: d.deviceType,
          sipUsername: d.sipUsername,
          assignedNumber: d.assignedNumber?.phoneNumber ?? null,
          userId: d.userId,
          lastRegisteredAt: d.lastRegisteredAt,
        },
      });
    }

    // ── Campaigns ─────────────────────────────────────────────────────────
    for (const c of campaigns) {
      desired.push({
        type: "CAMPAIGN",
        referenceId: c.id,
        name: c.name,
        status: c.status,
        metadata: {
          leads: c._count?.leads ?? 0,
          dialerMode: c.dialerMode,
          agents: campaigns.length ? undefined : 0,
        },
      });
    }

    // ── Caller-ID pool (single node) ──────────────────────────────────────
    if (poolMembers.length > 0) {
      desired.push({
        type: "NUMBER_POOL",
        referenceId: POOL_REF,
        name: "Caller ID Pool",
        status: rotationSettings?.enabled ? "ACTIVE" : "INACTIVE",
        metadata: {
          members: poolMembers.length,
          enabled: rotationSettings?.enabled ?? false,
          strategy: rotationSettings?.strategy ?? "local_presence",
        },
      });
    }

    // ── Integrations (best-effort) ────────────────────────────────────────
    for (const ci of customIntegrations) {
      desired.push({
        type: "INTEGRATION",
        referenceId: ci.id,
        name: ci.name,
        status: ci.status,
        metadata: { kind: "custom_integration", provider: "custom" },
      });
    }
    for (const crm of crmConnections) {
      desired.push({
        type: "INTEGRATION",
        referenceId: crm.id,
        name: crm.externalAccountName ?? crm.provider,
        status: crm.status,
        metadata: { kind: "crm", provider: crm.provider },
      });
    }

    return [desired, campaignMemberRows];
  }

  private async deriveEdges(
    ctx: OwnershipContext,
    resIdByKey: Map<string, string>,
    campaignMembers: Array<{ campaignId: string; userId: string }>,
  ): Promise<InfraEdgeDto[]> {
    const edges: InfraEdgeDto[] = [];
    const seen = new Set<string>();
    const push = (
      sourceKey: string,
      targetKey: string,
      type: InfrastructureConnectionType,
    ) => {
      const source = resIdByKey.get(sourceKey);
      const target = resIdByKey.get(targetKey);
      if (!source || !target) return;
      const dedup = `${source}:${target}:${type}`;
      if (seen.has(dedup)) return;
      seen.add(dedup);
      edges.push({
        id: `derived:${source}:${target}:${type}`,
        source,
        target,
        type,
        status: InfrastructureConnectionStatus.ACTIVE,
        applied: true,
      });
    };

    const [numbers, devices, poolMembers] = await Promise.all([
      this.numberRepo.findByOwner(ctx),
      this.sipRepo.listByOwner(ctx),
      this.rotationRepo.listPoolMembers(ctx),
    ]);
    const campaigns = ctx.organizationId
      ? (
          await this.campaignRepo.listByOrganization(ctx.organizationId, {
            limit: 500,
          })
        ).data
      : [];

    // SIP devices: Team Member → SIP Device (OWNS); Phone Number → SIP Device.
    for (const d of devices) {
      push(
        this.key("TEAM_MEMBER", d.userId),
        this.key("SIP_DEVICE", d.id),
        InfrastructureConnectionType.OWNS,
      );
      if (d.assignedPhoneNumberId) {
        push(
          this.key("PHONE_NUMBER", d.assignedPhoneNumberId),
          this.key("SIP_DEVICE", d.id),
          InfrastructureConnectionType.ROUTES_TO,
        );
      }
    }

    // Phone Number → Team Member (owner) + Phone Number → SIP Device (inbound).
    for (const n of numbers) {
      if (n.userId) {
        push(
          this.key("PHONE_NUMBER", n.id),
          this.key("TEAM_MEMBER", n.userId),
          InfrastructureConnectionType.ROUTES_TO,
        );
      }
      if (n.inboundSipDeviceId) {
        push(
          this.key("PHONE_NUMBER", n.id),
          this.key("SIP_DEVICE", n.inboundSipDeviceId),
          InfrastructureConnectionType.ROUTES_TO,
        );
      }
    }

    // Campaigns: members + numbers + pool usage.
    for (const c of campaigns) {
      if (c.numberPurchasedId) {
        push(
          this.key("PHONE_NUMBER", c.numberPurchasedId),
          this.key("CAMPAIGN", c.id),
          InfrastructureConnectionType.USES,
        );
      }
      if (c.callerIdId) {
        push(
          this.key("PHONE_NUMBER", c.callerIdId),
          this.key("CAMPAIGN", c.id),
          InfrastructureConnectionType.USES,
        );
      }
      for (const numId of c.rotationNumberIds ?? []) {
        push(
          this.key("PHONE_NUMBER", numId),
          this.key("CAMPAIGN", c.id),
          InfrastructureConnectionType.USES,
        );
      }
      if ((c.rotationNumberIds ?? []).length > 0) {
        push(
          this.key("CAMPAIGN", c.id),
          this.key("NUMBER_POOL", POOL_REF),
          InfrastructureConnectionType.USES,
        );
      }
    }
    for (const row of campaignMembers) {
      push(
        this.key("TEAM_MEMBER", row.userId),
        this.key("CAMPAIGN", row.campaignId),
        InfrastructureConnectionType.ASSIGNED_TO,
      );
    }

    // Pool membership: Phone Number → Number Pool.
    for (const m of poolMembers) {
      push(
        this.key("PHONE_NUMBER", m.numberId),
        this.key("NUMBER_POOL", POOL_REF),
        InfrastructureConnectionType.BELONGS_TO,
      );
    }

    return edges;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private key(type: InfrastructureResourceType, referenceId: string): string {
    return `${type}:${referenceId}`;
  }

  private async getOwnedResource(
    ctx: OwnershipContext,
    id: string,
  ): Promise<InfrastructureResource> {
    const resource = await this.infraRepo.findResourceById(ctx, id);
    if (!resource) {
      throw new NotFoundException("Resource not found in this workspace.");
    }
    return resource;
  }

  private assertRef(r: InfrastructureResource): void {
    if (!r.referenceId) {
      throw new ForbiddenException(
        "This node isn't linked to a real resource yet.",
      );
    }
  }

  private initialColumnCounts(
    resources: InfrastructureResource[],
  ): Partial<Record<InfrastructureResourceType, number>> {
    const counts: Partial<Record<InfrastructureResourceType, number>> = {};
    for (const r of resources) {
      counts[r.type] = (counts[r.type] ?? 0) + 1;
    }
    return counts;
  }

  private normalizeRole(role: string): string {
    const r = role.toLowerCase();
    if (r.includes("admin")) return "ADMIN";
    if (r.includes("owner")) return "OWNER";
    return "MEMBER";
  }

  private labelForType(type: InfrastructureResourceType): string {
    const labels: Record<InfrastructureResourceType, string> = {
      TEAM_MEMBER: "Team Member",
      PHONE_NUMBER: "Phone Number",
      SIP_DEVICE: "SIP Device",
      CAMPAIGN: "Campaign",
      NUMBER_POOL: "Number Pool",
      ROUTING_RULE: "Routing Rule",
      INTEGRATION: "Integration",
    };
    return labels[type];
  }
}
