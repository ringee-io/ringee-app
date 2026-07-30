import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import {
  CallService,
  CallSessionService,
  CallbackService,
  ContactService,
  LeadSearchService,
  MeetingService,
  OrganizationService,
  UserDeviceService,
} from "@ringee/services";
import {
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
  Contact,
  EnrichmentProviderType,
} from "@ringee/database";
import { McpTool } from "./mcp.tools";
import {
  CreateCallSessionInput,
  CreateCallSessionSchema,
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
      "first), outcome, status, or a created-at date range. Newest first. " +
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
}
