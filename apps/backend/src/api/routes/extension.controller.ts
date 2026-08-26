import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
  OrgAdminOnly,
  TelephonyService,
} from "@ringee/platform";
import {
  CallbackService,
  CallerIdService,
  CallerIdRotationService,
  CallService,
  ComplianceService,
  ConcurrentCallGuardService,
  ContactService,
  CreditService,
  MeetingService,
  NumberPurchasedService,
  RecordingService,
  TranscriptionService,
} from "@ringee/services";
import type { Call } from "@ringee/database";
import {
  DialDevice,
  type DialDeviceInfo,
} from "../decorators/dial-device.decorator";

/** Stable error codes the browser extension maps to user-facing states. */
type PrepareCallErrorCode =
  | "NO_CALLER_ID"
  | "NO_CALLER_ID_FOR_COUNTRY"
  | "CALLER_ID_CAP_REACHED"
  | "INSUFFICIENT_CREDITS"
  | "DNC_BLOCKED"
  | "CONCURRENT_CALL"
  | "CONTACT_FAILED";

interface PageOriginDto {
  url?: string;
  title?: string;
  detectedName?: string;
  detectedCompany?: string;
  source?: string;
}

interface PrepareCallDto {
  destination: string;
  name?: string;
  company?: string;
  origin?: PageOriginDto;
  /** Manual override to dial even when every eligible number hit its daily cap. */
  allowOverCap?: boolean;
  /**
   * The E.164 the user explicitly chose to call from in the side-panel number
   * picker. When it is still a valid caller ID for the workspace it is used
   * as-is (bypassing rotation); otherwise it is ignored and the normal
   * resolution runs. Never trusted blindly — always validated server-side.
   */
  preferredCallerId?: string;
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Backend surface for `apps/browser-extension`. The extension owns NO business
 * rules — this endpoint validates the user (Clerk guard), resolves the active
 * workspace (ownership context), checks credits + DNC, resolves the caller ID,
 * finds/creates the contact, records the page origin, and mints ephemeral
 * WebRTC credentials. Caller ID and credentials are always resolved here, never
 * hardcoded in the extension.
 */
@Controller("extension")
export class ExtensionController {
  constructor(
    private readonly contactService: ContactService,
    private readonly complianceService: ComplianceService,
    private readonly creditService: CreditService,
    private readonly callerIdService: CallerIdService,
    private readonly callerIdRotationService: CallerIdRotationService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly telephonyService: TelephonyService,
    private readonly callbackService: CallbackService,
    private readonly meetingService: MeetingService,
    private readonly callService: CallService,
    private readonly recordingService: RecordingService,
    private readonly transcriptionService: TranscriptionService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
  ) {}

  /**
   * Identity + a friendly workspace label for the side-panel header. `isAdmin`
   * mirrors the `OrgAdminGuard` rule (no active org → unrestricted; inside an
   * org only `org:admin` qualifies). The side panel uses it to decide whether
   * to render the credit balance + "Add credits" entry point.
   */
  @Get("me")
  me(@CurrentUser() user: CurrentUserData) {
    const isAdmin = !user.activeOrgId || user.activeOrgRole === "org:admin";
    return {
      id: user.id,
      firstName: user.firstName ?? null,
      workspaceName: user.activeOrgId ? "Organization" : "Personal",
      isAdmin,
    };
  }

  /**
   * Current workspace credit balance for the side-panel pill. Admin-only via the
   * same `@OrgAdminOnly()` decorator the web app uses — org members get a 403 and
   * the panel hides the credit UI entirely (matching `isAdmin` from `/me`).
   */
  @Get("credit")
  @OrgAdminOnly()
  async credit(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const balance = await this.creditService.getBalance(ctx).catch(() => 0);
    return { balance };
  }

