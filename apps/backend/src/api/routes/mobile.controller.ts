import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import {
  CallService,
  CallbackService,
  ContactService,
  MeetingService,
  NotificationPreferences,
  ReminderService,
  UserService,
} from "@ringee/services";
import { PrismaService, UserDeviceRepository } from "@ringee/database";
import {
  Call,
  CallOutcome,
  CallStatus,
  CallbackStatus,
  MeetingStatus,
  TranscriptionStatus,
} from "@ringee/database";

/**
 * Mobile-facing endpoints. These exist to:
 *   1. Return small, aggregated payloads tuned for mobile screens
 *      (Today, contact detail, call detail) so the app renders fast on slow
 *      networks without N round-trips.
 *   2. Normalize response shapes (always `{ data, total, page, totalPages }`)
 *      so the mobile API layer stays trivially typed.
 *   3. Hide internal fields that the web app uses for its own UI but that
 *      the mobile companion app doesn't need.
 *
 * Business logic lives in @ringee/services — this controller is a thin
 * delegation + DTO mapping layer.
 */
@Controller("mobile")
export class MobileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly callService: CallService,
    private readonly contactService: ContactService,
    private readonly callbackService: CallbackService,
    private readonly meetingService: MeetingService,
    private readonly reminderService: ReminderService,
    private readonly userDeviceRepository: UserDeviceRepository,
    private readonly userService: UserService,
  ) {}

  // ─── Today ────────────────────────────────────────────────────────────

  @Get("today")
  async today(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfTomorrow = new Date(startOfToday);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);

    const [callbacksRes, meetings, recentCalls, remindersRes] =
      await Promise.all([
        this.callbackService.listForOwner(ctx, { limit: 50 }),
        this.meetingService.listMeetings(ctx, {
          upcoming: true,
          page: 1,
          limit: 25,
        }),
        this.callService.listByOwnerPaginated(ctx, {
          limit: 50,
          page: 1,
          orderBy: "createdAt",
          sortDirection: "desc",
        }),
        this.reminderService.listUpcomingForOwner(ctx, {
          page: 1,
          limit: 25,
        }),
      ]);

    // Surface only callbacks that are due now, today, or tomorrow morning —
    // anything further out is noise on a phone screen.
    const callbacks = (callbacksRes.data || []).filter((c: any) => {
      if (
        c.status === CallbackStatus.completed ||
        c.status === CallbackStatus.cancelled
      ) {
        return false;
      }
      const due = new Date(c.scheduledAt);
      return due <= endOfTomorrow;
    });

    const missedCalls = (recentCalls.data || []).filter((c) =>
      this.isMissedCall(c),
    );

    return {
      summary: {
        callbacks: callbacks.length,
        meetings: ((meetings as any).data || []).length,
        missedCalls: missedCalls.length,
        reminders: ((remindersRes as any).data || []).length,
      },
      callbacks: callbacks.map((c: any) => this.toCallbackDto(c)),
      meetings: ((meetings as any).data || []).map((m: any) =>
        this.toMeetingDto(m),
      ),
      missedCalls: missedCalls.slice(0, 25).map((c) => this.toCallDto(c)),
      reminders: ((remindersRes as any).data || []).map((r: any) => ({
        id: r.id,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        title: r.title ?? null,
        fireAt: r.fireAt,
        status: r.status,
      })),
    };
  }

  // ─── Calls ────────────────────────────────────────────────────────────

  @Get("calls")
  async listCalls(
    @CurrentUser() user: CurrentUserData,
    @Query("page") page = "1",
    @Query("limit") limit = "25",
    @Query("missedOnly") missedOnly?: string,
  ) {
    const ctx = createOwnershipContext(user);
    const res = await this.callService.listByOwnerPaginated(ctx, {
      page: Number(page),
      limit: Number(limit),
      orderBy: "createdAt",
      sortDirection: "desc",
    });
    let data = res.data;
    if (missedOnly === "true") {
      data = data.filter((c) => this.isMissedCall(c));
    }
    const transcribed = await this.transcribedCallIds(data.map((c) => c.id));
    return {
      data: data.map((c) =>
        this.toCallDto(c, { hasTranscription: transcribed.has(c.id) }),
      ),
      total: missedOnly === "true" ? data.length : res.total,
      page: res.page,
      totalPages: res.totalPages,
    };
  }

  @Get("calls/:id")
  async getCall(@CurrentUser() user: CurrentUserData, @Param("id") id: string) {
    const ctx = createOwnershipContext(user);
    const call = await this.prisma.call.findUnique({
      where: { id },
      include: {
        contact: {
          include: {
            notes: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
        recordings: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!call) throw new NotFoundException("Call not found");
    this.assertVisible(call, ctx);
    return this.toCallDetailDto(call);
  }

  @Post("calls/:id/outcome")
  async setOutcome(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { outcome: CallOutcome; outcomeNote?: string },
  ) {
    if (!body?.outcome) {
      throw new BadRequestException("outcome is required");
    }
    const ctx = createOwnershipContext(user);
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call) throw new NotFoundException("Call not found");
    this.assertVisible(call, ctx);

    // Persist + push the CRM note immediately — the user's request is the only
    // thing that fires it for answered calls. See CallService.setOutcome.
    await this.callService.setOutcome(id, {
      outcome: body.outcome,
      outcomeNote: body.outcomeNote ?? null,
    });
    return { ok: true };
  }

  /**
   * Finalize the post-call step when the agent closes/skips WITHOUT choosing an
   * outcome. Doesn't change the call — just pushes whatever metadata it already
   * has to the CRM now (without this request the note never fires).
   */
  @Post("calls/:id/finalize")
  async finalizeCall(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call) throw new NotFoundException("Call not found");
    this.assertVisible(call, ctx);

    await this.callService.setOutcome(id, {});
    return { ok: true };
  }

  @Post("calls/:id/notes")
  async addCallNote(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { content: string },
  ) {
    const content = body?.content?.trim();
    if (!content) throw new BadRequestException("content is required");
    const ctx = createOwnershipContext(user);

    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call) throw new NotFoundException("Call not found");
    this.assertVisible(call, ctx);

    // Notes are stored against the contact (single source of truth in the
    // existing schema). If the call has no contact, append to outcomeNote.
    if (call.contactId) {
      return this.contactService.addNoteToContact(ctx.userId, call.contactId, {
        content,
      });
    }
    const stamped = `[${new Date().toISOString()}] ${content}`;
    const next = call.outcomeNote ? `${call.outcomeNote}\n${stamped}` : stamped;
    await this.prisma.call.update({
      where: { id },
      data: { outcomeNote: next },
    });
    return { ok: true };
  }

  // ─── Contacts ─────────────────────────────────────────────────────────

  @Get("contacts")
  async listContacts(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "25",
  ) {
    const ctx = createOwnershipContext(user);
    const res = await this.contactService.listContacts(
      ctx,
      search,
      undefined,
      Number(page),
      Number(limit),
    );
    return {
      data: (res as any).data.map((c: any) => this.toContactSummaryDto(c)),
      total: (res as any).meta.total,
      page: (res as any).meta.page,
      totalPages: (res as any).meta.totalPages,
    };
  }

  /**
   * Dialer autocomplete: match contacts by phone number as the user types on
   * the keypad. The query is reduced to digits so it matches regardless of how
   * the stored number is formatted (E.164, spaces, parens). Returns a minimal
   * payload plus the total match count so the dialer can show "N more results".
   */
  @Get("contacts/search")
  async searchContactsByPhone(
    @CurrentUser() user: CurrentUserData,
    @Query("q") q = "",
    @Query("limit") limit = "20",
  ) {
    const digits = (q || "").replace(/\D/g, "");
    if (digits.length < 3) return { data: [], total: 0 };
    const ctx = createOwnershipContext(user);
    const res = await this.contactService.listContacts(
      ctx,
      digits,
      undefined,
      1,
      Number(limit),
    );
    return {
      data: (res as any).data.map((c: any) => this.toContactSummaryDto(c)),
      total: (res as any).meta.total,
    };
  }

  @Get("contacts/:id")
  async getContact(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        notes: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        calls: {
          orderBy: { createdAt: "desc" },
          take: 15,
          include: { recordings: { take: 1, orderBy: { createdAt: "desc" } } },
        },
        callbacks: {
          where: {
            status: { in: [CallbackStatus.scheduled, CallbackStatus.due] },
          },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
        meetings: {
          where: {
            scheduledAt: { gte: new Date() },
            status: {
              in: [MeetingStatus.scheduled, MeetingStatus.rescheduled],
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertVisible(contact, ctx);

    return {
      ...this.toContactSummaryDto(contact),
      notes: (contact.notes || []).map((n) => ({
        id: n.id,
        contactId: n.contactId,
        content: n.content,
        createdAt: n.createdAt,
      })),
      recentCalls: (contact.calls || []).map((c: any) => this.toCallDto(c)),
      upcomingCallback: contact.callbacks?.[0]
        ? this.toCallbackDto({ ...contact.callbacks[0], contact })
        : null,
      upcomingMeeting: contact.meetings?.[0]
        ? this.toMeetingDto({ ...contact.meetings[0], contact })
        : null,
    };
  }

  @Post("contacts/:id/notes")
  async addContactNote(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { content: string },
  ) {
    const content = body?.content?.trim();
    if (!content) throw new BadRequestException("content is required");
    const ctx = createOwnershipContext(user);

    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertVisible(contact, ctx);

    return this.contactService.addNoteToContact(ctx.userId, id, { content });
  }

  // ─── Push ─────────────────────────────────────────────────────────────
  // The mobile client posts its native device token (FCM on Android, APNs on
  // iOS — both go through Firebase Admin). We persist it against the user so
  // inbound-call and reminder workers can fan out via NotificationService.

  @Post("push/register")
  async registerPush(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { token: string; platform?: "ios" | "android" },
  ) {
    if (!body?.token) throw new BadRequestException("token is required");
    const device = await this.userDeviceRepository.registerToken(
      user.id,
      body.token,
    );
    // Cap the number of active devices per user so a stale token churning
    // doesn't accumulate forever. 5 is more than enough for phone + tablet.
    await this.userDeviceRepository.revokeOldestForUser(user.id, 5);
    return { ok: true, deviceId: device.id };
  }

  @Delete("push/unregister")
  async unregisterPush(
    @CurrentUser() _user: CurrentUserData,
    @Body() body: { token: string },
  ) {
    if (!body?.token) throw new BadRequestException("token is required");
    await this.userDeviceRepository.revokeToken(body.token);
    return { ok: true };
  }

  // ─── Preferences ──────────────────────────────────────────────────────
  // Per-user toggles for which categories of notifications the mobile app
  // (and reminder worker) should deliver. The shape mirrors the toggles on
  // the Settings screen 1:1 — keep them aligned when adding new categories.

  @Get("preferences/notifications")
  async getNotificationPreferences(@CurrentUser() user: CurrentUserData) {
    return this.userService.getNotificationPreferences(user.id);
  }

  @Patch("preferences/notifications")
  async updateNotificationPreferences(
    @CurrentUser() user: CurrentUserData,
    @Body() body: Partial<NotificationPreferences>,
  ) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body must be an object");
    }
    const patch: Partial<NotificationPreferences> = {};
    for (const key of ["callbacks", "meetings", "missedCalls"] as const) {
      if (typeof body[key] === "boolean") patch[key] = body[key] as boolean;
    }
    return this.userService.setNotificationPreferences(user.id, patch);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private isMissedCall(c: Call): boolean {
    if (c.direction === "outbound" || c.direction === "outgoing") return false;
    if (c.status === CallStatus.failed) return true;
    // Inbound calls that never reached answered → missed.
    if (
      (c.direction === "inbound" || c.direction === "incoming") &&
      !c.answeredAt
    ) {
      return true;
    }
    return false;
  }

  private assertVisible(
    row: { userId: string | null; organizationId: string | null },
    ctx: { userId: string; organizationId?: string | null },
  ) {
    const visible = ctx.organizationId
      ? row.organizationId === ctx.organizationId
      : row.organizationId === null && row.userId === ctx.userId;
    if (!visible) throw new NotFoundException("Not found");
  }

  /** Set of call IDs (from the given list) that have a completed transcription. */
  private async transcribedCallIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.callTranscription.findMany({
      where: { callId: { in: ids }, status: TranscriptionStatus.completed },
      select: { callId: true },
    });
    return new Set(rows.map((r) => r.callId));
  }

  private toCallDto(c: any, opts?: { hasTranscription?: boolean }) {
    const inbound = c.direction === "inbound" || c.direction === "incoming";
    const phoneNumber = inbound ? c.fromNumber : c.toNumber;
    const recording = Array.isArray(c.recordings) ? c.recordings[0] : null;
    return {
      id: c.id,
      contactId: c.contactId ?? null,
      contactName: c.contact?.name ?? null,
      contactCompany: c.contact?.company ?? null,
      phoneNumber,
      fromNumber: c.fromNumber,
      toNumber: c.toNumber,
      direction: inbound ? "inbound" : "outbound",
      status: c.status,
      durationSeconds: c.durationSeconds ?? null,
      startedAt: c.startedAt,
      answeredAt: c.answeredAt ?? null,
      endedAt: c.endedAt ?? null,
      outcome: c.outcome ?? null,
      outcomeNote: c.outcomeNote ?? null,
      missed: this.isMissedCall(c),
      hasRecording: !!recording?.url,
      recordingUrl: recording?.url ?? null,
      hasTranscription: opts?.hasTranscription ?? false,
    };
  }

  private toCallDetailDto(c: any) {
    return {
      ...this.toCallDto(c),
      notes: (c.contact?.notes || []).map((n: any) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
      })),
    };
  }

  private toContactSummaryDto(c: any) {
    return {
      id: c.id,
      name: c.name ?? null,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      company: c.company ?? null,
      phoneNumber: c.phoneNumber,
      email: c.email ?? null,
      jobTitle: c.jobTitle ?? null,
      lastCallAt: c.lastCallAt ?? null,
      lastContactedAt: c.lastCallAt ?? null,
      lastOutcome: null,
    };
  }

  private toCallbackDto(c: any) {
    return {
      id: c.id,
      contactId: c.contactId,
      contactName: c.contact?.name ?? null,
      contactCompany: c.contact?.company ?? null,
      phoneNumber: c.contact?.phoneNumber ?? null,
      scheduledAt: c.scheduledAt,
      status: c.status,
      note: c.note ?? null,
    };
  }

  private toMeetingDto(m: any) {
    return {
      id: m.id,
      title: m.title ?? null,
      contactId: m.contactId,
      contactName: m.contact?.name ?? null,
      contactCompany: m.contact?.company ?? null,
      scheduledAt: m.scheduledAt,
      duration: m.duration ?? 30,
      location: m.location ?? null,
      notes: m.notes ?? null,
      status: m.status,
      meetingUrl: this.extractMeetingUrl(m),
    };
  }

  private extractMeetingUrl(m: any): string | null {
    // The backend stores Google Meet / Zoom links in `location` or
    // `externalEventId` depending on provider. We surface whichever looks
    // like a URL so the mobile app can deep-link into the meeting.
    const candidates = [m.location, m.externalEventId];
    for (const v of candidates) {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    }
    return null;
  }
}
