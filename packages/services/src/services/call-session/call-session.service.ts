import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CallOutcome,
  CallSession,
  CallSessionActorSource,
  CallSessionEventType,
  CallSessionItem,
  CallSessionItemStatus,
  CallSessionRepository,
  CallSessionSource,
  CallSessionStatus,
  CallStatus,
  CampaignRepository,
  ContactRepository,
  NumberPurchasedRepository,
  Prisma,
} from "@ringee/database";
import {
  NotificationService,
  OwnershipContext,
  TelephonyService,
  normalizePhoneE164,
} from "@ringee/platform";
import { CreditService } from "../credit.service";
import { CallbackService } from "../outbound/callback.service";
import { MeetingService } from "../meeting.service";
import { UserDeviceService } from "../user.device.service";
import { RecordingService } from "../recording.service";
import { CallRecordingSettingsService } from "../transcription";
import { CallRepository } from "@ringee/database";
import { CallSessionAccessTokenService } from "./call-session-access-token.service";
import { PipelineFanoutService } from "../ai-pipeline";
import { CrmCallLogService } from "../crm/crm-call-log.service";
import { CallerIdRotationService } from "../caller-id-rotation/caller-id-rotation.service";
import { UserService } from "../user.service";
import { ConcurrentCallGuardService } from "../security";
import { VoicemailDropService } from "../outbound/voicemail-drop.service";

const MIN_CREDIT_BALANCE_TO_CALL = 0.01;
const DEFAULT_EXPIRES_IN_MINUTES = 60;
const MAX_CONTACTS_PER_SESSION = 500;

export interface CreateCallSessionInput {
  userId: string;
  organizationId?: string | null;
  campaignId?: string | null;
  title?: string | null;
  contacts: Array<{
    contactId?: string | null;
    phoneNumber?: string | null;
    name?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    state?: string | null;
    website?: string | null;
    revenue?: string | null;
    companySize?: string | null;
  }>;
  expiresInMinutes?: number | null;
  maxCalls?: number | null;
  metadata?: Record<string, unknown> | null;
  source: CallSessionSource;
  actorUserId?: string | null;
}

export interface UpdateCallSessionInput {
  title?: string | null;
  /** Pass `null` to detach an existing campaign. */
  campaignId?: string | null | undefined;
  expiresInMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
  status?: CallSessionStatus | null;
  contacts?: CreateCallSessionInput["contacts"] | null;
  actorSource: CallSessionActorSource;
  actorUserId?: string | null;
}