  /**
   * The outbound numbers this user may call from in the extension: purchased
   * DIDs + verified caller IDs, filtered to those the `chrome_extension` surface
   * (and this user) is allowed to present. Powers the side-panel "Call from"
   * picker. Available to every member — picking a number is not an admin action.
   */
  @Get("numbers")
  async numbers(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const numbers = await this.numberPurchasedService
      .listOutboundCallerIds(ctx, {
        source: "chrome_extension",
        userId: user.id,
      })
      .catch(() => []);
    return {
      numbers: numbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        isoCountry: n.isoCountry,
        kind: n.kind,
        // Purchased DIDs are inherently usable; only external caller IDs carry a
        // verification state (and `findRotatable` already returned it verified).
        verified: n.kind === "verified_caller_id" ? n.verified : true,
      })),
    };
  }

  /**
   * The side-panel "Today" home: the actionable callbacks, the calls made
   * today (with recording/transcription flags), and today's meetings — all
   * scoped to the active workspace. `from`/`to` are the browser's local
   * midnight boundaries so "today" matches the user's timezone, not the
   * server's; they default to the server day when omitted.
   */
  @Get("today")
  async today(
    @CurrentUser() user: CurrentUserData,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const ctx = createOwnershipContext(user);
    const { start, end } = this.dayRange(from, to);

    // Extension visibility rule: a freelancer (no active org) sees all of their
    // personal data; inside an organization EVERY user — admins included — sees
    // only their OWN day. So narrow to the user's id whenever an org is active.
    const memberId = user.activeOrgId ? user.id : undefined;

    const [callbacksRes, callsRes, meetingsRes] = await Promise.all([
      this.callbackService.listForOwner(ctx, { limit: 100, userId: memberId }),
      this.callService.listByOwnerPaginated(ctx, {
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        includeTranscriptions: true,
        limit: 25,
        orderBy: "createdAt",
        sortDirection: "desc",
        userId: memberId,
      }),
      this.meetingService.listMeetings(ctx, { limit: 100, userId: memberId }),
    ]);

    const PENDING = new Set(["scheduled", "due", "in_progress"]);
    const callbacks = callbacksRes.data
      .filter(
        (c) => PENDING.has(String(c.status)) && new Date(c.scheduledAt) <= end,
      )
      .slice(0, 25)
      .map((c) => ({
        id: c.id,
        contactId: c.contactId,
        contactName: c.contact?.name ?? null,
        phone: c.contact?.phoneNumber ?? null,
        scheduledAt: c.scheduledAt,
        status: c.status,
        note: c.note ?? null,
      }));

    const calls = callsRes.data.map((call) => this.toCallSummary(call));

    type MeetingRow = {
      id: string;
      title: string | null;
      scheduledAt: Date;
      location: string | null;
      status: string;
      contact?: { name: string | null; phoneNumber: string } | null;
    };
    const meetings = (meetingsRes.data as unknown as MeetingRow[])
      .filter((m) => {
        const at = new Date(m.scheduledAt);
        return String(m.status) === "scheduled" && at >= start && at <= end;
      })
      .map((m) => ({
        id: m.id,
        title: m.title ?? null,
        contactName: m.contact?.name ?? null,
        phone: m.contact?.phoneNumber ?? null,
        scheduledAt: m.scheduledAt,
        location: m.location ?? null,
        status: m.status,
      }));

    return { callbacks, calls, meetings };
  }

  /**
   * Detail for one recent call: its recording (playable URL) and final
   * transcript. `getForCall` enforces ownership inside the service, so an id
   * the user doesn't own throws before any data is returned.
   */
  @Get("calls/:id")
  async callDetail(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);

    // Ownership gate (throws if the call isn't the user's / org's) + transcript.
    const transcriptionView = await this.transcriptionService.getForCall(
      ctx,
      id,
    );
    const final = transcriptionView.recording ?? transcriptionView.realtime;

    const recordings = await this.recordingService.findRecordingsByCallId(id);
    const playable = recordings.find((r) => !!r.url) ?? null;

    return {
      callId: id,
      recording: playable
        ? {
            url: playable.url,
            durationSec: playable.durationSec ?? null,
            format: playable.format ?? null,
          }
        : null,
      transcript: final?.text
        ? {
            text: final.text,
            segments: final.segments.map((s) => ({
              text: s.text,
              speaker: s.speaker,
              startMs: s.startMs,
            })),
          }
        : null,
    };
  }

  /** Map a Call (with included contact/recordings/transcriptions) to a row. */
  private toCallSummary(call: Call) {
    const c = call as Call & {
      contact?: { id: string; name: string | null } | null;
      recordings?: Array<{ url: string | null }>;
      callTranscriptions?: Array<{ text: string | null }>;
    };
    return {
      id: c.id,
      toNumber: c.toNumber,
      fromNumber: c.fromNumber,
      direction: c.direction ?? "outbound",
      contactId: c.contactId ?? null,
      contactName: c.contact?.name ?? null,
      status: c.status,
      outcome: c.outcome ?? null,
      outcomeNote: c.outcomeNote ?? null,
      durationSeconds: c.durationSeconds ?? null,
      createdAt: c.createdAt,
      hasRecording: (c.recordings ?? []).some((r) => !!r.url),
      hasTranscription: (c.callTranscriptions ?? []).some((t) => !!t.text),
    };
  }

  /** Resolve the [start, end] of the requested day, defaulting to server today. */
  private dayRange(from?: string, to?: string): { start: Date; end: Date } {
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date();
    if (!from || Number.isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
    if (!to || Number.isNaN(end.getTime())) end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  @Post("prepare-call")
  async prepareCall(
    @Body() body: PrepareCallDto,
    @CurrentUser() user: CurrentUserData,
    @DialDevice() device: DialDeviceInfo,
  ) {
    const destination = (body?.destination ?? "").trim();
    if (!E164.test(destination)) {
      throw new HttpException(
        "A valid E.164 destination is required.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const ctx = createOwnershipContext(user);

    // 0) One call at a time per user, across every device — checked first so a
    //    refused dial never burns a caller-ID rotation pick or a contact write.
    const decision = await this.concurrentCallGuard.requestDial(user.id, {
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel,
      source: "chrome_extension",
    });
    if (!decision.allowed) {
      // ── ONE-CALL-GUARD-OFF ──  (ver caller-id-rotation.controller.ts)
      console.warn(
        `[ONE-CALL-GUARD-OFF] extension: user=${user.id} device=${device.deviceId} ` +
          `lease=${decision.holder.source}/${decision.holder.deviceId}: ${decision.message}`,
      );
      // this.fail("CONCURRENT_CALL", decision.message, HttpStatus.CONFLICT);
    }

    // 1) DNC compliance — blocking.
    const dnc = await this.complianceService.findOnDNC(ctx, destination);
    if (dnc) {
      this.fail(
        "DNC_BLOCKED",
        dnc.reason ?? "This number is on the Do-Not-Call list.",
        HttpStatus.FORBIDDEN,
      );
    }

    // 2) Credits — blocking.
    const balance = await this.creditService.getBalance(ctx).catch(() => 0);
    if (balance <= 0) {
      this.fail(
        "INSUFFICIENT_CREDITS",
        "Not enough credits to place this call.",
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // 3) Caller ID — always resolved server-side. The user's explicit "call
    //    from this number" pick wins when it is still a valid caller ID for this
    //    workspace/surface; otherwise fall back to the rotation-aware resolver
    //    (rotation ON → country-matched pool pick, OFF → the fixed caller ID).
    let callerId = await this.resolvePreferredCallerId(
      ctx,
      user.id,
      body.preferredCallerId,
    );
    if (!callerId) {
      const fixedCallerId = await this.resolveCallerId(ctx);
      const selection = await this.callerIdRotationService.selectForDial(
        ctx,
        destination,
        { phoneNumber: fixedCallerId },
        { allowOverCap: body.allowOverCap === true },
      );
      callerId = selection.phoneNumber;
      if (!callerId) {
        if (selection.reason === "all_over_cap") {
          this.fail(
            "CALLER_ID_CAP_REACHED",
            "Every number for this destination reached today's cap. Retry later or override.",
            HttpStatus.CONFLICT,
          );
        }
        if (selection.reason === "no_caller_id_for_country") {
          this.fail(
            "NO_CALLER_ID_FOR_COUNTRY",
            "No caller ID is available for this destination's country. Add a number for it.",
            HttpStatus.CONFLICT,
          );
        }
        this.fail(
          "NO_CALLER_ID",
          "No caller ID is available for this workspace.",
          HttpStatus.CONFLICT,
        );
      }
    }

    // 4) Attach the call to a contact (so it lands in the CRM timeline).
    let contact;
    try {
      contact = await this.contactService.findOrCreateByPhone(ctx, destination);
    } catch {
      this.fail(
        "CONTACT_FAILED",
        "Could not attach the call to a contact.",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 5) Record the basic page origin (best-effort, non-blocking). Only the
    //    visible, non-sensitive context the user implicitly shared.
    if (body.origin) {
      await this.recordOrigin(user.id, contact!.id, body.origin).catch(
        () => undefined,
      );
    }

    // 6) Mint ephemeral WebRTC credentials (the extension never holds static ones).
    const credential = await this.telephonyService.createTelephonyCredential(
      user.id,
    );

    return {
      callId: null,
      contact: {
        id: contact!.id,
        name: contact!.name ?? undefined,
        company: contact!.company ?? undefined,
      },
      callerId,
      credential,
      destination,
    };
  }

  /**
   * The number the user explicitly chose in the side-panel picker, but only
   * when it is still one of their allowed extension caller IDs. Returns null
   * (→ fall back to normal resolution) when unset, malformed, or no longer
   * valid — a stale pick must never silently spoof another workspace's number.
   */
  private async resolvePreferredCallerId(
    ctx: ReturnType<typeof createOwnershipContext>,
    userId: string,
    preferred?: string,
  ): Promise<string | null> {
    const wanted = (preferred ?? "").trim();
    if (!E164.test(wanted)) return null;
    // Same list the picker shows — every active number of the workspace this
    // user may present (no per-surface filter). Keeps pick + call consistent.
    const allowed = await this.numberPurchasedService
      .listOutboundCallerIds(ctx, { userId })
      .catch(() => []);
    return allowed.some((n) => n.phoneNumber === wanted) ? wanted : null;
  }

  /** Verified caller ID → purchased number → configured public line. */
  private async resolveCallerId(
    ctx: ReturnType<typeof createOwnershipContext>,
  ): Promise<string | null> {
    const callerIds = await this.callerIdService
      .getCallerIds(ctx)
      .catch(() => [] as Array<{ verified?: boolean; phoneNumber?: string }>);
    const verified = callerIds.find((c) => c.verified && c.phoneNumber);
    if (verified?.phoneNumber) return verified.phoneNumber;

    const numbers = await this.numberPurchasedService
      .findByOwner(ctx)
      .catch(() => [] as Array<{ phoneNumber?: string }>);
    if (numbers[0]?.phoneNumber) return numbers[0].phoneNumber;

    // Optional shared/free-trial line — configuration, never a literal.
    return process.env.RINGEE_PUBLIC_CALLER_ID || null;
  }

  private async recordOrigin(
    userId: string,
    contactId: string,
    origin: PageOriginDto,
  ): Promise<void> {
    const parts = [
      "📞 Call started from the Ringee browser extension",
      origin.title ? `Page: ${origin.title}` : undefined,
      origin.url ? origin.url : undefined,
      origin.detectedName ? `Detected name: ${origin.detectedName}` : undefined,
      origin.detectedCompany
        ? `Detected company: ${origin.detectedCompany}`
        : undefined,
    ].filter(Boolean);
    await this.contactService.addNoteToContact(userId, contactId, {
      content: parts.join("\n"),
    });
  }

  private fail(
    code: PrepareCallErrorCode,
    message: string,
    status: HttpStatus,
  ): never {
    throw new HttpException({ code, message, statusCode: status }, status);
  }
}
