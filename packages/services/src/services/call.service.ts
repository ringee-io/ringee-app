import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  CallRepository,
  CallSessionRepository,
  CallStatus,
  CallOutcome,
  Call,
  RecordingRepository,
} from "@ringee/database";
import {
  NotificationService,
  OrchestratorService,
  OwnershipContext,
  RedisService,
  TelephonyService,
  verifyCallCorrelation,
} from "@ringee/platform";
import type {
  TelephonyEvent,
  CallTranscriptionPayload,
  CallRecordingErrorPayload,
  CallRecordingSavedPayload,
  CallMachineDetectionPayload,
  CallHangupPayload,
  CallCostPayload,
} from "@ringee/platform";
import { CallTranscriptionService } from "./call.transcription.service";
import { TranscriptionService } from "./transcription/transcription.service";
import { CallRecordingSettingsService } from "./transcription/call-recording-settings.service";
import { UserService } from "./user.service";
import { CreditService } from "./credit.service";
import { ContactService } from "./contact.service";
import { NumberPurchasedService } from "./number.purchased.service";
import { CallerIdRotationService } from "./caller-id-rotation/caller-id-rotation.service";
import { UserDeviceService } from "./user.device.service";
import { OrganizationService } from "./organization.service";
import { CallAttemptService } from "./outbound/call-attempt.service";
import { VoicemailDropService } from "./outbound/voicemail-drop.service";
import { CrmCallLogService } from "./crm/crm-call-log.service";
import { InboxTimelineService } from "./inbox/inbox.timeline.service";
import { CustomIntegrationOutboundService } from "./custom-integrations/custom-integration-outbound.service";
import {
  buildCallEventData,
  callOwnershipFromCall,
  pickCallTerminalEvent,
} from "./custom-integrations/custom-integration-event-builders";
import { PipelineFanoutService } from "./ai-pipeline";
import { ConcurrentCallGuardService } from "./security";
import { calculateCallCharge } from "./call-cost.util";
import { LOW_BALANCE_MAX_CALL_SECONDS, LOW_BALANCE_USD } from "./credit-policy";

/** Connected calls shorter than this (seconds) count as "very short" for
 * caller-ID reputation scoring (spec: <5s). */
const SHORT_CALL_SECONDS = 5;

/**
 * How long a lifecycle event that arrived before its `Call` row is kept so the
 * `call.initiated` handler can replay it. Generous: the only cost of an
 * unclaimed key is a few hundred bytes in Redis.
 */
const ORPHAN_EVENT_TTL_SECONDS = 15 * 60;

/** Redis key holding events that landed before the call they belong to. */
function orphanEventsKey(callControlId: string): string {
  return `ringee:orphan-call-events:v1:${callControlId}`;
}

