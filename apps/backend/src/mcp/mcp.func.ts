import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  CallService,
  CallSessionService,
  CallbackService,
  CampaignService,
  CampaignConfigService,
  ComplianceService,
  ContactService,
  ContextDescriptor,
  DashboardService,
  LeadSearchService,
  MeetingService,
  ObjectionInsightService,
  OrganizationService,
  OutboundAnalyticsService,
  PendingActionService,
  PipelineActivationService,
  PipelineType,
  UserDeviceService,
  contextKey,
  VoiceAgentCallService,
  VoiceAgentResultService,
  VoiceAgentService,
} from "@ringee/services";
import {
  DashboardContext,
  LeadSearchFilters,
  NotificationService,
  OwnershipContext,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import {
  Call,
  CallOutcome,
  CallSessionSource,
  CallStatus,
  CallbackStatus,
  Contact,
  EnrichmentProviderType,
  NO_CAMPAIGN,
  PendingActionStatus,
} from "@ringee/database";
import { McpTool } from "./mcp.tools";
import {
  CreateCallSessionInput,
  CreateCallSessionSchema,
  GetAiVoiceAgentCallInput,
  GetAiVoiceAgentCallSchema,
  ListAiVoiceAgentsInput,
  ListAiVoiceAgentsSchema,
  StartAiVoiceAgentCallInput,
  StartAiVoiceAgentCallSchema,
  CreateCallbackInput,
  CreateCallbackSchema,
  CreateContactInput,
  CreateContactSchema,
  DeleteCallSessionInput,
  DeleteCallSessionSchema,
  DeleteContactInput,
  DeleteContactSchema,
  FindContactsByOutcomeInput,
  FindContactsByOutcomeSchema,
  GetCallSessionInput,
  GetCallSessionSchema,
  GetContactInput,
  GetContactSchema,
  ImportLeadsInput,
  ImportLeadsSchema,
  ListCallsInput,
  ListCallsSchema,
  ListWorkspacesSchema,
  SwitchWorkspaceInput,
  SwitchWorkspaceSchema,
  LogCallOutcomeInput,
  LogCallOutcomeSchema,
  RevealLeadInput,
  RevealLeadSchema,
  ScheduleMeetingInput,
  ScheduleMeetingSchema,
  SearchContactsInput,
  SearchContactsSchema,
  SearchLeadsInput,
  SearchLeadsSchema,
  StartCallInput,
  StartCallSchema,
  UpdateCallSessionInput,
  UpdateCallSessionSchema,
  UpdateContactInput,
  UpdateContactSchema,
  AddCampaignLeadsInput,
  AddCampaignLeadsSchema,
  AddToDncInput,
  AddToDncSchema,
  DeleteCampaignLeadInput,
  DeleteCampaignLeadSchema,
  GetAiPipelineResultsInput,
  GetAiPipelineResultsSchema,
  GetCallAnalyticsInput,
  GetCallAnalyticsSchema,
  GetCampaignAnalyticsInput,
  GetCampaignAnalyticsSchema,
  GetCampaignInput,
  GetCampaignSchema,
  GetDayActivityInput,
  GetDayActivitySchema,
  ListAiPipelinesSchema,
  ListCallbacksInput,
  ListCallbacksSchema,
  ListCampaignLeadsInput,
  ListCampaignLeadsSchema,
  ListCampaignsInput,
  ListCampaignsSchema,
  ListDncInput,
  ListDncSchema,
  RemoveFromDncInput,
  RemoveFromDncSchema,
  UpdateCampaignStatusInput,
  UpdateCampaignStatusSchema,
} from "./mcp.zod";
import { CallSessionActorSource } from "@ringee/database";

type Content = { type: "text"; text: string };

const text = (value: unknown): Content[] => [
  {
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
  },
];

@Injectable()
export class McpFunc {
  private readonly logger = new Logger(McpFunc.name);

  constructor(
    private readonly contactService: ContactService,
    private readonly callService: CallService,
    private readonly callbackService: CallbackService,
    private readonly meetingService: MeetingService,
    private readonly userDeviceService: UserDeviceService,
    private readonly notificationService: NotificationService,
    private readonly callSessionService: CallSessionService,
    private readonly leadSearchService: LeadSearchService,
    private readonly organizationService: OrganizationService,
    private readonly campaignService: CampaignService,
    private readonly campaignConfigService: CampaignConfigService,
    private readonly outboundAnalyticsService: OutboundAnalyticsService,
    private readonly complianceService: ComplianceService,
    private readonly dashboardService: DashboardService,
    private readonly pipelineActivationService: PipelineActivationService,
    private readonly pendingActionService: PendingActionService,
    private readonly objectionInsightService: ObjectionInsightService,
    private readonly voiceAgentService: VoiceAgentService,
    private readonly voiceAgentCallService: VoiceAgentCallService,
    private readonly voiceAgentResultService: VoiceAgentResultService,
  ) {}

  private buildJoinUrl(rawToken: string): string {
    const base = apiConfiguration.FRONTEND_URL.replace(/\/$/, "");
    return `${base}/dialer/session?token=${encodeURIComponent(rawToken)}`;
  }

  private assertContactOwnership(
    ctx: OwnershipContext,
    contact: Pick<Contact, "id" | "userId" | "organizationId">,
  ): void {
    if (ctx.organizationId) {
      if (contact.organizationId !== ctx.organizationId) {
        throw new ForbiddenException(
          "Contact does not belong to this organization",
        );
      }
      return;
    }
    if (contact.userId !== ctx.userId || contact.organizationId !== null) {
      throw new ForbiddenException("Contact does not belong to this user");
    }
  }

  private serializeContact(contact: Contact) {
    return {
      id: contact.id,
      name: contact.name,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      company: contact.company,
      jobTitle: contact.jobTitle,
      state: contact.locationRegion,
      website: contact.websiteUrl,
      revenue: contact.revenue,
      companySize: contact.companySize,
    };
  }

  /** Human-readable mm:ss / h:mm:ss from a second count. */
  private formatDuration(seconds: number | null | undefined): string | null {
    if (seconds == null || seconds <= 0) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /**
   * Build the full, human-facing detail of a call for list_calls: who/when,
   * outcome, transcription and recording URL. Deliberately omits cost and
   * low-level telephony plumbing (provider/control ids, client state, etc.) —
   * those are not useful to the model or the end user.
   */
  private serializeCallDetail(
    call: Call & {
      contact?: Contact | null;
      recordings?: { url: string | null; transcript: string | null }[];
      callTranscriptions?: { text: string | null; status: string }[];
    },
  ) {
    const recordingUrl = call.recordings?.find((r) => r.url)?.url ?? null;

    // Prefer the dedicated transcription text; fall back to a transcript stored
    // on the recording itself.
    const transcription =
      call.callTranscriptions
        ?.map((t) => t.text?.trim())
        .find((t): t is string => !!t) ??
      call.recordings
        ?.map((r) => r.transcript?.trim())
        .find((t): t is string => !!t) ??
      null;

    return {
      id: call.id,
      direction: call.direction,
      status: call.status,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      createdAt: call.createdAt,
      durationSeconds: call.durationSeconds,
      duration: this.formatDuration(call.durationSeconds),
      outcome: call.outcome,
      outcomeNote: call.outcomeNote,
      contact: call.contact ? this.serializeContact(call.contact) : null,
      recordingUrl,
      hasRecording: !!recordingUrl,
      transcription,
      hasTranscription: !!transcription,
    };
  }

  /**
   * Whether the caller may run admin-only features in the active workspace.
   * Mirrors OrgAdminGuard: a freelancer (no organization) owns all of their own
   * data, so they always pass; inside an organization only `org:admin` does.
   */
  private async isOrgAdmin(ctx: OwnershipContext): Promise<boolean> {
    if (!ctx.organizationId) return true;
    const memberships = await this.organizationService.listMembershipsForUser(
      ctx.userId,
    );
    return (
      memberships.find((m) => m.id === ctx.organizationId)?.role === "org:admin"
    );
  }

  private async assertOrgAdmin(ctx: OwnershipContext): Promise<void> {
    if (!(await this.isOrgAdmin(ctx))) {
      throw new ForbiddenException(
        "This action is restricted to organization admins",
      );
    }
  }

  /** Campaigns only exist inside an organization workspace. */
  private assertOrganization(ctx: OwnershipContext): void {
    if (!ctx.organizationId) {
      throw new ForbiddenException(
        "Campaigns require an active organization workspace. Use " +
          "list_workspaces / switch_workspace to select one.",
      );
    }
  }

  /**
   * Absolute start/end instants of a calendar day at a fixed UTC offset. We
   * take the offset rather than an IANA zone so the boundaries are unambiguous
   * without dragging in a timezone database.
   */
  private dayBounds(
    date: string,
    utcOffset = "+00:00",
  ): { start: Date; end: Date } {
    const start = new Date(`${date}T00:00:00.000${utcOffset}`);
    const end = new Date(`${date}T23:59:59.999${utcOffset}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        `Invalid date/utcOffset combination: ${date} ${utcOffset}`,
      );
    }
    return { start, end };
  }

  /**
   * Split a campaign filter into the two shapes the call repository takes:
   * the literal "none" means "calls made outside any campaign".
   */
  private callCampaignFilter(campaignId?: string): {
    campaignId?: string;
    excludeCampaignCalls?: boolean;
  } {
    if (!campaignId) return {};
    if (campaignId === NO_CAMPAIGN) return { excludeCampaignCalls: true };
    return { campaignId };
  }

  /**
   * Build the DashboardContext the analytics widgets expect. The role is
   * resolved from the real membership, and non-admin members are narrowed to
   * their own calls exactly like resolveMemberFilter does over HTTP.
   */
  private async buildDashboardContext(
    ctx: OwnershipContext,
    input: {
      scope?: "personal" | "organization";
      memberUserId?: string;
      campaignId?: string;
      outcome?: string;
      dateRange?: { start: Date; end: Date };
    },
  ): Promise<DashboardContext> {
    const isOrgAdmin = await this.isOrgAdmin(ctx);
    return {
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      isOrgAdmin,
      // Only admins may narrow to another member; members are already limited
      // to their own rows by the ownership filter.
      filterMemberId: isOrgAdmin ? (input.memberUserId ?? null) : null,
      scope: input.scope ?? (ctx.organizationId ? "organization" : "personal"),
      dateRange: input.dateRange,
      campaignId: input.campaignId ?? null,
      outcome: input.outcome ?? null,
    };
  }

  /** Resolve from/to (preferred) or a preset range into absolute instants. */
  private resolveAnalyticsRange(input: {
    range?: string;
    from?: string;
    to?: string;
  }): { start: Date; end: Date } | undefined {
    if (input.from && input.to) {
      const start = new Date(input.from);
      const end = new Date(input.to);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException("Invalid from/to datetime");
      }
      return { start, end };
    }
    if (!input.range) return undefined;

    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    switch (input.range) {
      case "today":
        return { start, end };
      case "yesterday": {
        start.setDate(start.getDate() - 1);
        const yEnd = new Date(start);
        yEnd.setHours(23, 59, 59, 999);
        return { start, end: yEnd };
      }
      case "7d":
        start.setDate(start.getDate() - 6);
        return { start, end };
      case "30d":
        start.setDate(start.getDate() - 29);
        return { start, end };
      case "this_month":
        start.setDate(1);
        return { start, end };
      case "last_month":
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
          end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
        };
      default:
        return undefined;
    }
  }

  private toPipelineDescriptor(input: {
    contextType: string;
    campaignId?: string;
  }): ContextDescriptor {
    if (input.contextType === "campaign") {
      if (!input.campaignId) {
        throw new BadRequestException(
          "campaignId is required when contextType is 'campaign'",
        );
      }
      return { type: "campaign", campaignId: input.campaignId };
    }
    if (input.contextType === "organization_outside_campaign") {
      return { type: "organization_outside_campaign" };
    }
    return { type: "personal" };
  }

  /**
   * Build the workspace picker payload for a user: the personal scope plus
   * every organization they belong to, flagging the active one. Shared by
   * list_workspaces and switch_workspace so both render the same card.
   */
  private async buildWorkspacesPayload(userId: string) {
    const [memberships, activeOrgId] = await Promise.all([
      this.organizationService.listMembershipsForUser(userId),
      this.organizationService.getActiveWorkspaceOrgId(userId),
    ]);

    const workspaces = [
      {
        id: "personal",
        type: "personal" as const,
        name: "Personal",
        role: null as string | null,
        imageUrl: null as string | null,
        active: activeOrgId === null,
      },
      ...memberships.map((m) => ({
        id: m.id,
        type: "organization" as const,
        name: m.name,
        role: m.role,
        imageUrl: m.imageUrl,
        active: m.id === activeOrgId,
      })),
    ];

    return { active: activeOrgId ?? "personal", workspaces };
  }

  @McpTool({
    toolName: "list_workspaces",
    description:
      "List the workspaces this user can operate in — their Personal account " +
      "plus every organization they belong to — and which one is currently " +
      "active. Use switch_workspace to change it. Contacts, calls, sessions and " +
      "leads are all scoped to the active workspace.",
    zod: ListWorkspacesSchema,
    annotations: {
      title: "List workspaces",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listWorkspaces(ctx: OwnershipContext) {
    return text(await this.buildWorkspacesPayload(ctx.userId));
  }

  @McpTool({
    toolName: "switch_workspace",
    description:
      "Switch the active workspace. Pass workspaceId 'personal' for the user's " +
      "own account, or an organization id from list_workspaces (an exact " +
      "organization name also works). The change applies to every subsequent " +
      "action — there is no need to re-authenticate. Returns the updated " +
      "workspace list with the new active one flagged.",
    zod: SwitchWorkspaceSchema,
    annotations: {
      title: "Switch workspace",
      readOnlyHint: false,
      destructiveHint: false,
      // Switching to the already-active workspace is a no-op.
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async switchWorkspace(ctx: OwnershipContext, input: SwitchWorkspaceInput) {
    const raw = input.workspaceId.trim();

    if (raw === "" || raw.toLowerCase() === "personal") {
      await this.organizationService.setActiveWorkspace(ctx.userId, null);
      return text({
        switched: true,
        ...(await this.buildWorkspacesPayload(ctx.userId)),
      });
    }

    // Resolve against the user's memberships so we never trust an arbitrary id:
    // match by organization id first, then fall back to an exact (case-
    // insensitive) name so the model can pass what the user said.
    const memberships = await this.organizationService.listMembershipsForUser(
      ctx.userId,
    );
    const target =
      memberships.find((m) => m.id === raw) ??
      memberships.find((m) => m.name.toLowerCase() === raw.toLowerCase());

    if (!target) {
      throw new ForbiddenException(
        `No workspace matched "${raw}". Call list_workspaces to see the options.`,
      );
    }

    await this.organizationService.setActiveWorkspace(ctx.userId, target.id);
    return text({
      switched: true,
      ...(await this.buildWorkspacesPayload(ctx.userId)),
    });
  }

  @McpTool({
    toolName: "search_contacts",
    description:
      "Search the user's (or organization's) Ringee contact directory by name, phone, email, company, job title, state, website, revenue, or company size. " +
      'Pass query "*" to list ALL contacts (paginated). ' +
      "Returns a paginated list of matching contacts with their id, name, phone, email and lastCallAt. " +
      "Use this to resolve a contactId before calling start_call, create_callback, or schedule_meeting.",
    zod: SearchContactsSchema,
    annotations: {
      title: "Search contacts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async searchContacts(ctx: OwnershipContext, input: SearchContactsInput) {
    // "*" (or an empty query) means "list everything" — drop the text filter so
    // the user can page through their whole directory.
    const trimmed = input.query.trim();
    const search = trimmed === "*" || trimmed === "" ? undefined : trimmed;

    const { data, meta } = await this.contactService.listContacts(
      ctx,
      search,
      undefined,
      input.page ?? 1,
      input.limit ?? 10,
    );

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      limit: meta.limit,
      query: input.query,
      contacts: data.map((c) => ({
        id: c.id,
        name: c.name,
        firstName: c.firstName,
        lastName: c.lastName,
        phoneNumber: c.phoneNumber,
        email: c.email,
        company: c.company,
        jobTitle: c.jobTitle,
        state: c.locationRegion,
        website: c.websiteUrl,
        revenue: c.revenue,
        companySize: c.companySize,
        lastCallAt: c.lastCallAt,
      })),
    });
  }

  @McpTool({
    toolName: "get_contact",
    description:
      "Fetch the full record for a single contact, including recent calls, notes, meetings and tags. " +
      "Call this when the user asks for details or when you need history before placing a follow-up call.",
    zod: GetContactSchema,
    annotations: {
      title: "Get contact",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getContact(_ctx: OwnershipContext, input: GetContactInput) {
    const contact = await this.contactService.getContactActivities(
      input.contactId,
    );
    return text(contact);
  }

  @McpTool({
    toolName: "find_contacts_by_outcome",
    description:
      "Find the contacts whose calls reached a given set of outcomes — e.g. who " +
      "converted (sale), showed interest, or booked a meeting. Use this to learn " +
      "the real ICP from who already bought or engaged. match='any' (default) " +
      "matches a contact with ANY call in those outcomes; match='last' considers " +
      "only the most recent call. Contacts flagged doNotCall/unsubscribed are " +
      "excluded unless includeUnreachable=true. Read-only, spends no credits. " +
      "Returns ICP-relevant fields (company, jobTitle, seniority, department, " +
      "country, score, lifecycleStage) plus lastOutcome and lastCallAt.",
    zod: FindContactsByOutcomeSchema,
    annotations: {
      title: "Find contacts by outcome",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async findContactsByOutcome(
    ctx: OwnershipContext,
    input: FindContactsByOutcomeInput,
  ) {
    const match = input.match ?? "any";
    const { data, meta } = await this.contactService.findContactsByCallOutcome(
      ctx,
      {
        outcomes: input.outcomes as CallOutcome[],
        match,
        includeUnreachable: input.includeUnreachable ?? false,
        page: input.page ?? 1,
        limit: input.limit ?? 10,
      },
    );

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      limit: meta.limit,
      match,
      outcomes: input.outcomes,
      contacts: data.map((c) => {
        const lastCall = c.calls[0];
        return {
          id: c.id,
          name: c.name,
          company: c.company,
          jobTitle: c.jobTitle,
          state: c.locationRegion,
          website: c.websiteUrl,
          revenue: c.revenue,
          companySize: c.companySize,
          seniority: c.seniority,
          department: c.department,
          locationCountryCode: c.locationCountryCode,
          email: c.email,
          phoneNumber: c.phoneNumber,
          score: c.score,
          status: c.status,
          lifecycleStage: c.lifecycleStage,
          lastOutcome: lastCall?.outcome ?? null,
          lastCallAt: lastCall?.createdAt ?? c.lastCallAt,
        };
      }),
    });
  }

  @McpTool({
    toolName: "list_calls",
    description:
      "List the user's (or organization's) calls with their FULL detail: who " +
      "was called, direction, status, when it happened, how long it lasted, the " +
      "logged outcome and note, plus the call transcription and the recording " +
      "URL when available. Filter by contactId (resolve it with search_contacts " +
      "first), outcome, status, campaign (campaignId='none' isolates calls made " +
      "outside any campaign), or a created-at date range. Newest first. " +
      "Read-only and spends no credits. Cost and low-level telephony fields are " +
      "intentionally not returned.",
    zod: ListCallsSchema,
    annotations: {
      title: "List calls",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listCalls(ctx: OwnershipContext, input: ListCallsInput) {
    const { data, total, page, totalPages } =
      await this.callService.listByOwnerPaginated(ctx, {
        page: input.page ?? 1,
        limit: input.limit ?? 10,
        contactId: input.contactId,
        outcome: input.outcome as CallOutcome[] | undefined,
        status: input.status as CallStatus[] | undefined,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        ...this.callCampaignFilter(input.campaignId),
        includeTranscriptions: true,
      });

    return text({
      total,
      page,
      totalPages,
      limit: input.limit ?? 10,
      calls: data.map((call) =>
        this.serializeCallDetail(
          call as Parameters<typeof this.serializeCallDetail>[0],
        ),
      ),
    });
  }

  // @McpTool({
  //   toolName: "start_call",
  //   description:
  //     "Place an outbound call from the user's Ringee app. " +
  //     "Because calls are dialed in the user's browser/mobile via WebRTC, this tool sends a push " +
  //     "notification to the user's active devices instructing them to dial. " +
  //     "Provide either contactId (preferred) or a raw phoneNumber in E.164 format. " +
  //     "Returns whether a device was notified.",
  //   zod: StartCallSchema,
  // })
  // async startCall(ctx: OwnershipContext, input: StartCallInput) {
  //   if (!input.contactId && !input.phoneNumber) {
  //     return text({
  //       ok: false,
  //       error: "Either contactId or phoneNumber is required.",
  //     });
  //   }

  //   let phoneNumber = input.phoneNumber ?? null;
  //   let contactName: string | null = null;
  //   let contactId: string | null = input.contactId ?? null;

  //   if (input.contactId) {
  //     const contact = await this.contactService.getContactById(input.contactId);
  //     phoneNumber = contact.phoneNumber;
  //     contactName = contact.name ?? null;
  //     contactId = contact.id;
  //   }

  //   if (!phoneNumber) {
  //     return text({ ok: false, error: "Contact has no phone number." });
  //   }

  //   const devices = await this.userDeviceService.findActiveByUser(ctx.userId);

  //   if (devices.length === 0) {
  //     return text({
  //       ok: false,
  //       notified: 0,
  //       error:
  //         "User has no active devices. Ask them to open the Ringee app and try again.",
  //     });
  //   }

  //   const title = "📞 Ringee — Start call";
  //   const body = contactName
  //     ? `Tap to dial ${contactName} (${phoneNumber})`
  //     : `Tap to dial ${phoneNumber}`;

  //   const results = await Promise.allSettled(
  //     devices.map((device) =>
  //       this.notificationService.sendNotification(device.fcmToken, {
  //         title,
  //         body,
  //         data: {
  //           type: "MCP_START_CALL",
  //           phoneNumber,
  //           contactId: contactId ?? "",
  //           organizationId: ctx.organizationId ?? "",
  //           note: input.note ?? "",
  //           url: `/dashboard/call?dial=${encodeURIComponent(phoneNumber)}`,
  //         },
  //       }),
  //     ),
  //   );

  //   const notified = results.filter((r) => r.status === "fulfilled").length;

  //   return text({
  //     ok: notified > 0,
  //     notified,
  //     totalDevices: devices.length,
  //     phoneNumber,
  //     contactId,
  //   });
  // }

  @McpTool({
    toolName: "log_call_outcome",
    description:
      "Record the outcome of a past call (e.g. meeting_booked, interested, voicemail). " +
      "Use after the user describes how a call went. The call must belong to the current user/organization.",
    zod: LogCallOutcomeSchema,
    annotations: {
      title: "Log call outcome",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async logCallOutcome(ctx: OwnershipContext, input: LogCallOutcomeInput) {
    const updated = await this.meetingService.updateCallOutcome(
      ctx,
      input.callId,
      {
        outcome: input.outcome as CallOutcome,
        outcomeNote: input.outcomeNote,
      },
    );

    return text({
      ok: true,
      callId: updated.id,
      outcome: updated.outcome,
      outcomeNote: updated.outcomeNote,
    });
  }

  @McpTool({
    toolName: "create_callback",
    description:
      "Schedule a reminder to call a contact back at a specific future time. " +
      "Creates a callback task and a reminder. Returns the callback id and scheduled time.",
    zod: CreateCallbackSchema,
    annotations: {
      title: "Schedule callback",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async createCallback(ctx: OwnershipContext, input: CreateCallbackInput) {
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return text({ ok: false, error: "Invalid scheduledAt datetime." });
    }
    if (scheduledAt.getTime() <= Date.now()) {
      return text({ ok: false, error: "scheduledAt must be in the future." });
    }

    const callback = await this.callbackService.scheduleFromContact({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      contactId: input.contactId,
      callId: input.callId ?? null,
      scheduledAt,
      note: input.note,
    });

    return text({
      ok: true,
      callbackId: callback.id,
      scheduledAt: callback.scheduledAt,
      status: callback.status,
    });
  }

  @McpTool({
    toolName: "schedule_meeting",
    description:
      "Book a meeting with a contact. When the user has a Google/Microsoft calendar connected, " +
      "the event is synced and a Meet/Teams link is generated. " +
      "Provide attendeeEmail to send a calendar invite.",
    zod: ScheduleMeetingSchema,
    annotations: {
      title: "Schedule meeting",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      // May sync to an external calendar (Google/Microsoft) and email invites.
      openWorldHint: true,
    },
  })
  async scheduleMeeting(ctx: OwnershipContext, input: ScheduleMeetingInput) {
    const meeting = await this.meetingService.createMeeting(ctx, {
      contactId: input.contactId,
      callId: input.callId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      duration: input.duration,
      location: input.location,
      notes: input.notes,
      attendeeEmail: input.attendeeEmail,
      calendarProvider: input.calendarProvider,
    });

    return text({
      ok: true,
      meetingId: meeting.id,
      scheduledAt: meeting.scheduledAt,
      duration: meeting.duration,
      status: meeting.status,
    });
  }

  // ── Call Session tools ─────────────────────────────────────

  @McpTool({
    toolName: "create_call_session",
    description:
      "Create a Ringee call session: a queue of contacts/phone numbers to call. " +
      "Returns a magic-link URL the user (or a collaborator) can open without logging in " +
      "to dial each contact one by one and record outcomes. " +
      "Phone numbers must be E.164. Provide contactId when possible to enrich the UI with name/company. " +
      "campaignId and organization scope come from the authenticated session.",
    zod: CreateCallSessionSchema,
    annotations: {
      title: "Create call session",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async createCallSession(
    ctx: OwnershipContext,
    input: CreateCallSessionInput,
  ) {
    const { session, items, rawToken } =
      await this.callSessionService.createSession({
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        campaignId: input.campaignId ?? null,
        title: input.title ?? null,
        contacts: input.contacts,
        expiresInMinutes: input.expiresInMinutes ?? null,
        maxCalls: input.maxCalls ?? null,
        metadata: input.metadata ?? null,
        source: CallSessionSource.mcp,
        actorUserId: ctx.userId,
      });

    return text({
      callSessionId: session.id,
      joinUrl: this.buildJoinUrl(rawToken),
      expiresAt: session.expiresAt,
      contactsCount: items.length,
      status: session.status,
    });
  }

  @McpTool({
    toolName: "update_call_session",
    description:
      "Update an existing call session. You can change the title, swap the campaign, extend the expiration, " +
      "update metadata, or replace the contact queue (only if no calls have started yet). " +
      "Pass campaignId=null to detach the campaign.",
    zod: UpdateCallSessionSchema,
    annotations: {
      title: "Update call session",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async updateCallSession(
    ctx: OwnershipContext,
    input: UpdateCallSessionInput,
  ) {
    const updated = await this.callSessionService.updateSession(
      ctx,
      input.callSessionId,
      {
        title: input.title ?? undefined,
        campaignId:
          input.campaignId === undefined ? undefined : input.campaignId,
        expiresInMinutes: input.expiresInMinutes ?? null,
        metadata: input.metadata ?? null,
        contacts: input.contacts ?? null,
        actorSource: CallSessionActorSource.mcp,
        actorUserId: ctx.userId,
      },
    );
    return text({
      callSessionId: updated.id,
      status: updated.status,
      updated: true,
    });
  }

  @McpTool({
    toolName: "delete_call_session",
    description:
      "Revoke a call session. Past calls are preserved (no destructive delete) but the session " +
      "is marked revoked and all active magic-link tokens stop working immediately.",
    zod: DeleteCallSessionSchema,
    annotations: {
      title: "Revoke call session",
      readOnlyHint: false,
      // Irreversible: invalidates the magic-link token immediately.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async deleteCallSession(
    ctx: OwnershipContext,
    input: DeleteCallSessionInput,
  ) {
    const session = await this.callSessionService.revokeSession(
      ctx,
      input.callSessionId,
      { source: CallSessionActorSource.mcp, userId: ctx.userId },
    );
    return text({
      callSessionId: session.id,
      deleted: true,
      status: session.status,
    });
  }

  @McpTool({
    toolName: "get_call_session",
    description:
      "Fetch a call session's safe metadata (status, counts, expiration) — does NOT expose the raw magic-link token. " +
      "Use this to check progress or whether a session is still valid.",
    zod: GetCallSessionSchema,
    annotations: {
      title: "Get call session",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getCallSession(ctx: OwnershipContext, input: GetCallSessionInput) {
    const { session, items, hasActiveToken } =
      await this.callSessionService.getOwnedSessionWithItems(
        ctx,
        input.callSessionId,
      );
    return text({
      callSessionId: session.id,
      title: session.title,
      userId: session.userId,
      organizationId: session.organizationId,
      campaignId: session.campaignId,
      status: session.status,
      expiresAt: session.expiresAt,
      contactsCount: items.length,
      callsCompleted: session.callsCompleted,
      joinUrlAvailable: hasActiveToken,
    });
  }

  // ── Contact write tools ────────────────────────────────────

  @McpTool({
    toolName: "create_contact",
    description:
      "Create a new contact in the user's (or organization's) Ringee directory. " +
      "phoneNumber must be unique within the scope — the tool fails fast if a contact with the same number already exists. " +
      "Returns the new contact id and a compact representation.",
    zod: CreateContactSchema,
    annotations: {
      title: "Create contact",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async createContact(ctx: OwnershipContext, input: CreateContactInput) {
    const created = await this.contactService.createContact(ctx, {
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: input.phoneNumber,
      email: input.email,
      jobTitle: input.jobTitle,
      state: input.state,
      website: input.website,
      revenue: input.revenue,
      companySize: input.companySize,
      organization: input.organization,
      source: input.source ?? "mcp",
      note: input.note,
      tagIds: input.tagIds,
    });

    return text({
      ok: true,
      created: true,
      contact: this.serializeContact(created),
    });
  }

  @McpTool({
    toolName: "update_contact",
    description:
      "Patch fields on an existing contact. Only provided fields are changed. " +
      "Verifies the contact belongs to the current user/organization before writing. " +
      "Pass tagIds to REPLACE the contact's tag set (omit to leave tags untouched).",
    zod: UpdateContactSchema,
    annotations: {
      title: "Update contact",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async updateContact(ctx: OwnershipContext, input: UpdateContactInput) {
    const existing = await this.contactService.getContactById(input.contactId);
    this.assertContactOwnership(ctx, existing);

    const updated = await this.contactService.updateContact(input.contactId, {
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: input.phoneNumber as string,
      email: input.email,
      jobTitle: input.jobTitle,
      state: input.state,
      website: input.website,
      revenue: input.revenue,
      companySize: input.companySize,
      organization: input.organization,
      source: input.source,
      tagIds: input.tagIds,
    });

    return text({
      ok: true,
      updated: true,
      contact: this.serializeContact(updated),
    });
  }

  @McpTool({
    toolName: "delete_contact",
    description:
      "Soft-delete a contact (sets deletedAt). DESTRUCTIVE — requires strict double-confirmation: " +
      "(1) confirm must be the literal boolean true, and (2) confirmPhoneNumber must exactly match the contact's " +
      "stored phoneNumber in E.164. Always fetch the contact with get_contact first and read the phoneNumber back " +
      "to the human user for explicit approval before calling this tool. Never auto-confirm without a clear human ask.",
    zod: DeleteContactSchema,
    annotations: {
      title: "Delete contact",
      readOnlyHint: false,
      // Removes the contact from the directory (soft-delete).
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async deleteContact(ctx: OwnershipContext, input: DeleteContactInput) {
    const existing = await this.contactService.getContactById(input.contactId);
    this.assertContactOwnership(ctx, existing);

    if (input.confirm !== true) {
      return text({
        ok: false,
        deleted: false,
        error: "confirm must be the literal boolean true to delete a contact.",
      });
    }

    if (input.confirmPhoneNumber !== existing.phoneNumber) {
      return text({
        ok: false,
        deleted: false,
        error:
          "confirmPhoneNumber does not match the contact's stored phoneNumber. Re-fetch with get_contact and ask the user to confirm before retrying.",
      });
    }

    const deleted = await this.contactService.deleteContact(input.contactId);

    return text({
      ok: true,
      deleted: true,
      contactId: deleted.id,
      phoneNumber: deleted.phoneNumber,
    });
  }

  // ── Lead prospecting tools (Apollo / Prospeo) ─────────────

  @McpTool({
    toolName: "search_leads",
    description:
      "Prospect new leads via the user's connected enrichment provider (Apollo or Prospeo). " +
      "Results are NOT contacts yet — they are candidates. To turn them into Ringee contacts, " +
      "either call reveal_lead (to also unlock email/phone) or import_leads_as_contacts. " +
      "Returns a jobId you must pass to those follow-up tools. " +
      "Provider auto-selected if omitted (Apollo preferred when both are connected).",
    zod: SearchLeadsSchema,
    annotations: {
      title: "Search leads",
      // No contacts created and no credits spent — only a cached search job.
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      // Queries a third-party enrichment provider (Apollo/Prospeo).
      openWorldHint: true,
    },
  })
  async searchLeads(ctx: OwnershipContext, input: SearchLeadsInput) {
    const filters: LeadSearchFilters = {
      keywords: input.keywords,
      jobTitles: input.jobTitles,
      jobTitlesExclude: input.jobTitlesExclude,
      seniorities: input.seniorities,
      departments: input.departments,
      personCountries: input.personCountries,
      personCities: input.personCities,
      industries: input.industries,
      companyDomains: input.companyDomains,
      companyNames: input.companyNames,
      employeeCountRanges: input.employeeCountRanges,
      technologies: input.technologies,
      hasEmail: input.hasEmail,
      hasPhone: input.hasPhone,
      emailVerified: input.emailVerified,
    };

    const { job, result, cached } = await this.leadSearchService.searchLeads(
      ctx,
      filters,
      {
        provider: input.provider as EnrichmentProviderType | undefined,
        page: input.page,
        perPage: input.perPage,
      },
    );

    return text({
      ok: true,
      jobId: job.id,
      provider: job.provider,
      cached,
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      hasMore: result.hasMore,
      results: result.results.map((c) => ({
        externalId: c.externalId,
        confidence: c.confidence,
        person: {
          fullName: c.person.fullName,
          jobTitle: c.person.jobTitle,
          seniority: c.person.seniority,
          department: c.person.department,
          linkedinUrl: c.person.linkedinUrl,
          location: c.person.location,
          emailsAvailable: (c.person.emails?.length ?? 0) > 0,
          phonesAvailable: (c.person.phones?.length ?? 0) > 0,
        },
        company: c.company
          ? {
              name: c.company.name,
              domain: c.company.domain,
              industry: c.company.industry,
              employeeCount: c.company.employeeCount,
            }
          : null,
      })),
    });
  }

  @McpTool({
    toolName: "reveal_lead",
    description:
      "Reveal email (and optionally mobile phone) for a single candidate from a previous search_leads job. " +
      "Also upserts a Contact in Ringee with the revealed data so the lead is immediately callable. " +
      "Spends no Ringee credits, but consumes the enrichment provider's credits — " +
      "only call when the user has explicitly chosen this lead.",
    zod: RevealLeadSchema,
    annotations: {
      title: "Reveal lead",
      readOnlyHint: false,
      destructiveHint: false,
      // Spends credits each time — not safe to repeat blindly.
      idempotentHint: false,
      // Unlocks data via a third-party enrichment provider (Apollo/Prospeo).
      openWorldHint: true,
    },
  })
  async revealLead(ctx: OwnershipContext, input: RevealLeadInput) {
    const result = await this.leadSearchService.revealCandidate(
      ctx,
      input.jobId,
      input.externalId,
      { revealPhone: input.revealPhone ?? false },
    );

    return text({
      ok: true,
      contactId: result.contactId,
      emailRevealed: result.emailRevealed,
      phoneRevealed: result.phoneRevealed,
      person: {
        fullName: result.candidate.person.fullName,
        jobTitle: result.candidate.person.jobTitle,
        emails: result.candidate.person.emails?.map((e) => e.value) ?? [],
        phones: result.candidate.person.phones?.map((p) => p.value) ?? [],
      },
      company: result.candidate.company
        ? {
            name: result.candidate.company.name,
            domain: result.candidate.company.domain,
          }
        : null,
    });
  }

  @McpTool({
    toolName: "import_leads_as_contacts",
    description:
      "Bulk-import selected candidates from a search_leads job as Ringee contacts. " +
      "Skips candidates already present (phone-number dedup). Does NOT reveal hidden emails/phones — " +
      "use reveal_lead first if you need contact info unlocked. Returns counts and the new contact ids.",
    zod: ImportLeadsSchema,
    annotations: {
      title: "Import leads as contacts",
      readOnlyHint: false,
      destructiveHint: false,
      // Imports from the cached search snapshot; phone-number dedup makes
      // re-imports a no-op and there is no live provider call here.
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async importLeadsAsContacts(ctx: OwnershipContext, input: ImportLeadsInput) {
    const job = await this.leadSearchService.getJob(input.jobId, ctx);
    const snapshot = job.resultSnapshot as {
      results?: Array<{ externalId: string }>;
    } | null;
    const all = snapshot?.results ?? [];
    const wanted = new Set(input.externalIds);
    const candidates = all.filter((c) =>
      wanted.has((c as { externalId: string }).externalId),
    );

    if (candidates.length === 0) {
      return text({
        ok: false,
        imported: 0,
        error: "None of the provided externalIds match candidates in this job.",
      });
    }

    const result = await this.leadSearchService.importLeads(
      ctx,
      candidates as never,
      { tagIds: input.tagIds },
    );

    return text({
      ok: true,
      imported: result.importedContactIds.length,
      duplicates: result.duplicates,
      errors: result.errors,
      contactIds: result.importedContactIds,
    });
  }

  // ── Campaigns ──────────────────────────────────────────────

  @McpTool({
    toolName: "list_campaigns",
    description:
      "List the organization's outbound campaigns with their status and lead " +
      "count. Campaigns only exist in an organization workspace. Organization " +
      "admins see every campaign; members see only the ones they're assigned " +
      "to. Use this to resolve a campaignId before any other campaign tool.",
    zod: ListCampaignsSchema,
    annotations: {
      title: "List campaigns",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listCampaigns(ctx: OwnershipContext, input: ListCampaignsInput) {
    this.assertOrganization(ctx);
    const isAdmin = await this.isOrgAdmin(ctx);

    const { data, meta } = await this.campaignService.listCampaigns(ctx, {
      search: input.search,
      status: input.status,
      page: input.page ?? 1,
      limit: input.limit ?? 10,
      memberUserId: isAdmin ? undefined : ctx.userId,
    });

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      limit: meta.limit,
      campaigns: data.map((campaign) => this.serializeCampaign(campaign)),
    });
  }

  @McpTool({
    toolName: "get_campaign",
    description:
      "Fetch one campaign's full configuration: status, dialer mode, working " +
      "hours/timezone, retry limits and lead count. Read-only.",
    zod: GetCampaignSchema,
    annotations: {
      title: "Get campaign",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getCampaign(ctx: OwnershipContext, input: GetCampaignInput) {
    this.assertOrganization(ctx);
    const isAdmin = await this.isOrgAdmin(ctx);

    const campaign = await this.campaignService.getCampaignById(
      ctx,
      input.campaignId,
      { requireMembershipForUserId: isAdmin ? undefined : ctx.userId },
    );

    return text(this.serializeCampaign(campaign, { full: true }));
  }

  @McpTool({
    toolName: "update_campaign_status",
    description:
      "Move a campaign through its lifecycle. Allowed transitions: draft→active, " +
      "active→paused, active→completed, paused→active, paused→completed. " +
      "'completed' is terminal. Activating requires at least one lead, at least " +
      "one disposition and a usable outbound number — the tool reports which " +
      "requirement is missing. Organization admins only.",
    zod: UpdateCampaignStatusSchema,
    annotations: {
      title: "Update campaign status",
      readOnlyHint: false,
      destructiveHint: false,
      // Re-applying the same status is rejected as an invalid transition, but
      // the intended end state is reached exactly once either way.
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async updateCampaignStatus(
    ctx: OwnershipContext,
    input: UpdateCampaignStatusInput,
  ) {
    this.assertOrganization(ctx);
    await this.assertOrgAdmin(ctx);

    const updated = await this.campaignConfigService.transitionStatus(
      ctx,
      input.campaignId,
      input.status,
    );

    return text({
      ok: true,
      campaignId: updated.id,
      name: updated.name,
      status: updated.status,
    });
  }

  @McpTool({
    toolName: "list_campaign_leads",
    description:
      "List the leads queued in a campaign with their dialing state: status, " +
      "attempts, last/next call time and the underlying contact. Filter by " +
      "status to answer questions like 'who is still pending?' or 'which leads " +
      "are exhausted?'. Read-only.",
    zod: ListCampaignLeadsSchema,
    annotations: {
      title: "List campaign leads",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listCampaignLeads(
    ctx: OwnershipContext,
    input: ListCampaignLeadsInput,
  ) {
    this.assertOrganization(ctx);

    const { data, meta } = await this.campaignService.getLeads(
      ctx,
      input.campaignId,
      {
        page: input.page ?? 1,
        limit: input.limit ?? 10,
        status: input.status,
      },
    );

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      limit: meta.limit,
      campaignId: input.campaignId,
      status: input.status ?? null,
      leads: data.map((lead) => ({
        leadId: lead.id,
        status: lead.status,
        priority: lead.priority,
        attempts: lead.attempts,
        lastCallAt: lead.lastCallAt,
        nextCallAt: lead.nextCallAt,
        deadAt: lead.deadAt,
        assignedUserId: lead.userId,
        contact: lead.contact
          ? {
              id: lead.contact.id,
              name: lead.contact.name,
              phoneNumber: lead.contact.phoneNumber,
              email: lead.contact.email,
              company: lead.contact.company,
              jobTitle: lead.contact.jobTitle,
            }
          : null,
      })),
    });
  }

  @McpTool({
    toolName: "add_campaign_leads",
    description:
      "Add leads to a campaign. Each entry creates a Contact (or reuses the " +
      "existing one with the same phone number) and attaches it to the " +
      "campaign. Contacts already in the campaign are skipped, never " +
      "duplicated. Phone numbers must be E.164. Organization admins only. " +
      "Returns how many contacts were created, leads added and duplicates " +
      "skipped.",
    zod: AddCampaignLeadsSchema,
    annotations: {
      title: "Add campaign leads",
      readOnlyHint: false,
      destructiveHint: false,
      // Phone-number dedup makes a repeat of the same payload a no-op.
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async addCampaignLeads(ctx: OwnershipContext, input: AddCampaignLeadsInput) {
    this.assertOrganization(ctx);
    await this.assertOrgAdmin(ctx);

    const result = await this.campaignService.addLeadsManually(
      ctx,
      input.campaignId,
      input.leads,
    );

    return text({
      ok: result.success,
      campaignId: input.campaignId,
      ...result.summary,
    });
  }

  @McpTool({
    toolName: "delete_campaign_lead",
    description:
      "Remove one lead from a campaign. DESTRUCTIVE: the lead's call attempts " +
      "and campaign callbacks go with it (the Contact and its call history are " +
      "preserved). A lead that is currently locked/dialing/in a call cannot be " +
      "removed. Requires confirm=true; always read the contact's name and phone " +
      "back to the user first. Organization admins only.",
    zod: DeleteCampaignLeadSchema,
    annotations: {
      title: "Delete campaign lead",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async deleteCampaignLead(
    ctx: OwnershipContext,
    input: DeleteCampaignLeadInput,
  ) {
    this.assertOrganization(ctx);
    await this.assertOrgAdmin(ctx);

    if (input.confirm !== true) {
      return text({
        ok: false,
        deleted: false,
        error:
          "confirm must be the literal boolean true to remove a lead from a campaign.",
      });
    }

    await this.campaignService.deleteLead(ctx, input.campaignId, input.leadId);

    return text({
      ok: true,
      deleted: true,
      campaignId: input.campaignId,
      leadId: input.leadId,
    });
  }

  @McpTool({
    toolName: "get_campaign_analytics",
    description:
      "Campaign performance from its dial attempts: total attempts, connected " +
      "calls, conversions, contact/conversion rate, average handle time, leads " +
      "by status and the disposition distribution. Optionally the per-agent " +
      "breakdown and the hourly call-volume histogram. Rates are already " +
      "percentages (0-100). Read-only.",
    zod: GetCampaignAnalyticsSchema,
    annotations: {
      title: "Campaign analytics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getCampaignAnalytics(
    ctx: OwnershipContext,
    input: GetCampaignAnalyticsInput,
  ) {
    this.assertOrganization(ctx);
    const isAdmin = await this.isOrgAdmin(ctx);

    // Ownership is enforced here — the analytics service takes a bare
    // campaignId and does no tenancy check of its own.
    const campaign = await this.campaignService.getCampaignById(
      ctx,
      input.campaignId,
      { requireMembershipForUserId: isAdmin ? undefined : ctx.userId },
    );

    const start = input.startDate ? new Date(input.startDate) : undefined;
    const end = input.endDate ? new Date(input.endDate) : undefined;
    const includeAgents = input.includeAgents ?? true;
    const includeHourly = input.includeHourly ?? false;

    const [summary, dispositions, agents, hourly] = await Promise.all([
      this.outboundAnalyticsService.getCampaignSummary(campaign.id, start, end),
      this.outboundAnalyticsService.getDispositionDistribution(
        campaign.id,
        start,
        end,
      ),
      includeAgents
        ? this.outboundAnalyticsService.getAgentPerformance(
            campaign.id,
            start,
            end,
          )
        : Promise.resolve(null),
      includeHourly
        ? this.outboundAnalyticsService.getHourlyCallVolume(
            campaign.id,
            start,
            end,
          )
        : Promise.resolve(null),
    ]);

    return text({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
      window: {
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      },
      summary,
      dispositions,
      ...(agents ? { agents } : {}),
      ...(hourly ? { hourly } : {}),
    });
  }

  // ── Call analytics + day activity ──────────────────────────

  @McpTool({
    toolName: "get_call_analytics",
    description:
      "The numbers behind the Ringee dashboard overview: call volume, answer " +
      "rate, outcome counts, conversion/meeting rates, average duration, the " +
      "outcome funnel and the per-outcome breakdown. Optional blocks add the " +
      "day-by-day trend, the best time of day and the per-agent table. " +
      "campaignId='none' restricts everything to calls made OUTSIDE any " +
      "campaign (manual dialer, extension, call sessions, SDK); a campaign UUID " +
      "restricts to that campaign; omit it for all calls. Rates are already " +
      "percentages (0-100). Read-only.",
    zod: GetCallAnalyticsSchema,
    annotations: {
      title: "Call analytics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getCallAnalytics(ctx: OwnershipContext, input: GetCallAnalyticsInput) {
    const dashboardCtx = await this.buildDashboardContext(ctx, {
      scope: input.scope,
      memberUserId: input.memberUserId,
      campaignId: input.campaignId,
      outcome: input.outcome,
      dateRange: this.resolveAnalyticsRange(input),
    });

    const include = input.include ?? ["kpis", "funnel", "by-outcome"];
    const wants = (block: string) => include.includes(block as never);

    const [kpis, funnel, byOutcome, overTime, bestTimeOfDay, agents] =
      await Promise.all([
        wants("kpis")
          ? this.dashboardService.kpis(dashboardCtx)
          : Promise.resolve(null),
        wants("funnel")
          ? this.dashboardService.outcomeFunnel(dashboardCtx)
          : Promise.resolve(null),
        wants("by-outcome")
          ? this.dashboardService.callsByOutcome(dashboardCtx)
          : Promise.resolve(null),
        wants("over-time")
          ? this.dashboardService.outcomesOverTime(dashboardCtx)
          : Promise.resolve(null),
        wants("best-time-of-day")
          ? this.dashboardService.bestTimeOfDay(dashboardCtx)
          : Promise.resolve(null),
        wants("agents")
          ? this.dashboardService.agentPerformance(dashboardCtx)
          : Promise.resolve(null),
      ]);

    return text({
      scope: dashboardCtx.scope,
      campaignId: input.campaignId ?? null,
      outcome: input.outcome ?? null,
      memberUserId: dashboardCtx.filterMemberId,
      ...(kpis ? { kpis } : {}),
      ...(funnel ? { funnel } : {}),
      ...(byOutcome ? { callsByOutcome: byOutcome } : {}),
      ...(overTime ? { outcomesOverTime: overTime } : {}),
      ...(bestTimeOfDay ? { bestTimeOfDay } : {}),
      ...(agents ? { agents } : {}),
    });
  }

  @McpTool({
    toolName: "get_day_activity",
    description:
      "Everything that happened on ONE calendar day: the calls placed/received " +
      "(with outcome, duration and contact), plus the callbacks and meetings " +
      "scheduled for that day. Pass utcOffset (e.g. -04:00) so the day means " +
      "the user's day and not UTC's. Filter with campaignId (a UUID, or 'none' " +
      "for calls outside any campaign) and outcome. Read-only.",
    zod: GetDayActivitySchema,
    annotations: {
      title: "Day activity",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getDayActivity(ctx: OwnershipContext, input: GetDayActivityInput) {
    const { start, end } = this.dayBounds(input.date, input.utcOffset);
    const limit = input.limit ?? 50;
    const includeCallbacks = input.includeCallbacks ?? true;
    const includeMeetings = input.includeMeetings ?? true;

    const [calls, callbacks, meetings] = await Promise.all([
      this.callService.listByOwnerPaginated(ctx, {
        page: 1,
        limit,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        outcome: input.outcome as CallOutcome[] | undefined,
        ...this.callCampaignFilter(input.campaignId),
      }),
      includeCallbacks
        ? this.callbackService.listForOwner(
            { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
            { scheduledFrom: start, scheduledTo: end, limit: 50 },
          )
        : Promise.resolve(null),
      includeMeetings
        ? this.meetingService.listMeetings(ctx, {
            scheduledFrom: start,
            scheduledTo: end,
            limit: 50,
          })
        : Promise.resolve(null),
    ]);

    const outcomeCounts: Record<string, number> = {};
    for (const call of calls.data) {
      const key = call.outcome ?? "no_outcome";
      outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1;
    }

    return text({
      date: input.date,
      utcOffset: input.utcOffset ?? "+00:00",
      window: { start: start.toISOString(), end: end.toISOString() },
      campaignId: input.campaignId ?? null,
      calls: {
        total: calls.total,
        returned: calls.data.length,
        // Counts cover the returned page only when total exceeds it.
        outcomeCounts,
        items: calls.data.map((call) =>
          this.serializeCallDetail(
            call as Parameters<typeof this.serializeCallDetail>[0],
          ),
        ),
      },
      ...(callbacks
        ? {
            callbacks: {
              total: callbacks.meta.total,
              items: callbacks.data.map((cb) => this.serializeCallback(cb)),
            },
          }
        : {}),
      ...(meetings
        ? {
            meetings: {
              total: meetings.meta.total,
              items: meetings.data.map((m) => ({
                meetingId: m.id,
                title: m.title,
                scheduledAt: m.scheduledAt,
                duration: m.duration,
                status: m.status,
                location: m.location,
                contactId: m.contactId,
              })),
            },
          }
        : {}),
    });
  }

  // ── Callbacks ──────────────────────────────────────────────

  @McpTool({
    toolName: "list_callbacks",
    description:
      "List scheduled callbacks (call-back reminders) for the active " +
      "workspace, soonest first, with the contact and the campaign they came " +
      "from. Filter by status — 'scheduled' and 'due' are the ones still owed. " +
      "Read-only.",
    zod: ListCallbacksSchema,
    annotations: {
      title: "List callbacks",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listCallbacks(ctx: OwnershipContext, input: ListCallbacksInput) {
    const { data, meta } = await this.callbackService.listForOwner(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      {
        status: input.status as CallbackStatus | undefined,
        page: input.page ?? 1,
        limit: input.limit ?? 10,
      },
    );

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      limit: meta.limit,
      status: input.status ?? null,
      callbacks: data.map((cb) => this.serializeCallback(cb)),
    });
  }

  // ── DNC (do-not-call suppression list) ─────────────────────

  @McpTool({
    toolName: "list_dnc",
    description:
      "List the numbers on the active workspace's do-not-call list, newest " +
      "first, with the reason and how they got there (manual, disposition or " +
      "import). Pass search to check a specific number. Read-only.",
    zod: ListDncSchema,
    annotations: {
      title: "List DNC entries",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listDnc(ctx: OwnershipContext, input: ListDncInput) {
    const { data, meta } = await this.complianceService.listDNC(ctx, {
      search: input.search,
      page: input.page ?? 1,
      limit: input.limit ?? 10,
    });

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      limit: meta.limit,
      entries: data.map((entry) => ({
        id: entry.id,
        phoneNumber: entry.phoneNumber,
        reason: entry.reason,
        source: entry.source,
        addedAt: entry.createdAt,
      })),
    });
  }

  @McpTool({
    toolName: "add_to_dnc",
    description:
      "Suppress one or more phone numbers: every future dial to them from this " +
      "workspace is blocked. Numbers must be E.164. Numbers already suppressed " +
      "are reported as duplicates, not re-added. Use this whenever someone asks " +
      "not to be contacted again.",
    zod: AddToDncSchema,
    annotations: {
      title: "Add to DNC",
      readOnlyHint: false,
      destructiveHint: false,
      // Already-listed numbers are skipped, so repeats are no-ops.
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async addToDnc(ctx: OwnershipContext, input: AddToDncInput) {
    const owner = {
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
    };

    // Single number goes through addToDNC so the custom-integration webhook
    // fires; bulk uses the skipDuplicates insert like the import endpoint.
    if (input.phoneNumbers.length === 1) {
      const phoneNumber = input.phoneNumbers[0];
      const existing = await this.complianceService.findOnDNC(
        owner,
        phoneNumber,
      );
      if (existing) {
        return text({
          ok: true,
          added: 0,
          duplicates: 1,
          alreadyListed: true,
          phoneNumbers: [phoneNumber],
        });
      }
      const entry = await this.complianceService.addToDNC({
        phoneNumber,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        reason: input.reason,
        source: "mcp",
        addedByUserId: ctx.userId,
      });
      return text({
        ok: true,
        added: 1,
        duplicates: 0,
        entryId: entry.id,
        phoneNumbers: [entry.phoneNumber],
      });
    }

    const added = await this.complianceService.bulkAddToDNC(
      input.phoneNumbers.map((phoneNumber) => ({
        phoneNumber,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        reason: input.reason,
        source: "mcp",
        addedByUserId: ctx.userId,
      })),
    );

    return text({
      ok: true,
      added,
      duplicates: input.phoneNumbers.length - added,
      phoneNumbers: input.phoneNumbers,
    });
  }

  @McpTool({
    toolName: "remove_from_dnc",
    description:
      "Release a number from the do-not-call list so it can be dialed again. " +
      "DESTRUCTIVE for compliance: only do this when the user explicitly asked " +
      "for that specific number. Requires confirm=true. Confirm the number with " +
      "list_dnc first and read it back to the user.",
    zod: RemoveFromDncSchema,
    annotations: {
      title: "Remove from DNC",
      readOnlyHint: false,
      // Undoes a compliance suppression — treat with the same care as a delete.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async removeFromDnc(ctx: OwnershipContext, input: RemoveFromDncInput) {
    if (input.confirm !== true) {
      return text({
        ok: false,
        removed: 0,
        error:
          "confirm must be the literal boolean true to release a number from the DNC list.",
      });
    }

    const removed = await this.complianceService.removeFromDNCByPhone(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      input.phoneNumber,
    );

    return text({
      ok: removed > 0,
      removed,
      phoneNumber: input.phoneNumber,
      ...(removed === 0
        ? { error: "That number is not on this workspace's DNC list." }
        : {}),
    });
  }

  // ── AI pipelines (analysis results) ────────────────────────

  @McpTool({
    toolName: "list_ai_pipelines",
    description:
      "List the AI analysis pipelines available to this workspace (e.g. " +
      "follow-up recommendations, objection intelligence) with, for each one, " +
      "how many contexts have it enabled, how many actions are pending and how " +
      "many new calls are eligible since the last run. Start here, then read " +
      "one pipeline with get_ai_pipeline_results. Organization admins only.",
    zod: ListAiPipelinesSchema,
    annotations: {
      title: "List AI pipelines",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listAiPipelines(ctx: OwnershipContext) {
    await this.assertOrgAdmin(ctx);
    const pipelines =
      await this.pipelineActivationService.listPipelinesOverview(ctx);
    return text({ pipelines });
  }

  @McpTool({
    toolName: "get_ai_pipeline_results",
    description:
      "Read one AI pipeline's analysis for one context. A context is either a " +
      "single campaign, the organization's calls outside campaigns, or (for " +
      "freelancers) personal calls — each is analysed separately. Returns the " +
      "context's activation state, when it last ran, its confidence, and the " +
      "resulting recommended actions. For objection_intelligence it also " +
      "returns the ranked objections with their recommended responses and the " +
      "run-over-run trend. Read-only. Organization admins only.",
    zod: GetAiPipelineResultsSchema,
    annotations: {
      title: "AI pipeline results",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getAiPipelineResults(
    ctx: OwnershipContext,
    input: GetAiPipelineResultsInput,
  ) {
    await this.assertOrgAdmin(ctx);

    const descriptor = this.toPipelineDescriptor(input);
    // Resolves + verifies ownership of the context (campaign belongs to the
    // workspace, org context requires an org, …).
    const context = await this.pipelineActivationService.resolveDescriptor(
      ctx,
      descriptor,
    );
    const key = contextKey(context);

    const summary = await this.pipelineActivationService.getActivationSummary(
      ctx,
      input.pipeline as PipelineType,
    );
    const row = [
      ...summary.campaigns,
      summary.organization,
      summary.personal,
    ].find((r) => r?.contextKey === key);

    const actions = await this.pendingActionService.list(ctx, {
      contextKey: key,
      status: (input.status ?? "pending") as PendingActionStatus,
    });

    const insights =
      input.pipeline === "objection_intelligence"
        ? await this.objectionInsightService.listForContext(ctx, descriptor)
        : null;

    return text({
      pipeline: summary.pipeline,
      context: {
        contextKey: key,
        contextType: row?.contextType ?? descriptor.type,
        label: row?.label ?? null,
        enabled: row?.enabled ?? false,
        lastRunAt: row?.lastRunAt ?? null,
        lastConfidence: row?.lastConfidence ?? null,
        newEligibleSinceLastRun: row?.newEligibleSinceLastRun ?? 0,
        pendingActionCount: row?.pendingActionCount ?? 0,
      },
      status: input.status ?? "pending",
      actions,
      ...(insights ? { objections: insights } : {}),
    });
  }

  /**
   * Campaign shape for the MCP. The compact form is what lists need; `full`
   * adds the dialing configuration a single-campaign read should show.
   */
  private serializeCampaign(
    campaign: {
      id: string;
      name: string;
      description: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      _count?: { leads: number };
    } & Partial<{
      dialerMode: string;
      maxAttempts: number;
      timezone: string;
      workStartMin: number;
      workEndMin: number;
      workDays: number[];
      retryDelayMin: number;
      wrapUpTimeSec: number;
    }>,
    options?: { full?: boolean },
  ) {
    const base = {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      leadsCount: campaign._count?.leads ?? null,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };

    if (!options?.full) return base;

    return {
      ...base,
      dialerMode: campaign.dialerMode ?? null,
      maxAttempts: campaign.maxAttempts ?? null,
      retryDelayMin: campaign.retryDelayMin ?? null,
      wrapUpTimeSec: campaign.wrapUpTimeSec ?? null,
      workingHours: {
        timezone: campaign.timezone ?? null,
        // Stored as minutes from midnight in the campaign's timezone.
        start: this.formatMinutesOfDay(campaign.workStartMin),
        end: this.formatMinutesOfDay(campaign.workEndMin),
        // 0=Sunday … 6=Saturday.
        days: campaign.workDays ?? null,
      },
    };
  }

  /** 480 → "08:00". */
  private formatMinutesOfDay(minutes: number | undefined): string | null {
    if (minutes == null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  private serializeCallback(callback: {
    id: string;
    scheduledAt: Date;
    status: string;
    note: string | null;
    completedAt: Date | null;
    callId: string | null;
    contact?: {
      id: string;
      name: string | null;
      phoneNumber: string;
      company: string | null;
    } | null;
    campaignLead?: {
      campaignId: string;
      campaign?: { id: string; name: string } | null;
    } | null;
  }) {
    return {
      callbackId: callback.id,
      scheduledAt: callback.scheduledAt,
      status: callback.status,
      note: callback.note,
      completedAt: callback.completedAt,
      callId: callback.callId,
      contact: callback.contact
        ? {
            id: callback.contact.id,
            name: callback.contact.name,
            phoneNumber: callback.contact.phoneNumber,
            company: callback.contact.company,
          }
        : null,
      campaign: callback.campaignLead?.campaign
        ? {
            id: callback.campaignLead.campaign.id,
            name: callback.campaignLead.campaign.name,
          }
        : null,
    };
  }

  // ── AI Voice Agent tools ───────────────────────────────────

  @McpTool({
    toolName: "list_ai_voice_agents",
    description:
      "List the workspace's AI voice agents — the pre-built agents that call a " +
      "person and hold a conversation. Returns each agent's id, name, type, " +
      "status and how many calls it has placed, plus the variables its type " +
      "accepts. Resolve an agentId here before calling start_ai_voice_agent_call.",
    zod: ListAiVoiceAgentsSchema,
    annotations: {
      title: "List AI voice agents",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async listAiVoiceAgents(
    ctx: OwnershipContext,
    input: ListAiVoiceAgentsInput,
  ) {
    const [page, types] = await Promise.all([
      this.voiceAgentService.list(ctx, { limit: input.limit ?? 20 }),
      Promise.resolve(this.voiceAgentService.listTypes()),
    ]);

    return text({
      agents: page.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        voice: agent.voiceLabel,
        callCount: agent.callCount,
        createdAt: agent.createdAt,
      })),
      total: page.total,
      variablesByType: Object.fromEntries(
        types.map((type) => [
          type.type,
          type.variables.map((variable) => ({
            key: variable.key,
            required: variable.required,
            description: variable.description,
          })),
        ]),
      ),
    });
  }

  @McpTool({
    toolName: "start_ai_voice_agent_call",
    description:
      "Have an AI voice agent call a phone number and hold the conversation it " +
      "was built for — booking a meeting, or delivering a reminder and finding " +
      "out where the person stands. Returns immediately with a call id; the " +
      "conversation happens asynchronously. Read the transcript, summary, " +
      "outcome and any extracted data afterwards with get_ai_voice_agent_call. " +
      "This places a real billed phone call, so confirm with the human first.",
    zod: StartAiVoiceAgentCallSchema,
    annotations: {
      title: "Start an AI voice agent call",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  })
  async startAiVoiceAgentCall(
    ctx: OwnershipContext,
    input: StartAiVoiceAgentCallInput,
  ) {
    const started = await this.voiceAgentCallService.startCall(
      ctx,
      input.agentId,
      {
        to: input.to,
        fromNumberId: input.fromNumberId,
        variables: input.variables,
        metadata: input.metadata,
      },
    );

    return text({
      ok: true,
      callId: started.id,
      status: started.status,
      note: "The conversation runs asynchronously. Poll get_ai_voice_agent_call for the outcome.",
    });
  }

  @McpTool({
    toolName: "get_ai_voice_agent_call",
    description:
      "Read the result of an AI voice agent call: its telephony status, the " +
      "outcome the conversation reached, a summary, and any custom data the " +
      "agent was configured to extract. Poll this after " +
      "start_ai_voice_agent_call — analysis lands shortly after the call ends.",
    zod: GetAiVoiceAgentCallSchema,
    annotations: {
      title: "Get an AI voice agent call",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getAiVoiceAgentCall(
    ctx: OwnershipContext,
    input: GetAiVoiceAgentCallInput,
  ) {
    const call = await this.voiceAgentCallService.requireCall(
      ctx,
      input.callId,
    );
    return text(this.voiceAgentResultService.toResult(call));
  }
}
