import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
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
  TelephonyService,
  verifyCallCorrelation,
} from "@ringee/platform";
import type {
  TelnyxWebhookEvent,
  CallTranscriptionPayload,
  CallRecordingErrorPayload,
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
import { CrmCallLogService } from "./crm/crm-call-log.service";
import { InboxTimelineService } from "./inbox/inbox.timeline.service";
import { CustomIntegrationOutboundService } from "./custom-integrations/custom-integration-outbound.service";
import {
  buildCallEventData,
  callOwnershipFromCall,
  pickCallTerminalEvent,
} from "./custom-integrations/custom-integration-event-builders";
import { PipelineFanoutService } from "./ai-pipeline";
import { calculateCallCharge, readProfitMultiplier } from "./call-cost.util";

/** Connected calls shorter than this (seconds) count as "very short" for
 * caller-ID reputation scoring (spec: <5s). */
const SHORT_CALL_SECONDS = 5;
const LOW_BALANCE_USD = 2;
const LOW_BALANCE_MAX_CALL_SECONDS = 5 * 60;

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
    payload: {
      from?: string;
      call_session_id?: string;
      call_leg_id?: string;
      start_time?: string;
    },
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

    // Audit which owned number presented as caller ID + count daily usage.
    const presentedNumberId = await this.callerIdRotationService
      .registerOutboundCall(ctx, payload.from!)
      .catch(() => null);

    const adopted = await this.callRepository.attachTelephony(existing.id, {
      callControlId,
      callSessionId: payload.call_session_id,
      callLegId: payload.call_leg_id,
      connectionId: process.env.TELNYX_CONNECTION_ID,
      startedAt: payload.start_time,
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
   * Extract callAttemptId from Telnyx client_state if present.
   * Returns null if the call is not a campaign call.
   */
  private extractCallAttemptId(payload: any): string | null {
    try {
      if (!payload.client_state) return null;
      const decoded = Buffer.from(payload.client_state, "base64").toString(
        "utf-8",
      );
      const parsed = JSON.parse(decoded);
      return parsed.callAttemptId ?? null;
    } catch {
      return null;
    }
  }

  async findOneBySessionId(callSessionId: string): Promise<Call | null> {
    return this.callRepository.findOneBySessionId(callSessionId);
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

  getClerkUserIdFromHeaders(headers: any): string {
    return Array.isArray(headers)
      ? headers?.find((header: any) => header.name === "X-User-Id")?.value
      : "";
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

  async handleTelnyxEvent(event: TelnyxWebhookEvent) {
    const { event_type, payload } = event;

    const callControlId = payload?.call_control_id;

    if (!callControlId) {
      this.logger.warn(`⚠️ Evento ${event_type} sin call_control_id`);
      return;
    }

    this.logger.debug(`📨 Evento Telnyx recibido: ${event_type}`);

    switch (event_type) {
      case "call.initiated":
        if (["inbound", "incoming"].includes(payload.direction || "")) {
          const number = await this.numberPurchasedService.findOneByNumber(
            payload.to!,
          );

          if (!number) {
            this.logger.warn(`⚠️ Number ${payload.to} not found`);
            return;
          }

          const user = await this.userService.getCachedUserById(number.userId!);

          if (!user) {
            this.logger.warn(
              `⚠️ User ${number.userId} not found - ${payload.direction}`,
            );
            return;
          }

          // Build ownership context from the number's owner
          const ctx: OwnershipContext = {
            userId: user.id,
            organizationId: number.organizationId,
          };

          const contact = await this.contactService.findByPhone(
            ctx,
            payload.from!,
          );

          const inboundCall = await this.callRepository.createCall(ctx, {
            contact: contact ? { connect: { id: contact.id } } : undefined,
            fromNumber: payload.from!,
            toNumber: payload.to!,
            connectionId: process.env.TELNYX_CONNECTION_ID!,
            callControlId,
            direction: payload.direction || "inbound",
            callSessionId: payload.call_session_id!,
            callLegId: payload.call_leg_id!,
            status: CallStatus.ringing,
            startedAt: payload.start_time!,
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

          devices.length > 0 &&
            (await Promise.allSettled(
              devices.map((device) => {
                return this.notificationService.sendNotification(
                  device.fcmToken,
                  {
                    title: "📞 Incoming Call",
                    body: `Call from ${contact?.name || payload.from}`,
                    data: {
                      type: "INCOMING_CALL",
                      callerNumber: payload.from!,
                      toNumber: payload.to!,
                      clerkUserId: user.clerkId!,
                      userId: user.id,
                      callSessionId: payload.call_session_id!,
                      callControlId: payload.call_control_id!,
                      url: `/dashboard/call?control=${payload.call_session_id!}`,
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
            payload.custom_headers,
            "X-Ringee-Call-Id",
          );
          if (sdkCorrelation) {
            const handled = await this.adoptSdkCall(
              sdkCorrelation,
              callControlId,
              payload,
            );
            if (!handled) {
              this.logger.warn(
                `⚠️ SDK correlation present but not adoptable; dropping ${callControlId}`,
              );
            }
            return;
          }
        }

        // Public CallSession dialer path: the WebRTC client embeds the session
        // id and item id as custom headers so we can attribute the call to
        // the session owner without exposing their Clerk/DB ids in the URL.
        const ringeeSessionId = this.getCustomHeader(
          payload.custom_headers,
          "X-Ringee-Call-Session-Id",
        );
        const ringeeSessionItemId = this.getCustomHeader(
          payload.custom_headers,
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
          const userId = this.getClerkUserIdFromHeaders(payload.custom_headers);
          const organizationId = await this.getOrganizationIdFromHeaders(
            payload.custom_headers,
          );
          const user = await this.userService.getCachedByClerkId(userId);

          if (!user) {
            this.logger.warn(`⚠️ User ${userId} not found`);
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

        const contact = await this.contactService.findByPhone(
          outboundCtx,
          payload.to!,
        );

        // Resolve which owned number this call presents as caller ID (by its
        // `from`) so we can audit it on the Call row and count it toward the
        // number's daily usage / reputation. Best-effort: never block the call.
        const presentedNumberId = await this.callerIdRotationService
          .registerOutboundCall(outboundCtx, payload.from!)
          .catch(() => null);

        const outboundCall = await this.callRepository.createCall(outboundCtx, {
          contact: contact ? { connect: { id: contact.id } } : undefined,
          fromNumber: payload.from!,
          toNumber: payload.to!,
          connectionId: process.env.TELNYX_CONNECTION_ID!,
          callControlId,
          direction: payload.direction || "outbound",
          callSessionId: payload.call_session_id!,
          callLegId: payload.call_leg_id!,
          status: CallStatus.ringing,
          startedAt: payload.start_time!,
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
        const initiatedAttemptId = this.extractCallAttemptId(payload);
        if (initiatedAttemptId && outboundCall) {
          await this.callAttemptService.handleWebhookEvent(
            initiatedAttemptId,
            event_type,
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
        break;

      case "call.answered": {
        await this.callRepository.updateStatus(
          callControlId,
          CallStatus.answered,
        );
        const answeredAttemptId = this.extractCallAttemptId(payload);
        const answeredCall =
          await this.callRepository.findByControlId(callControlId);
        if (answeredAttemptId && answeredCall) {
          await this.callAttemptService.handleWebhookEvent(
            answeredAttemptId,
            event_type,
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

        await this.callRepository.completeCall(
          callControlId,
          hangupPayload.start_time!,
          hangupPayload.end_time!,
        );

        const hangupCall =
          await this.callRepository.findByControlId(callControlId);
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
        const hangupAttemptId = this.extractCallAttemptId(payload);
        if (hangupAttemptId && hangupCall) {
          await this.callAttemptService.handleWebhookEvent(
            hangupAttemptId,
            event_type,
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
          void this.crmCallLogService.handleCallCompleted(hangupCall);
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
        try {
          await this.orchestratorService.processCallRecording({
            callControlId,
            recording: {
              publicUrl: payload.recording_urls?.mp3,
              privateUrl: payload.recording_urls?.mp3,
              recordingStartedAt: payload.recording_started_at,
              recordingEndedAt: payload.recording_ended_at,
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

      case "streaming.failed": {
        // Telnyx could not establish/keep the media stream → fail the realtime
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
          lastEventType: event_type,
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

          const baseMargin = readProfitMultiplier(
            process.env.CALL_PROFIT_MARGIN,
          );
          const recordingMargin = readProfitMultiplier(
            process.env.CALL_RECORDING_PROFIT_MARGIN,
            baseMargin,
          );

          // Build context from call's ownership
          const callCtx: OwnershipContext = {
            userId: call.userId!,
            organizationId: call.organizationId,
          };

          // Calls placed from a verified caller ID carry an extra 0.3 added to
          // the profit-margin multiplier.
          const usedCallerId = await this.numberPurchasedService
            .isVerifiedCallerId(callCtx, call.fromNumber)
            .catch(() => false);
          const profitMargin = usedCallerId ? baseMargin + 0 : baseMargin;
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
            ...payload,
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
        await this.callRepository.logEvent(callControlId, event_type, payload);
        break;
    }
  }
}