export interface ResolvedContact {
  contactId: string | null;
  phoneNumber: string;
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  state: string | null;
  website: string | null;
  revenue: string | null;
  companySize: string | null;
}

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);

  constructor(
    private readonly repo: CallSessionRepository,
    private readonly contactRepo: ContactRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly callRepo: CallRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly creditService: CreditService,
    private readonly tokenService: CallSessionAccessTokenService,
    private readonly callbackService: CallbackService,
    private readonly meetingService: MeetingService,
    private readonly userDeviceService: UserDeviceService,
    private readonly notificationService: NotificationService,
    private readonly telephonyService: TelephonyService,
    private readonly recordingService: RecordingService,
    private readonly recordingSettingsService: CallRecordingSettingsService,
    private readonly pipelineFanout: PipelineFanoutService,
    private readonly callerIdRotationService: CallerIdRotationService,
    private readonly crmCallLog: CrmCallLogService,
    private readonly userService: UserService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
    private readonly voicemailDropService: VoicemailDropService,
  ) {}

  // ── Ownership & access ──────────────────────────────────────

  private ownershipContext(session: CallSession): OwnershipContext {
    return {
      userId: session.userId,
      organizationId: session.organizationId,
    };
  }

  private assertOwnsSession(session: CallSession, ctx: OwnershipContext): void {
    if (ctx.organizationId) {
      if (session.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Access denied");
      }
      return;
    }
    if (session.organizationId !== null || session.userId !== ctx.userId) {
      throw new ForbiddenException("Access denied");
    }
  }

  async getOwnedSessionById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<CallSession> {
    const session = await this.repo.findById(id);
    if (!session || session.deletedAt) {
      throw new NotFoundException("Call session not found");
    }
    this.assertOwnsSession(session, ctx);
    return session;
  }

  // ── Validation helpers ─────────────────────────────────────

  private async validateCampaign(
    campaignId: string,
    ctx: OwnershipContext,
  ): Promise<void> {
    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) {
      throw new BadRequestException("Campaign not found");
    }
    if (ctx.organizationId) {
      if (campaign.organizationId !== ctx.organizationId) {
        throw new BadRequestException("Campaign not accessible");
      }
    } else if (campaign.userId !== ctx.userId) {
      throw new BadRequestException("Campaign not accessible");
    }
  }

  private async resolveContacts(
    ctx: OwnershipContext,
    rows: CreateCallSessionInput["contacts"],
  ): Promise<ResolvedContact[]> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException("At least one contact is required");
    }
    if (rows.length > MAX_CONTACTS_PER_SESSION) {
      throw new BadRequestException(
        `A call session supports up to ${MAX_CONTACTS_PER_SESSION} contacts`,
      );
    }

    const resolved: ResolvedContact[] = [];
    for (const row of rows) {
      const contactId = row.contactId ?? null;
      let displayName = row.name ?? null;
      let company = row.company ?? null;
      let jobTitle = row.jobTitle ?? null;
      let state = row.state ?? null;
      let website = row.website ?? null;
      let revenue = row.revenue ?? null;
      let companySize = row.companySize ?? null;
      let phoneNumber: string | null = row.phoneNumber ?? null;

      if (contactId) {
        const contact = await this.contactRepo.findById(contactId);
        if (!contact) {
          throw new BadRequestException(`Contact ${contactId} not found`);
        }
        // Tenant scope: ensure the contact belongs to the caller's scope.
        if (ctx.organizationId) {
          if (contact.organizationId !== ctx.organizationId) {
            throw new BadRequestException(
              `Contact ${contactId} is not in your organization`,
            );
          }
        } else if (
          contact.userId !== ctx.userId ||
          contact.organizationId !== null
        ) {
          throw new BadRequestException(
            `Contact ${contactId} is not accessible`,
          );
        }
        if (!phoneNumber) phoneNumber = contact.phoneNumber;
        if (!displayName) displayName = contact.name ?? null;
        if (!company) company = contact.company ?? null;
        if (!jobTitle) jobTitle = contact.jobTitle ?? null;
        if (!state) state = contact.locationRegion ?? null;
        if (!website) website = contact.websiteUrl ?? null;
        if (!revenue) revenue = contact.revenue ?? null;
        if (!companySize) companySize = contact.companySize ?? null;
      }

      if (!phoneNumber) {
        throw new BadRequestException(
          "Each contact must have a phoneNumber or a contactId with a phone",
        );
      }

      const normalized = normalizePhoneE164(phoneNumber);
      if (!normalized) {
        throw new BadRequestException(
          `Phone number "${phoneNumber}" is not a valid E.164 number`,
        );
      }

      resolved.push({
        contactId,
        phoneNumber: normalized,
        displayName,
        company,
        jobTitle,
        state,
        website,
        revenue,
        companySize,
      });
    }
    return resolved;
  }

  private async assertHasCredits(ctx: OwnershipContext): Promise<void> {
    const balance = await this.creditService.getBalance(ctx);
    if (balance <= MIN_CREDIT_BALANCE_TO_CALL) {
      throw new BadRequestException(
        "Insufficient credits. Add credits before continuing.",
      );
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async createSession(input: CreateCallSessionInput): Promise<{
    session: CallSession;
    items: CallSessionItem[];
    rawToken: string;
  }> {
    const ctx: OwnershipContext = {
      userId: input.userId,
      organizationId: input.organizationId ?? null,
    };

    if (input.campaignId) {
      await this.validateCampaign(input.campaignId, ctx);
    }

    await this.assertHasCredits(ctx);

    const items = await this.resolveContacts(ctx, input.contacts);

    const expiresInMinutes =
      input.expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES;
    if (expiresInMinutes < 1 || expiresInMinutes > 60 * 24 * 30) {
      throw new BadRequestException(
        "expiresInMinutes must be between 1 minute and 30 days",
      );
    }
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

    const session = await this.repo.create({
      user: { connect: { id: input.userId } },
      organization: input.organizationId
        ? { connect: { id: input.organizationId } }
        : undefined,
      campaign: input.campaignId
        ? { connect: { id: input.campaignId } }
        : undefined,
      title: input.title ?? null,
      status: CallSessionStatus.ready,
      source: input.source,
      expiresAt,
      maxCalls: input.maxCalls ?? null,
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
    });

    await this.repo.createItemsBulk(
      items.map((item, idx) => ({
        callSessionId: session.id,
        contactId: item.contactId,
        phoneNumber: item.phoneNumber,
        displayName: item.displayName,
        company: item.company,
        jobTitle: item.jobTitle,
        state: item.state,
        website: item.website,
        revenue: item.revenue,
        companySize: item.companySize,
        positionIndex: idx,
        status: CallSessionItemStatus.pending,
      })),
    );

    const { rawToken } = await this.tokenService.issueToken({
      callSessionId: session.id,
      expiresAt,
      createdByUserId: input.actorUserId ?? input.userId,
      createdBySource: input.source,
    });

    await this.repo.logEvent({
      callSessionId: session.id,
      type: CallSessionEventType.session_created,
      actorUserId: input.actorUserId ?? input.userId,
      actorSource: sourceToActor(input.source),
      payload: {
        contactsCount: items.length,
        campaignId: input.campaignId ?? null,
      },
    });

    const createdItems = await this.repo.findItemsBySession(session.id);
    return { session, items: createdItems, rawToken };
  }

  async updateSession(
    ctx: OwnershipContext,
    id: string,
    input: UpdateCallSessionInput,
  ): Promise<CallSession> {
    const session = await this.getOwnedSessionById(ctx, id);

    const update: Prisma.CallSessionUpdateInput = {};
    if (input.title !== undefined) update.title = input.title ?? null;
    if (input.metadata !== undefined) {
      update.metadata = (input.metadata ?? null) as Prisma.InputJsonValue;
    }
    if (input.campaignId !== undefined) {
      if (input.campaignId === null) {
        update.campaign = { disconnect: true };
      } else {
        await this.validateCampaign(input.campaignId, ctx);
        update.campaign = { connect: { id: input.campaignId } };
      }
    }
    if (
      input.expiresInMinutes !== undefined &&
      input.expiresInMinutes !== null
    ) {
      if (input.expiresInMinutes < 1 || input.expiresInMinutes > 60 * 24 * 30) {
        throw new BadRequestException(
          "expiresInMinutes must be between 1 minute and 30 days",
        );
      }
      update.expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
    }
    if (input.status) {
      // Limit allowed transitions in MVP — we only let callers pause/resume.
      const allowed: CallSessionStatus[] = [
        CallSessionStatus.draft,
        CallSessionStatus.ready,
        CallSessionStatus.paused,
        CallSessionStatus.active,
      ];
      if (!allowed.includes(input.status)) {
        throw new BadRequestException("Status transition not allowed");
      }
      update.status = input.status;
    }

    if (input.contacts !== undefined && input.contacts !== null) {
      // Only allowed before the session has started any calls.
      if (
        session.status !== CallSessionStatus.ready &&
        session.status !== CallSessionStatus.draft
      ) {
        throw new BadRequestException(
          "Contacts can only be replaced before the session starts",
        );
      }
      if (session.callsCompleted > 0) {
        throw new BadRequestException(
          "Cannot replace contacts after calls have been placed",
        );
      }
      const items = await this.resolveContacts(ctx, input.contacts);
      await this.repo.deleteItemsBySession(session.id);
      await this.repo.createItemsBulk(
        items.map((item, idx) => ({
          callSessionId: session.id,
          contactId: item.contactId,
          phoneNumber: item.phoneNumber,
          displayName: item.displayName,
          company: item.company,
          jobTitle: item.jobTitle,
          state: item.state,
          website: item.website,
          revenue: item.revenue,
          companySize: item.companySize,
          positionIndex: idx,
          status: CallSessionItemStatus.pending,
        })),
      );
    }

    const updated = await this.repo.update(session.id, update);
    await this.repo.logEvent({
      callSessionId: session.id,
      type: CallSessionEventType.session_updated,
      actorUserId: input.actorUserId ?? ctx.userId,
      actorSource: input.actorSource,
      payload: {
        fields: Object.keys(update),
        contactsReplaced: input.contacts ? true : false,
      },
    });
    return updated;
  }

  async revokeSession(
    ctx: OwnershipContext,
    id: string,
    actor: { source: CallSessionActorSource; userId?: string | null },
  ): Promise<CallSession> {
    const session = await this.getOwnedSessionById(ctx, id);
    const next = await this.repo.softDelete(
      session.id,
      CallSessionStatus.revoked,
    );
    await this.tokenService.revokeForSession(session.id);
    await this.repo.logEvent({
      callSessionId: session.id,
      type: CallSessionEventType.session_revoked,
      actorUserId: actor.userId ?? ctx.userId,
      actorSource: actor.source,
    });
    return next;
  }

  // ── Magic-link consumption ─────────────────────────────────

  async openWithToken(
    rawToken: string,
    audit: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{
    session: CallSession;
    items: CallSessionItem[];
    creditsOk: boolean;
    creditBalance: number;
    callerIdNumber: string | null;
    rotationEnabled: boolean;
    recordAllCalls: boolean;
    telephony: {
      sipUsername: string;
      sipPassword: string;
      expiresAt: string;
      connectionId: string;
    } | null;
  }> {
    const { accessToken, session } =
      await this.tokenService.validateToken(rawToken);

    const ctx = this.ownershipContext(session);
    const items = await this.repo.findItemsBySession(session.id);
    const balance = await this.creditService.getBalance(ctx).catch(() => 0);
    const creditsOk = balance > MIN_CREDIT_BALANCE_TO_CALL;

    const callerIdNumber = await this.resolvePrimaryCallerIdNumber(ctx);
    // When the owner's workspace rotates caller IDs, the magic-link dialer shows
    // it's automatic; the actual per-call number is chosen in startCallForItem.
    const rotationEnabled = await this.callerIdRotationService
      .getSettings(ctx)
      .then((s) => s.enabled)
      .catch(() => false);

    // When the owner's workspace enforces auto-recording, the magic-link
    // dialer disables its manual record toggle (recording starts on answer).
    const recordAllCalls = await this.recordingSettingsService
      .resolve(ctx)
      .then((s) => s.recordAllCalls)
      .catch(() => false);

    // Mint an ephemeral SIP credential so the unauthenticated browser can
    // place real WebRTC calls. Telnyx caps lifetime at 1h — that matches
    // the typical session expiration. Only issue when credits look ok to
    // avoid wasting a credential the user can't actually use.
    let telephony: {
      sipUsername: string;
      sipPassword: string;
      expiresAt: string;
      connectionId: string;
    } | null = null;
    if (creditsOk) {
      try {
        const cred = await this.telephonyService.createTelephonyCredential(
          ctx.userId,
          `call-session-${session.id.slice(0, 8)}`,
        );
        telephony = {
          sipUsername: cred.sipUsername,
          sipPassword: cred.sipPassword,
          expiresAt: cred.expiresAt,
          connectionId: cred.connectionId,
        };
      } catch (err) {
        this.logger.warn(
          `Failed to mint SIP credential for session ${session.id}: ${(err as Error).message}`,
        );
      }
    }

    await this.tokenService.markUsed(accessToken.id);
    await this.repo.logEvent({
      callSessionId: session.id,
      type: CallSessionEventType.session_opened,
      actorSource: CallSessionActorSource.magic_link,
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
      payload: { mintedCredential: telephony !== null },
    });

    return {
      session,
      items,
      creditsOk,
      creditBalance: balance,
      callerIdNumber,
      rotationEnabled,
      recordAllCalls,
      telephony,
    };
  }

  /**
   * Public-facing credit lookup for the magic-link page. Returns balance and
   * an `ok` flag so the dialer can disable the Dial button preemptively.
   */
  async getCreditForToken(
    rawToken: string,
  ): Promise<{ balance: number; creditsOk: boolean }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    const balance = await this.creditService
      .getBalance(this.ownershipContext(session))
      .catch(() => 0);
    return { balance, creditsOk: balance > MIN_CREDIT_BALANCE_TO_CALL };
  }

  /**
   * Resolve the first purchased number the session owner has — used as the
   * caller-ID for outbound WebRTC calls. Returns null when none is configured,
   * which the dialer reflects in the UI.
   */
  private async resolvePrimaryCallerIdNumber(
    ctx: OwnershipContext,
  ): Promise<string | null> {
    try {
      const numbers = await this.numberRepo.findByOwner(ctx);
      if (numbers.length === 0) return null;
      const primary = numbers.find((n) =>
        n.userNumbers?.some(
          (un) => un.userId === ctx.userId && un.isPrimary && un.enabled,
        ),
      );
      const pick = primary ?? numbers[0];
      return pick?.phoneNumber ?? null;
    } catch (err) {
      this.logger.warn(
        `Failed to resolve caller-ID for user ${ctx.userId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ── Calling flow (token-authenticated) ─────────────────────

  /**
   * Authorize a magic-link dial. Validates the token, item state and credits,
   * marks the item `calling`, and returns the custom headers the browser must
   * embed in its WebRTC dial. The actual `Call` row is created later by the
   * `call.initiated` Telnyx webhook, which uses those headers to attribute
   * the call to the session owner.
   */
  async startCallForItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
    audit: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{
    itemId: string;
    phoneNumber: string;
    callerIdNumber: string | null;
    customHeaders: Array<{ name: string; value: string }>;
  }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }
    if (
      session.status === CallSessionStatus.completed ||
      session.status === CallSessionStatus.revoked ||
      session.status === CallSessionStatus.expired
    ) {
      throw new BadRequestException("Session is closed");
    }

    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }
    if (item.status !== CallSessionItemStatus.pending) {
      throw new BadRequestException(
        `Item is ${item.status} and cannot be redialed`,
      );
    }

    const active = await this.repo.findActiveCallingItem(sessionId);
    if (active && active.id !== itemId) {
      throw new BadRequestException(
        "Another call is already in progress in this session",
      );
    }

    const ctx = this.ownershipContext(session);
    const user = await this.userService.getCachedUserById(session.userId);
    if (user?.canCall === false) {
      throw new ForbiddenException(
        "Outbound calling is disabled for this user",
      );
    }

    // One call at a time per user, across every device. The guest dialing the
    // magic link is calling on the session OWNER's behalf, so their calls share
    // the owner's single slot with the owner's own dialers.
    const decision = await this.concurrentCallGuard.requestDial(
      session.userId,
      {
        deviceId: `session:${sessionId}`,
        deviceLabel: "a dialing session link",
        source: "session",
      },
    );
    if (!decision.allowed) {
      throw new ConflictException(decision.message);
    }
    // The owner's single slot is reserved from here on. Insufficient credit,
    // a caller ID that cannot be resolved, a write that fails — none of them
    // become a call, so each has to hand the slot back. Every magic link of
    // this owner shares that one slot, so a leaked reservation does not just
    // stall this session: it refuses all of the owner's other sessions too.
    try {
      const balance = await this.creditService.getBalance(ctx);
      if (balance <= MIN_CREDIT_BALANCE_TO_CALL) {
        await this.repo.logEvent({
          callSessionId: sessionId,
          type: CallSessionEventType.credits_failed,
          actorSource: CallSessionActorSource.magic_link,
          payload: { balance },
        });
        throw new BadRequestException("Insufficient credits to start the call");
      }

      await this.repo.updateItem(item.id, {
        status: CallSessionItemStatus.calling,
        startedAt: new Date(),
      });

      if (session.status === CallSessionStatus.ready) {
        await this.repo.update(session.id, {
          status: CallSessionStatus.active,
          startedAt: session.startedAt ?? new Date(),
        });
      }

      // Per-call caller-ID selection using the session owner's pool. Rotation is
      // keyed to the owner even though a magic-link guest may be the one dialing;
      // when rotation is off this returns the owner's primary number unchanged.
      const fixedCallerId = await this.resolvePrimaryCallerIdNumber(ctx);
      const selection = await this.callerIdRotationService.selectForDial(
        ctx,
        item.phoneNumber,
        { phoneNumber: fixedCallerId },
      );
      const callerIdNumber = selection.phoneNumber;
      const customHeaders: Array<{ name: string; value: string }> = [
        { name: "X-Ringee-Call-Session-Id", value: sessionId },
        { name: "X-Ringee-Call-Session-Item-Id", value: item.id },
      ];

      await this.repo.logEvent({
        callSessionId: sessionId,
        type: CallSessionEventType.call_started,
        actorSource: CallSessionActorSource.magic_link,
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
        payload: { itemId, phoneNumber: item.phoneNumber },
      });

      // We don't actively use these any more, but keep the deps so the wider
      // service surface stays available to other paths.
      void this.callRepo;
      void this.userDeviceService;
      void this.notificationService;
      void CallStatus.pending;

      return {
        itemId: item.id,
        phoneNumber: item.phoneNumber,
        callerIdNumber,
        customHeaders,
      };
    } catch (error) {
      await this.concurrentCallGuard.releasePending(
        session.userId,
        `session:${sessionId}`,
      );
      throw error;
    }
  }

  /**
   * Audit-only end-call hook. The WebRTC call hangs up client-side; this
   * exists so we can log the transition and refresh the item.
   */
  async endCallForItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
    audit: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ itemId: string; callId: string | null }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }
    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }
    await this.repo.updateItem(item.id, { endedAt: new Date() });
    await this.repo.logEvent({
      callSessionId: sessionId,
      type: CallSessionEventType.call_ended,
      actorSource: CallSessionActorSource.magic_link,
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
      payload: { itemId: item.id, callId: item.callId },
    });
    return { itemId: item.id, callId: item.callId };
  }

  /**
   * Resolve the Ringee Call linked to a CallSessionItem. The webhook may not
   * have processed yet immediately after dialing, so we briefly poll. Used
   * by recording start/stop and outcome submission paths that depend on the
   * Call row existing.
   */
  private async resolveItemCallId(
    itemId: string,
    {
      maxAttempts = 6,
      delayMs = 500,
    }: { maxAttempts?: number; delayMs?: number } = {},
  ): Promise<string | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const item = await this.repo.findItemById(itemId);
      if (item?.callId) return item.callId;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return null;
  }

  async saveOutcomeForItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
    dto: {
      outcome: CallOutcome;
      outcomeNote?: string | null;
      callbackAt?: string | null;
      meeting?: {
        scheduledAt: string;
        title?: string;
        duration?: number;
        location?: string;
        notes?: string;
        attendeeEmail?: string;
      } | null;
    },
    audit: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{
    itemId: string;
    callId: string | null;
    sessionCompleted: boolean;
    callbackId: string | null;
    meetingId: string | null;
  }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }

    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }

    const ctx = this.ownershipContext(session);

    // The webhook usually lands fast, but allow a brief catch-up for the
    // race where the user submits an outcome immediately after hangup.
    const callId = item.callId ?? (await this.resolveItemCallId(item.id));

    // Persist outcome on the underlying Call (where calls store their
    // disposition) and on the CallSessionItem for fast session render.
    if (callId) {
      await this.callRepo
        .updateOutcome(callId, dto.outcome, dto.outcomeNote ?? undefined)
        .catch((err) =>
          this.logger.warn(
            `Failed to persist outcome on Call ${callId}: ${(err as Error).message}`,
          ),
        );
      // AI Pipeline: fan out the finalized outcome (magic-link path).
      this.pipelineFanout.handleCallFinalized(callId);
      // CRM: fold outcome + notes + duration into the held call-log note and
      // push it now.
      void this.crmCallLog
        .enqueueOutcomeUpdate(callId)
        .catch((err: Error) =>
          this.logger.warn(
            `crm outcome update failed for call ${callId}: ${err.message}`,
          ),
        );
    }

    const itemUpdates: Prisma.CallSessionItemUpdateInput = {
      status: CallSessionItemStatus.completed,
      outcome: dto.outcome,
      outcomeNote: dto.outcomeNote ?? null,
      endedAt: item.endedAt ?? new Date(),
    };

    let callbackId: string | null = null;
    if (
      dto.outcome === CallOutcome.callback_scheduled &&
      dto.callbackAt &&
      item.contactId
    ) {
      const scheduledAt = new Date(dto.callbackAt);
      if (
        !Number.isNaN(scheduledAt.getTime()) &&
        scheduledAt.getTime() > Date.now()
      ) {
        try {
          const cb = await this.callbackService.scheduleFromContact({
            userId: ctx.userId,
            organizationId: ctx.organizationId ?? null,
            contactId: item.contactId,
            callId,
            scheduledAt,
            note: dto.outcomeNote ?? undefined,
          });
          callbackId = cb.id;
          itemUpdates.callbackAt = scheduledAt;
        } catch (err) {
          this.logger.warn(
            `Failed to schedule callback for session ${sessionId} item ${item.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    let meetingId: string | null = null;
    if (
      dto.outcome === CallOutcome.meeting_booked &&
      dto.meeting?.scheduledAt &&
      item.contactId
    ) {
      try {
        const meeting = await this.meetingService.createMeeting(ctx, {
          contactId: item.contactId,
          callId: callId ?? undefined,
          title: dto.meeting.title,
          scheduledAt: dto.meeting.scheduledAt,
          duration: dto.meeting.duration,
          location: dto.meeting.location,
          notes: dto.meeting.notes,
          attendeeEmail: dto.meeting.attendeeEmail,
        });
        meetingId = meeting.id;
        itemUpdates.meetingId = meeting.id;
      } catch (err) {
        this.logger.warn(
          `Failed to create meeting for session ${sessionId} item ${item.id}: ${(err as Error).message}`,
        );
      }
    }

    await this.repo.updateItem(item.id, itemUpdates);
    const updatedSession = await this.repo.incrementCallsCompleted(sessionId);

    await this.repo.logEvent({
      callSessionId: sessionId,
      type: CallSessionEventType.outcome_saved,
      actorSource: CallSessionActorSource.magic_link,
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
      payload: {
        itemId: item.id,
        callId,
        outcome: dto.outcome,
        callbackId,
        meetingId,
      },
    });

    const sessionCompleted =
      await this.maybeMarkSessionCompleted(updatedSession);

    return {
      itemId: item.id,
      callId,
      sessionCompleted,
      callbackId,
      meetingId,
    };
  }

  // ── Recording (token-authenticated) ────────────────────────

  async startRecordingForItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
  ): Promise<{ recordingId: string; callId: string }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }
    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }

    const callId = item.callId ?? (await this.resolveItemCallId(item.id));
    if (!callId) {
      throw new NotFoundException(
        "Call not yet linked to this item — try again in a moment",
      );
    }
    const call = await this.callRepo.findById(callId);
    if (!call || !call.callControlId) {
      throw new NotFoundException("Call control id unavailable");
    }

    const recording = await this.recordingService.createRecording({
      callId,
    });
    await this.telephonyService.startRecording(call.callControlId);
    return { recordingId: recording.id, callId };
  }

  async stopRecordingForItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
    recordingId: string,
  ): Promise<{ recordingId: string }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }
    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }
    if (!item.callId) {
      throw new NotFoundException("Call not linked to this item");
    }
    const call = await this.callRepo.findById(item.callId);
    if (!call?.callControlId) {
      throw new NotFoundException("Call control id unavailable");
    }
    await this.telephonyService.stopRecording(call.callControlId);
    await this.recordingService
      .updateRecording(recordingId, { status: "processing" })
      .catch(() => undefined);
    return { recordingId };
  }

  // ── Voicemail drops (magic-link agents) ─────────────────────
  //
  // The session agent is not a Clerk user, so every voicemail action is
  // re-authorized from the magic-link token and then executed under the
  // session owner's ownership context. That keeps the bucket, the credit
  // spend and the caller ID attributed to the workspace that opened the
  // session, never to the anonymous agent.

  async listVoicemailAssetsForToken(rawToken: string, sessionId: string) {
    const session = await this.requireSessionForToken(rawToken, sessionId);
    if (!session.organizationId) return [];
    return this.voicemailDropService.listAssets(session.organizationId);
  }

  async uploadVoicemailAudioForToken(
    rawToken: string,
    sessionId: string,
    file: { buffer: Buffer; contentType: string; filename?: string },
  ) {
    await this.requireSessionForToken(rawToken, sessionId);
    return this.voicemailDropService.uploadAudio(file);
  }

  async createVoicemailAssetForToken(
    rawToken: string,
    sessionId: string,
    data: {
      name?: string | null;
      description?: string | null;
      fileUrl: string;
      durationSec?: number;
    },
  ) {
    const session = await this.requireSessionForToken(rawToken, sessionId);
    return this.voicemailDropService.createAsset(
      this.ownershipContext(session),
      data,
    );
  }

  /**
   * Send a voicemail to the item's contact after the call has ended. The
   * destination comes from the stored item, never from the request, so a
   * leaked token cannot be used to dial arbitrary numbers.
   */
  async sendVoicemailForItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
    assetId: string,
  ) {
    const session = await this.requireSessionForToken(rawToken, sessionId);
    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }
    if (!item.phoneNumber) {
      throw new BadRequestException("Item has no phone number");
    }

    return this.voicemailDropService.sendVoicemail(
      this.ownershipContext(session),
      {
        assetId,
        toNumber: item.phoneNumber,
        contactId: item.contactId,
        callId: item.callId,
        source: "session",
      },
    );
  }

  private async requireSessionForToken(
    rawToken: string,
    sessionId: string,
  ): Promise<CallSession> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }
    return session;
  }

  async skipItem(
    rawToken: string,
    sessionId: string,
    itemId: string,
    reason: string | null,
    audit: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ itemId: string; sessionCompleted: boolean }> {
    const { session } = await this.tokenService.validateToken(rawToken);
    if (session.id !== sessionId) {
      throw new ForbiddenException("Session mismatch");
    }
    const item = await this.repo.findItemById(itemId);
    if (!item || item.callSessionId !== sessionId) {
      throw new NotFoundException("Item not found in session");
    }
    if (
      item.status === CallSessionItemStatus.calling ||
      item.status === CallSessionItemStatus.completed ||
      item.status === CallSessionItemStatus.skipped
    ) {
      throw new BadRequestException(
        `Item cannot be skipped from ${item.status}`,
      );
    }

    await this.repo.updateItem(item.id, {
      status: CallSessionItemStatus.skipped,
      outcomeNote: reason ?? undefined,
      endedAt: new Date(),
    });

    await this.repo.logEvent({
      callSessionId: sessionId,
      type: CallSessionEventType.item_skipped,
      actorSource: CallSessionActorSource.magic_link,
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
      payload: { itemId: item.id, reason },
    });

    const sessionCompleted = await this.maybeMarkSessionCompleted(session);
    return { itemId: item.id, sessionCompleted };
  }

  // ── Helpers ────────────────────────────────────────────────

  private async maybeMarkSessionCompleted(
    session: CallSession,
  ): Promise<boolean> {
    const remaining = await this.repo.countItemsBySessionStatus(
      session.id,
      CallSessionItemStatus.pending,
    );
    if (remaining > 0) return false;
    const calling = await this.repo.countItemsBySessionStatus(
      session.id,
      CallSessionItemStatus.calling,
    );
    if (calling > 0) return false;
    if (session.status === CallSessionStatus.completed) return true;
    await this.repo.update(session.id, {
      status: CallSessionStatus.completed,
      completedAt: new Date(),
    });
    return true;
  }

  // ── Reads ──────────────────────────────────────────────────

  async listForOwner(
    ctx: OwnershipContext,
    options?: { page?: number; limit?: number; status?: CallSessionStatus },
  ) {
    return this.repo.listForOwner(ctx, options);
  }

  async getOwnedSessionWithItems(ctx: OwnershipContext, id: string) {
    const session = await this.getOwnedSessionById(ctx, id);
    const items = await this.repo.findItemsBySession(session.id);
    const hasActiveToken = await this.repo.hasActiveAccessToken(session.id);
    return { session, items, hasActiveToken };
  }
}

function sourceToActor(source: CallSessionSource): CallSessionActorSource {
  switch (source) {
    case CallSessionSource.mcp:
      return CallSessionActorSource.mcp;
    case CallSessionSource.dashboard:
      return CallSessionActorSource.dashboard;
    case CallSessionSource.api:
    default:
      return CallSessionActorSource.api;
  }
}