@Injectable()
export class CallService implements OnModuleDestroy {
  private readonly logger = new Logger(CallService.name);
  private readonly lowBalanceHangupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly callRepository: CallRepository,
    private readonly transcriptionService: CallTranscriptionService,
    private readonly userService: UserService,
    private readonly creditService: CreditService,
    private readonly contactService: ContactService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly callerIdRotationService: CallerIdRotationService,
    private readonly notificationService: NotificationService,
    private readonly userDeviceService: UserDeviceService,
    private readonly orchestratorService: OrchestratorService,
    private readonly organizationService: OrganizationService,
    private readonly callAttemptService: CallAttemptService,
    private readonly crmCallLogService: CrmCallLogService,
    private readonly inboxTimelineService: InboxTimelineService,
    private readonly recordingRepository: RecordingRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
    private readonly callSessionRepository: CallSessionRepository,
    private readonly telephonyService: TelephonyService,
    private readonly recordingSettingsService: CallRecordingSettingsService,
    private readonly transcriptionOrchestrator: TranscriptionService,
    private readonly pipelineFanout: PipelineFanoutService,
    private readonly concurrentCallGuard: ConcurrentCallGuardService,
    private readonly redis: RedisService,
    private readonly voicemailDropService: VoicemailDropService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.lowBalanceHangupTimers.values()) {
      clearTimeout(timer);
    }
    this.lowBalanceHangupTimers.clear();
  }

  /**
   * Persist a post-call disposition and IMMEDIATELY push it to the CRM — the
   * user's request is the ONLY thing that fires the note for answered dialer
   * calls (the hangup webhook merely prepares the sync snapshot).
   *
   * Centralized here on purpose: every disposition entry point (web dialer,
   * mobile, extension) must trigger the sync, or the note never reaches the
   * CRM at all.
   *
   * `outcome` is optional — a bare "close"/"skip" with no outcome still
   * finalizes the note with whatever metadata the call already carries.
   */
  async setOutcome(
    callId: string,
    opts: { outcome?: CallOutcome | null; outcomeNote?: string | null } = {},
  ): Promise<Call | null> {
    const call =
      opts.outcome != null
        ? await this.callRepository.updateOutcome(
            callId,
            opts.outcome,
            opts.outcomeNote ?? undefined,
          )
        : await this.callRepository.findById(callId);

    // AI Pipeline: mobile and any other callers that centralize outcome writes
    // here must feed the same idempotent fan-out as the web/meeting flow.
    if (call?.outcome) {
      this.pipelineFanout.handleCallFinalized(call.id);
    }

    // Best-effort: fold the finalized disposition into the held call-log note
    // and push it now. CRM problems must never fail the disposition.
    void this.crmCallLogService
      .enqueueOutcomeUpdate(callId)
      .catch((err: Error) =>
        this.logger.warn(
          `crm outcome update failed for call ${callId}: ${err.message}`,
        ),
      );

    return call;
  }

  /**
   * Apply the call owner's recording/transcription settings when a call is
   * answered. Both actions are best-effort: a transcription/recording failure
   * must never break webhook processing of the live call.
   *
   * Resolution follows the context rule (org settings when the call has an
   * organizationId, otherwise the user's settings).
   */
  private async applyAnswerAutomation(call: Call): Promise<void> {
    if (!call.callControlId) return;
    const ctx: OwnershipContext = {
      userId: call.userId!,
      organizationId: call.organizationId,
    };

    let settings;
    try {
      settings = await this.recordingSettingsService.resolve(ctx);
    } catch (err) {
      this.logger.warn(
        `Could not resolve recording settings for call ${call.id}: ${(err as Error).message}`,
      );
      return;
    }

    if (settings.recordAllCalls) {
      await this.telephonyService
        .startRecording(call.callControlId)
        .then(() =>
          this.logger.log(`⏺️ Auto-recording started for call ${call.id}`),
        )
        .catch((err) =>
          this.logger.error(
            `Auto-recording failed for call ${call.id}: ${err.message}`,
          ),
        );
    }

    if (settings.transcribeRealtime) {
      // Realtime transcription is independent of recording.
      await this.transcriptionOrchestrator
        .startRealtimeForCall(call)
        .catch((err: Error) =>
          this.logger.error(
            `Auto realtime transcription failed for call ${call.id}: ${err.message}`,
          ),
        );
    }
  }

  /**
   * On hangup, stop any live transcription. The media bridge finalizes the
   * realtime transcript status when Telnyx closes the stream. Automatic
   * transcription from the recording is triggered later, in the worker, once
   * the recordingUrl becomes available (see worker.processCallRecording).
   */
  private async applyHangupAutomation(call: Call): Promise<void> {
    await this.transcriptionOrchestrator
      .stopRealtimeForCall(call)
      .catch((err: Error) =>
        this.logger.warn(
          `stopRealtime on hangup failed for call ${call.id}: ${err.message}`,
        ),
      );
  }

  /**
   * Park a lifecycle event whose `Call` row does not exist yet.
   *
   * Telnyx does not guarantee webhook ordering, and `call.initiated` is our
   * slowest handler (ownership, credit, concurrency, contact lookup) — so on a
   * fast-failing dial `call.hangup` regularly wins the race. Dropping it left
   * the row the initiated handler was about to write stuck in `ringing`
   * forever, which permanently occupied the user's single call slot and made
   * every later dial fail with "you already have a call in progress".
   */
  private async parkOrphanCallEvent(
    callControlId: string,
    event: TelephonyEvent,
  ): Promise<void> {
    this.logger.warn(
      `⏳ ${event.type} arrived before its call row (${callControlId}) — parking it for replay`,
    );
    const parked = await this.readParkedCallEvents(callControlId);
    await this.redis
      .set(
        orphanEventsKey(callControlId),
        JSON.stringify([...parked, event]),
        ORPHAN_EVENT_TTL_SECONDS * 1000,
      )
      .catch((error: Error) =>
        this.logger.error(
          `Could not park ${event.type} for ${callControlId}: ${error.message}`,
        ),
      );
  }

  /**
   * Replay whatever landed early, in arrival order, now that the row exists.
   * Called at the end of every `call.initiated` path that persisted a call.
   */
  private async replayParkedCallEvents(callControlId: string): Promise<void> {
    const parked = await this.readParkedCallEvents(callControlId);
    if (parked.length === 0) return;

    await this.redis.del(orphanEventsKey(callControlId)).catch(() => undefined);

    for (const event of parked) {
      this.logger.warn(
        `↩️ Replaying out-of-order ${event.type} for ${callControlId}`,
      );
      await this.handleTelephonyEvent(event).catch((error: Error) =>
        this.logger.error(
          `Replay of ${event.type} for ${callControlId} failed: ${error.message}`,
          error.stack,
        ),
      );
    }
  }

  private async readParkedCallEvents(
    callControlId: string,
  ): Promise<TelephonyEvent[]> {
    const raw = await this.redis
      .get<TelephonyEvent[] | string>(orphanEventsKey(callControlId))
      .catch(() => undefined);
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [];
      // `occurredAt` is a Date on the way in and a string on the way back out
      // of Redis; revive it so a replayed event is shaped like a fresh one.
      return (parsed as TelephonyEvent[]).map((event) => ({
        ...event,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Authoritative half of the one-call-at-a-time rule.
   *
   * Every dial surface refuses a second concurrent call up front, but a client
   * can always talk to Telnyx directly and skip that check — the WebRTC leg is
   * placed by the browser, not by us. This runs on `call.initiated` for every
   * outbound leg and hangs up the newcomer when the user is already on a call,
   * so the rule holds no matter how the call was started.
   *
   * Returns false when the event must stop being processed.
   */
  private async ensureNoConcurrentCall(
    ctx: OwnershipContext,
    callControlId: string,
  ): Promise<boolean> {
    const busy = await this.concurrentCallGuard.findOccupyingCall(
      ctx.userId,
      callControlId,
    );
    if (!busy) {
      // Bind the lease to this leg so it survives for the call's lifetime and
      // so a dial that never went through pre-flight still holds the slot.
      await this.concurrentCallGuard.bindToCall(ctx.userId, callControlId);
      return true;
    }

    this.logger.warn(
      `⛔ Hanging up call ${callControlId}: user ${ctx.userId} is already on call ` +
        `${busy.id} (${busy.callControlId}, source=${busy.source ?? "unknown"})`,
    );
    await this.telephonyService
      .hangupCall(callControlId)
      .catch((err) =>
        this.logger.error(
          `Failed to hang up concurrent call ${callControlId}: ${err.message}`,
          err.stack,
        ),
      );
    return false;
  }

  /**
   * Decide whether `ctx`'s owner may place/continue a call.
   * Owners flagged with an active free-call trial are always allowed.
   * Otherwise a positive credit balance (user or organization, resolved from
   * the context) is required. If neither holds, the live call is hung up and
   * `false` is returned so the caller stops processing the event.
   */
  private async ensureCallAffordable(
    ctx: OwnershipContext,
    callControlId: string,
  ): Promise<boolean> {
    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.canCall === false) {
      this.logger.warn(
        `⛔ Hanging up call ${callControlId}: outbound calling disabled ` +
          `(userId=${ctx.userId})`,
      );
      await this.telephonyService
        .hangupCall(callControlId)
        .catch((err) =>
          this.logger.error(
            `Failed to hang up disabled call ${callControlId}: ${err.message}`,
            err.stack,
          ),
        );
      return false;
    }
    if (user?.freeCallTrial) {
      return true;
    }

    const balance = await this.creditService.getBalance(ctx);
    if (balance > 0) {
      return true;
    }

    this.logger.warn(
      `⛔ Hanging up call ${callControlId}: no credit ` +
        `(userId=${ctx.userId} orgId=${ctx.organizationId})`,
    );
    await this.telephonyService
      .hangupCall(callControlId)
      .catch((err) =>
        this.logger.error(
          `Failed to hang up call ${callControlId}: ${err.message}`,
          err.stack,
        ),
      );
    return false;
  }

  /**
   * Adopt a pre-created SDK `Call` (source="sdk", status=pending) when the
   * Telnyx `call.initiated` webhook carries a valid signed correlation token.
   * Returns true when the token was handled (adopted OR hung up for credit),
   * false when it should be ignored (bad signature / not adoptable).
   */
  private async adoptSdkCall(
    correlationToken: string,
    callControlId: string,
    event: TelephonyEvent,
  ): Promise<boolean> {
    const callId = verifyCallCorrelation(correlationToken);
    if (!callId) return false;

    const existing = await this.callRepository.findById(callId);
    if (
      !existing ||
      existing.source !== "sdk" ||
      existing.status !== CallStatus.pending ||
      existing.callControlId ||
      !existing.userId
    ) {
      return false;
    }

    const ctx: OwnershipContext = {
      userId: existing.userId,
      organizationId: existing.organizationId,
    };

    // Same credit/enablement gate as the web path (hangs up if unaffordable).
    if (!(await this.ensureCallAffordable(ctx, callControlId))) {
      return true;
    }

    // Same one-call-at-a-time rule as the web path. The row being adopted is
    // still `pending`, so it never counts as the user's occupying call.
    if (!(await this.ensureNoConcurrentCall(ctx, callControlId))) {
      return true;
    }

    // Audit which owned number presented as caller ID + count daily usage.
    const presentedNumberId = await this.callerIdRotationService
      .registerOutboundCall(ctx, event.from ?? "")
      .catch(() => null);

    const adopted = await this.callRepository.attachTelephony(existing.id, {
      callControlId,
      callSessionId: event.callSessionId ?? undefined,
      callLegId: event.callLegId ?? undefined,
      connectionId: apiConfiguration.TELNYX_CONNECTION_ID,
      startedAt: event.startedAt ?? undefined,
      status: CallStatus.ringing,
      callerIdId: presentedNumberId ?? existing.callerIdId ?? undefined,
    });

    if (adopted) {
      void this.inboxTimelineService
        .ensureThreadForCall(adopted)
        .catch((err) =>
          this.logger.error(
            `Inbox ensureThreadForCall failed (sdk, call=${adopted.id}): ${err.message}`,
            err.stack,
          ),
        );
    }

    this.logger.log(`📞 SDK call ${callControlId} adopted → ${existing.id}`);
    return true;
  }

  private clearLowBalanceHangup(callControlId: string): void {
    const timer = this.lowBalanceHangupTimers.get(callControlId);
    if (!timer) return;
    clearTimeout(timer);
    this.lowBalanceHangupTimers.delete(callControlId);
  }

  private scheduleLowBalanceHangup(
    call: Call,
    balance: number,
    maxSeconds: number,
  ): void {
    if (!call.callControlId) return;

    this.clearLowBalanceHangup(call.callControlId);

    const timer = setTimeout(() => {
      this.telephonyService
        .hangupCall(call.callControlId!)
        .then(() =>
          this.logger.warn(
            `⏳ Low-balance duration limit reached (${maxSeconds}s). Hanging up call ${call.callControlId}`,
          ),
        )
        .catch((err) =>
          this.logger.error(
            `Failed low-balance hangup for call ${call.callControlId}: ${err.message}`,
            err.stack,
          ),
        )
        .finally(() => this.lowBalanceHangupTimers.delete(call.callControlId!));
    }, maxSeconds * 1000);

    timer.unref?.();
    this.lowBalanceHangupTimers.set(call.callControlId, timer);

    this.logger.warn(
      `Low-balance policy armed for call ${call.callControlId}: balance=$${balance.toFixed(2)}; maxDuration=${maxSeconds}s`,
    );
  }

  /**
   * Re-check balance once the call is answered:
   * - balance <= 0: hang up immediately
   * - balance <= $1: cap call duration to 5 minutes
   */
  private async enforceAnsweredCreditPolicy(call: Call): Promise<boolean> {
    if (!call.callControlId || !call.userId) return true;

    const direction = (call.direction || "").toLowerCase();
    if (!["outbound", "outgoing"].includes(direction)) {
      return true;
    }

    const ctx: OwnershipContext = {
      userId: call.userId,
      organizationId: call.organizationId,
    };

    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.canCall === false) {
      this.logger.warn(
        `⛔ Hanging up answered call ${call.callControlId}: outbound calling disabled ` +
          `(userId=${ctx.userId})`,
      );
      await this.telephonyService
        .hangupCall(call.callControlId)
        .catch((err) =>
          this.logger.error(
            `Failed to hang up disabled call ${call.callControlId}: ${err.message}`,
            err.stack,
          ),
        );
      return false;
    }
    if (user?.freeCallTrial) {
      return true;
    }

    const balance = await this.creditService.getBalance(ctx);
    if (balance <= 0) {
      this.logger.warn(
        `⛔ Hanging up answered call ${call.callControlId}: no credit ` +
          `(userId=${ctx.userId} orgId=${ctx.organizationId})`,
      );
      await this.telephonyService
        .hangupCall(call.callControlId)
        .catch((err) =>
          this.logger.error(
            `Failed to hang up call ${call.callControlId}: ${err.message}`,
            err.stack,
          ),
        );
      return false;
    }

    if (balance <= LOW_BALANCE_USD) {
      this.scheduleLowBalanceHangup(
        call,
        balance,
        LOW_BALANCE_MAX_CALL_SECONDS,
      );
    } else {
      this.clearLowBalanceHangup(call.callControlId);
    }

    return true;
  }

  /**
   * Extract a custom header value from a Telnyx call.initiated payload.
   * Telnyx delivers custom headers as an array of `{ name, value }` objects;
   * names are case-insensitive in SIP, so we compare lower-cased.
   */
  private getCustomHeader(headers: unknown, name: string): string | null {
    if (!Array.isArray(headers)) return null;
    const target = name.toLowerCase();
    const found = (headers as Array<{ name?: string; value?: string }>).find(
      (h) => typeof h?.name === "string" && h.name.toLowerCase() === target,
    );
    return found?.value ?? null;
  }

  /**
   * Extract callAttemptId from the leg's client state if present.
   * Returns null if the call is not a campaign call.
   */
  private extractCallAttemptId(clientState: string | null): string | null {
    try {
      if (!clientState) return null;
      const decoded = Buffer.from(clientState, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return parsed.callAttemptId ?? null;
    } catch {
      return null;
    }
  }

  async findOneBySessionId(callSessionId: string): Promise<Call | null> {
    return this.callRepository.findOneBySessionId(callSessionId);
  }

  async findById(id: string): Promise<Call | null> {
    return this.callRepository.findById(id);
  }

  async findByControlId(callControlId: string): Promise<Call | null> {
    return this.callRepository.findByControlId(callControlId);
  }

  async listByOwnerPaginated(
    ctx: OwnershipContext,
    options: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
      outcome?: CallOutcome[];
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
      campaignId?: string;
      excludeCampaignCalls?: boolean;
      includeMeetings?: boolean;
      includeTranscriptions?: boolean;
      userId?: string;
      orderBy?: "createdAt" | "startedAt" | "endedAt";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.callRepository.listByOwnerPaginated(ctx, options);
  }

  async listWithRecordings(params: {
    ctx: OwnershipContext;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
    filterUserId?: string;
  }): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.callRepository.listWithRecordings(params);
  }

  /**
   * The Clerk user id the dialing client attributed this leg to, or `null`.
   *
   * `null` is a real answer and callers MUST treat it as one: a leg with no
   * `X-User-Id` (an old client, a direct SIP/WebRTC client, a browser that
   * dialed before Clerk hydrated and sent an empty value) belongs to nobody we
   * can name. It used to be handed to the user lookup as `undefined`, which
   * resolved to an arbitrary account — that account was then billed for the
   * call and had its single call slot taken by a stranger.
   */
  getClerkUserIdFromHeaders(headers: any): string | null {
    if (!Array.isArray(headers)) return null;
    const value = headers.find(
      (header: any) => header?.name === "X-User-Id",
    )?.value;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  async getOrganizationIdFromHeaders(headers: any): Promise<string | null> {
    const clerkOrganizationId = Array.isArray(headers)
      ? headers?.find((header: any) => header.name === "X-Organization-Id")
          ?.value || null
      : null;

    if (!clerkOrganizationId) {
      return null;
    }

    const organization =
      await this.organizationService.getByClerkId(clerkOrganizationId);

    return organization?.id || null;
  }

  /**
   * Consume the events belonging to a server-originated voicemail drop.
   *
   * Returns true when the event was fully handled here. Only the leg's own
   * choreography is claimed (answer → machine detection → playback → hangup
   * command); `call.hangup` and `call.cost` deliberately fall through so a
   * drop is completed, priced and charged like any other call.
   */
  private async handleVoicemailDropEvent(
    event: TelephonyEvent,
    callControlId: string,
  ): Promise<boolean> {
    const { type: eventType, payload } = event;

    // Events a drop's own choreography can consume. Note that the carrier's
    // premium answering-machine tier is folded into
    // `call.machine.greeting.ended` during normalization, so there is one case
    // here where the raw provider feed has two.
    switch (eventType) {
      case "call.initiated":
      case "call.answered":
      case "call.machine.detection.ended":
      case "call.machine.greeting.ended":
      case "call.playback.started":
      case "call.playback.ended":
        break;
      default:
        return false;
    }

    const dropState = this.voicemailDropService.parseClientState(
      event.clientState ?? undefined,
    );
    const isPlayback = this.voicemailDropService.isPlaybackState(
      event.clientState ?? undefined,
    );
    if (!dropState && !isPlayback) {
      return false;
    }

    switch (eventType) {
      case "call.initiated":
        // The Call row was written at dial time — nothing to adopt, and the
        // WebRTC attribution path below would drop this leg anyway.
        return true;

      case "call.answered":
        // Status only: a drop must not trigger recording, transcription or
        // answer-rate credit for the presented caller ID.
        await this.callRepository
          .updateStatus(callControlId, CallStatus.answered)
          .catch((err) =>
            this.logger.warn(
              `Failed to mark voicemail drop ${callControlId} answered: ${err.message}`,
            ),
          );
        return true;

      case "call.machine.detection.ended": {
        // A drop exists to land in the mailbox. `machine` is the only verdict
        // that leads to playback — and even then we wait for the greeting to
        // finish, because talking over it means the mailbox records a message
        // that starts mid-sentence. Anything else (a human picked up, or
        // Telnyx could not tell) ends the leg without playing: a wrong guess
        // here means a stranger answers to silence.
        const result = (payload as CallMachineDetectionPayload)?.result;
        if (result !== "machine") {
          this.logger.log(
            `📼 Voicemail drop ${callControlId} not delivered (AMD result: ${
              result ?? "unknown"
            }) — hanging up without playback`,
          );
          await this.voicemailDropService.abortDrop(callControlId);
        }
        return true;
      }

      case "call.machine.greeting.ended":
        if (dropState) {
          await this.voicemailDropService.handleGreetingEnded(
            callControlId,
            dropState,
          );
        }
        return true;

      case "call.playback.started":
        return true;

      case "call.playback.ended":
        await this.voicemailDropService.handlePlaybackEnded(callControlId);
        return true;

      default:
        return false;
    }
  }

  /**
   * Single entry point for inbound telephony events, in Ringee's own
   * vocabulary. The carrier adapter translates its webhooks into
   * `TelephonyEvent` (see TelnyxEventNormalizer), so this switch — and the call
   * lifecycle it drives — has no provider names in it.
   */
  async handleTelephonyEvent(event: TelephonyEvent) {
    const { type: eventType, callControlId, payload } = event;

    if (eventType === "unknown") {
      // Carriers emit far more than Ringee acts on. Record it and move on.
      await this.callRepository.logEvent(
        callControlId,
        event.providerEventType,
        payload,
      );
      return;
    }

    this.logger.debug(
      `📨 Telephony event received: ${eventType} (${event.provider}:${event.providerEventType})`,
    );

    // Voicemail drops are the one outbound leg we originate server-side: the
    // Call row already exists and answering-machine detection — not a human
    // agent — drives the leg. Everything up to hangup is handled here so the
    // WebRTC-shaped logic below never sees it.
    if (await this.handleVoicemailDropEvent(event, callControlId)) {
      return;
    }

    switch (eventType) {
      case "call.initiated":
        if (event.direction === "inbound") {
          const toNumber = event.to ?? "";
          const number =
            await this.numberPurchasedService.findOneByNumber(toNumber);

          if (!number) {
            this.logger.warn(`⚠️ Number ${toNumber} not found`);
            return;
          }

          const user = await this.userService.getCachedUserById(number.userId!);

          if (!user) {
            this.logger.warn(
              `⚠️ User ${number.userId} not found - ${event.direction}`,
            );
            return;
          }

          // Build ownership context from the number's owner
          const ctx: OwnershipContext = {
            userId: user.id,
            organizationId: number.organizationId,
          };

          const fromNumber = event.from ?? "";
          const contact = await this.contactService.findByPhone(
            ctx,
            fromNumber,
          );

          const inboundCall = await this.callRepository.createCall(ctx, {
            contact: contact ? { connect: { id: contact.id } } : undefined,
            fromNumber,
            toNumber,
            connectionId: apiConfiguration.TELNYX_CONNECTION_ID,
            callControlId,
            direction: event.direction ?? "inbound",
            callSessionId: event.callSessionId ?? undefined,
            callLegId: event.callLegId ?? undefined,
            status: CallStatus.ringing,
            startedAt: event.startedAt ?? undefined,
            clientState: Buffer.from("initiate_call").toString("base64"),
          });

          if (inboundCall) {
            void this.inboxTimelineService
              .ensureThreadForCall(inboundCall)
              .catch((err) =>
                this.logger.error(
                  `Inbox ensureThreadForCall failed (inbound, call=${inboundCall.id}): ${err.message}`,
                  err.stack,
                ),
              );
          }

          const devices = await this.userDeviceService.findActiveByUser(
            user.id,
          );

          // A hangup that beat this webhook is waiting in Redis — apply it now
          // so the row does not stay `ringing` forever.
          await this.replayParkedCallEvents(callControlId);

          devices.length > 0 &&
            (await Promise.allSettled(
              devices.map((device) => {
                return this.notificationService.sendNotification(
                  device.fcmToken,
                  {
                    title: "📞 Incoming Call",
                    body: `Call from ${contact?.name || fromNumber}`,
                    data: {
                      type: "INCOMING_CALL",
                      callerNumber: fromNumber,
                      toNumber,
                      clerkUserId: user.clerkId!,
                      userId: user.id,
                      callSessionId: event.callSessionId ?? "",
                      callControlId,
                      url: `/dashboard/call?control=${event.callSessionId ?? ""}`,
                      title: "📞 Incoming Call",
                    },
                  },
                );
              }),
            ));

          return;
        }

        // Dialer SDK path: the browser embeds a SIGNED correlation token
        // (`X-Ringee-Call-Id`) for a `Call` already created at authorize time
        // (source="sdk"). Adopt that row instead of creating a duplicate. If
        // the token is invalid or the row isn't adoptable, drop rather than
        // fall through to the web-create path.
        {
          const sdkCorrelation = this.getCustomHeader(
            event.customHeaders,
            "X-Ringee-Call-Id",
          );
          if (sdkCorrelation) {
            const handled = await this.adoptSdkCall(
              sdkCorrelation,
              callControlId,
              event,
            );
            if (!handled) {
              this.logger.warn(
                `⚠️ SDK correlation present but not adoptable; dropping ${callControlId}`,
              );
            } else {
              await this.replayParkedCallEvents(callControlId);
            }
            return;
          }
        }

        // Public CallSession dialer path: the WebRTC client embeds the session
        // id and item id as custom headers so we can attribute the call to
        // the session owner without exposing their Clerk/DB ids in the URL.
        const ringeeSessionId = this.getCustomHeader(
          event.customHeaders,
          "X-Ringee-Call-Session-Id",
        );
        const ringeeSessionItemId = this.getCustomHeader(
          event.customHeaders,
          "X-Ringee-Call-Session-Item-Id",
        );

        let outboundCtx: OwnershipContext;
        if (ringeeSessionId) {
          const callSession =
            await this.callSessionRepository.findById(ringeeSessionId);
          if (!callSession || callSession.deletedAt) {
            this.logger.warn(
              `⚠️ Call session ${ringeeSessionId} not found or deleted`,
            );
            return;
          }
          outboundCtx = {
            userId: callSession.userId,
            organizationId: callSession.organizationId,
          };
        } else {
          const clerkUserId = this.getClerkUserIdFromHeaders(
            event.customHeaders,
          );

          if (!clerkUserId) {
            // Drop the leg rather than guess. Attributing an unidentified call
            // to "whoever the lookup returns" bills a stranger and takes their
            // one-call-at-a-time slot, which shows up as a teammate being told
            // they are already on a call they never made.
            this.logger.warn(
              `⚠️ Dropping outbound call ${callControlId}: no X-User-Id custom header ` +
                `(from=${event.from} to=${event.to}) — it cannot be attributed to a user`,
            );
            return;
          }

          const organizationId = await this.getOrganizationIdFromHeaders(
            event.customHeaders,
          );
          const user = await this.userService.getCachedByClerkId(clerkUserId);

          if (!user) {
            this.logger.warn(`⚠️ User ${clerkUserId} not found`);
            return;
          }

          outboundCtx = {
            userId: user.id,
            organizationId: organizationId,
          };
        }

        // Credit-only gate: callers need credit > 0 to place calls.
        if (!(await this.ensureCallAffordable(outboundCtx, callControlId))) {
          return;
        }

        // One call at a time per user, across every device. Enforced here too
        // because the browser places the WebRTC leg and can bypass pre-flight.
        if (!(await this.ensureNoConcurrentCall(outboundCtx, callControlId))) {
          return;
        }

        const contact = await this.contactService.findByPhone(
          outboundCtx,
          event.to ?? "",
        );

        // Resolve which owned number this call presents as caller ID (by its
        // `from`) so we can audit it on the Call row and count it toward the
        // number's daily usage / reputation. Best-effort: never block the call.
        const presentedNumberId = await this.callerIdRotationService
          .registerOutboundCall(outboundCtx, event.from ?? "")
          .catch(() => null);

        const outboundCall = await this.callRepository.createCall(outboundCtx, {
          contact: contact ? { connect: { id: contact.id } } : undefined,
          fromNumber: event.from ?? "",
          toNumber: event.to ?? "",
          connectionId: apiConfiguration.TELNYX_CONNECTION_ID,
          callControlId,
          direction: event.direction ?? "outbound",
          callSessionId: event.callSessionId ?? undefined,
          callLegId: event.callLegId ?? undefined,
          status: CallStatus.ringing,
          startedAt: event.startedAt ?? undefined,
          clientState: Buffer.from("initiate_call").toString("base64"),
          callerId: presentedNumberId
            ? { connect: { id: presentedNumberId } }
            : undefined,
        });

        // Inbox thread materialises now so the conversation appears
        // immediately in the inbox while the call is still in progress.
        if (outboundCall) {
          void this.inboxTimelineService
            .ensureThreadForCall(outboundCall)
            .catch((err) =>
              this.logger.error(
                `Inbox ensureThreadForCall failed (outbound, call=${outboundCall.id}): ${err.message}`,
                err.stack,
              ),
            );
        }

        // Link to campaign call attempt if present
        const initiatedAttemptId = this.extractCallAttemptId(event.clientState);
        if (initiatedAttemptId && outboundCall) {
          await this.callAttemptService.handleWebhookEvent(
            initiatedAttemptId,
            eventType,
            outboundCall.id,
          );
        }

        // Link to the originating CallSessionItem so the public dialer
        // can resolve the Ringee callId without an extra round-trip.
        if (ringeeSessionItemId && outboundCall) {
          await this.callSessionRepository
            .updateItem(ringeeSessionItemId, {
              call: { connect: { id: outboundCall.id } },
            })
            .catch((err) =>
              this.logger.warn(
                `Failed to link CallSessionItem ${ringeeSessionItemId} to call ${outboundCall.id}: ${err.message}`,
              ),
            );
        }

        this.logger.log(`📞 Llamada ${callControlId} iniciada`);

        // Apply any answered/hangup that overtook this webhook. Without this
        // the row below stays `ringing` with no `endedAt` forever and blocks
        // every future dial by this user.
        await this.replayParkedCallEvents(callControlId);
        break;

      case "call.answered": {
        if (!(await this.callRepository.findByControlId(callControlId))) {
          // Beat `call.initiated` here too — park instead of throwing on a
          // missing row (which used to 500 the webhook).
          await this.parkOrphanCallEvent(callControlId, event);
          break;
        }

        const answeredCall = await this.callRepository.updateStatus(
          callControlId,
          CallStatus.answered,
        );
        const answeredAttemptId = this.extractCallAttemptId(event.clientState);
        if (answeredAttemptId && answeredCall) {
          await this.callAttemptService.handleWebhookEvent(
            answeredAttemptId,
            eventType,
            answeredCall.id,
          );
        }

        if (answeredCall) {
          const canContinue =
            await this.enforceAnsweredCreditPolicy(answeredCall);
          if (!canContinue) {
            break;
          }
        }

        // Apply Record all / Transcribe realtime settings once the call is up.
        if (answeredCall) {
          await this.applyAnswerAutomation(answeredCall);
        }
        // Caller-ID reputation: count this as an answered call for the presented
        // number (drives health scoring). Best-effort.
        if (answeredCall?.callerIdId) {
          void this.callerIdRotationService.registerAnswered(
            answeredCall.callerIdId,
          );
        }
        break;
      }

      case "call.hangup": {
        const hangupPayload = payload as CallHangupPayload;

        this.clearLowBalanceHangup(callControlId);

        const hangupCall = await this.callRepository.completeCall(
          callControlId,
          hangupPayload.start_time!,
          hangupPayload.end_time!,
          hangupPayload.hangup_cause,
        );

        if (!hangupCall) {
          // The row does not exist YET: this hangup overtook `call.initiated`.
          // Park it so that handler can close the call it is about to create.
          await this.parkOrphanCallEvent(callControlId, event);
          break;
        }

        // Free the user's single call slot as soon as the leg is down, so they
        // can dial again from any device without waiting for a TTL.
        if (hangupCall?.userId) {
          await this.concurrentCallGuard
            .release(hangupCall.userId, callControlId)
            .catch((err: Error) =>
              this.logger.warn(
                `Could not release the dial lease for call ${callControlId}: ${err.message}`,
              ),
            );
        }
        // Caller-ID reputation: a connected call that lasted < 5s is a strong
        // "spam-like" signal for the presented number. Count it for health.
        if (
          hangupCall?.callerIdId &&
          hangupCall.answeredAt &&
          hangupCall.durationSeconds != null &&
          hangupCall.durationSeconds < SHORT_CALL_SECONDS
        ) {
          void this.callerIdRotationService.registerShortCall(
            hangupCall.callerIdId,
          );
        }
        const hangupAttemptId = this.extractCallAttemptId(event.clientState);
        if (hangupAttemptId && hangupCall) {
          await this.callAttemptService.handleWebhookEvent(
            hangupAttemptId,
            eventType,
            hangupCall.id,
          );
        }
        if (hangupCall) {
          // Stop live transcription; recording-based auto transcription is
          // triggered later when the recordingUrl is available.
          await this.applyHangupAutomation(hangupCall);
          await this.transcriptionOrchestrator
            .chargeRealtimeOnHangup(hangupCall)
            .catch((err: Error) =>
              this.logger.warn(
                `realtime transcription charge on hangup failed for call ${hangupCall.id}: ${err.message}`,
              ),
            );
        }
        if (hangupCall) {
          // Never let a background failure here bubble out as an unhandled
          // rejection: that takes the process down mid-webhook and leaves the
          // very orphaned "live" calls this rule chokes on.
          void this.crmCallLogService
            .handleCallCompleted(hangupCall)
            .catch((err: Error) =>
              this.logger.error(
                `CRM handleCallCompleted failed for call ${hangupCall.id}: ${err.message}`,
                err.stack,
              ),
            );
          // Custom Integrations outbound — choose the most specific event.
          const ciCtx = callOwnershipFromCall(hangupCall);
          if (ciCtx) {
            const eventEnum = pickCallTerminalEvent(hangupCall);
            void this.customIntegrationOutbound.enqueue({
              ctx: ciCtx,
              eventEnum,
              subjectId: hangupCall.id,
              data: buildCallEventData(hangupCall),
            });
          }
          // Inbox timeline hook (best-effort, never block hangup processing)
          const ctx = InboxTimelineService.buildOwnershipFromCall(hangupCall);
          if (ctx) {
            void this.inboxTimelineService
              .appendCallEvent({ ctx, call: hangupCall })
              .then((event) => {
                if (event) {
                  this.logger.log(
                    `Inbox event ${event.id} (${event.kind}) appended for call ${hangupCall.id}`,
                  );
                }
              })
              .catch((err) =>
                this.logger.error(
                  `Inbox appendCallEvent failed for call=${hangupCall.id} ` +
                    `userId=${hangupCall.userId} orgId=${hangupCall.organizationId}: ${err.message}`,
                  err.stack,
                ),
              );
          }
        }
        break;
      }

      case "call.recording.saved": {
        this.logger.debug(
          `💾 Recording saved payload: ${JSON.stringify(payload)}`,
        );
        const savedPayload = payload as CallRecordingSavedPayload;
        try {
          await this.orchestratorService.processCallRecording({
            callControlId,
            recording: {
              publicUrl: savedPayload.recording_urls?.mp3,
              privateUrl: savedPayload.recording_urls?.mp3,
              recordingStartedAt: savedPayload.recording_started_at,
              recordingEndedAt: savedPayload.recording_ended_at,
            },
          });

          // Inbox timeline hook: surface a voicemail when the call outcome
          // marks the recording as a voicemail. We avoid duplicating
          // call_completed by being explicit about voicemail-only.
          const recordingCall =
            await this.callRepository.findByControlId(callControlId);
          if (
            recordingCall &&
            recordingCall.outcome === CallOutcome.voicemail
          ) {
            const recordings = await this.recordingRepository.findByCallId(
              recordingCall.id,
            );
            const latest = recordings[recordings.length - 1];
            const ctx =
              InboxTimelineService.buildOwnershipFromCall(recordingCall);
            if (latest && ctx) {
              void this.inboxTimelineService
                .appendVoicemailEvent({
                  ctx,
                  call: recordingCall,
                  recording: latest,
                })
                .catch((err) =>
                  this.logger.warn(
                    `Inbox appendVoicemailEvent failed: ${err.message}`,
                  ),
                );
            }
          }
        } catch (error) {
          this.logger.error(
            `❌ Error processing call recording: ${JSON.stringify(error, null, 2)}`,
          );
        }
        break;
      }

      case "call.streaming.failed": {
        // The carrier could not establish/keep the media stream → fail the realtime
        // transcript so the UI can offer "Try again".
        const failedCall =
          await this.callRepository.findByControlId(callControlId);
        if (failedCall) {
          const reason =
            (payload as { failure_reason?: string }).failure_reason ||
            "Telnyx media streaming failed";
          await this.transcriptionOrchestrator
            .markRealtimeFailed(failedCall, reason)
            .catch((err: Error) =>
              this.logger.warn(
                `markRealtimeFailed failed for call ${failedCall.id}: ${err.message}`,
              ),
            );
          this.logger.warn(
            `⚠️ streaming.failed for call ${failedCall.id}: ${reason}`,
          );
        }
        break;
      }

      case "call.recording.error": {
        const errorPayload = payload as CallRecordingErrorPayload;
        await this.callRepository.updateControlState(callControlId, {
          errorMessage: errorPayload.error,
          lastEventType: event.providerEventType,
        });
        break;
      }

      case "call.transcription": {
        const transcriptPayload = payload as CallTranscriptionPayload;
        const call = await this.callRepository.findByControlId(callControlId);

        if (!call) {
          this.logger.warn(`⚠️ Llamada ${callControlId} no encontrada`);
          return;
        }

        await this.transcriptionService.handleTranscriptionEvent(
          callControlId,
          transcriptPayload.transcription,
          call.id,
          transcriptPayload.track!,
          transcriptPayload.speaker!,
          transcriptPayload.is_final,
        );
        break;
      }
      case "call.cost": {
        try {
          const costPayload = payload as CallCostPayload;
          const call = await this.callRepository.findByControlId(callControlId);

          if (!call) {
            this.logger.warn(`⚠️ Llamada ${callControlId} no encontrada`);
            return;
          }

          // Idempotency guard: duplicated call.cost deliveries must not charge
          // credits more than once.
          if (call.totalCost != null) {
            this.logger.debug(
              `Skipping duplicate call.cost for ${callControlId} (already settled)`,
            );
            return;
          }

          const baseMargin = apiConfiguration.CALL_PROFIT_MARGIN;
          const recordingMargin = apiConfiguration.CALL_RECORDING_PROFIT_MARGIN;

          // Build context from call's ownership
          const callCtx: OwnershipContext = {
            userId: call.userId!,
            organizationId: call.organizationId,
          };

          // Calls placed from a verified caller ID may carry a surcharge on the
          // profit-margin multiplier. The surcharge is configuration
          // (CALLER_ID_PROFIT_MARGIN_SURCHARGE) and defaults to 0, which is the
          // behaviour that was actually in effect while it was hard-coded — so
          // pricing is unchanged until it is set deliberately. The provider
          // lookup is skipped entirely when there is no surcharge to apply.
          const callerIdSurcharge =
            apiConfiguration.CALLER_ID_PROFIT_MARGIN_SURCHARGE;
          const usedCallerId =
            callerIdSurcharge > 0
              ? await this.numberPurchasedService
                  .isVerifiedCallerId(callCtx, call.fromNumber)
                  .catch(() => false)
              : false;
          const profitMargin = usedCallerId
            ? baseMargin + callerIdSurcharge
            : baseMargin;
          const chargeBreakdown = calculateCallCharge({
            costParts: costPayload.cost_parts,
            totalCost: costPayload.total_cost,
            callProfitMultiplier: profitMargin,
            recordingProfitMultiplier: recordingMargin,
          });
          const { computedTotalCost } = chargeBreakdown;

          const balanceBefore = await this.creditService
            .getBalance(callCtx)
            .catch(() => 0);

          const totalCost = computedTotalCost;

          // Free-call trial intentionally disabled: always charge credits.
          if (totalCost > 0) {
            await this.creditService.consumeCredits(callCtx, totalCost, {
              idempotencyKey: `call-cost:${call.id}`,
              source: "telnyx.call.cost",
            });
          }

          await this.callRepository.updateCost(callControlId, totalCost, {
            ...(payload as Record<string, unknown>),
            ringeeCostBreakdown: {
              ...chargeBreakdown,
              callProfitMultiplier: profitMargin,
              recordingProfitMultiplier: recordingMargin,
            },
            ringeeComputedTotalCost: computedTotalCost,
            ringeeBalanceBefore: balanceBefore,
            ringeeChargeCapped: totalCost < computedTotalCost,
          });
          break;
        } catch (error) {
          console.error("Error processing call cost:", error);
          throw error;
        }
      }

      default:
        await this.callRepository.logEvent(
          callControlId,
          event.providerEventType,
          payload,
        );
        break;
    }
  }
}
