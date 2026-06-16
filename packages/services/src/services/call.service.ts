import { Injectable, Logger } from "@nestjs/common";
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

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    private readonly callRepository: CallRepository,
    private readonly transcriptionService: CallTranscriptionService,
    private readonly userService: UserService,
    private readonly creditService: CreditService,
    private readonly contactService: ContactService,
    private readonly numberPurchasedService: NumberPurchasedService,
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
  ) {}

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
   * Decide whether `ctx`'s owner may place/continue a call. An active free
   * trial is always enough; otherwise a positive credit balance (user or
   * organization, resolved from the context) is required. When neither holds
   * the live call is hung up and `false` is returned so the caller stops
   * processing the event.
   *
   * The user is read through {@link UserService.getCachedUserById} so this hot
   * webhook path avoids a DB round-trip; the cache is invalidated whenever the
   * free trial is consumed.
   */
  private async ensureCallAffordable(
    ctx: OwnershipContext,
    callControlId: string,
  ): Promise<boolean> {
    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.freeCallTrial) {
      return true;
    }

    const balance = await this.creditService.getBalance(ctx);
    if (balance > 0) {
      return true;
    }

    this.logger.warn(
      `⛔ Hanging up call ${callControlId}: no credit and no free trial ` +
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

        // Credit/free-trial gate: an owner with no active free trial and no
        // remaining credit cannot place calls — hang up before the call
        // connects so no billable minutes are consumed.
        if (!(await this.ensureCallAffordable(outboundCtx, callControlId))) {
          return;
        }

        const contact = await this.contactService.findByPhone(
          outboundCtx,
          payload.to!,
        );

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
        // Apply Record all / Transcribe realtime settings once the call is up.
        if (answeredCall) {
          await this.applyAnswerAutomation(answeredCall);
        }
        break;
      }

      case "call.hangup": {
        const hangupPayload = payload as CallHangupPayload;

        await this.callRepository.completeCall(
          callControlId,
          hangupPayload.start_time!,
          hangupPayload.end_time!,
        );

        const hangupCall =
          await this.callRepository.findByControlId(callControlId);
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

          const user = await this.userService.getCachedUserById(call.userId!);

          if (!user) {
            this.logger.warn(`⚠️ Usuario ${call.userId} no encontrado`);
            return;
          }

          const rawTotalCost = parseFloat(costPayload.total_cost);
          const profitMargin = process.env.CALL_PROFIT_MARGIN
            ? parseFloat(process.env.CALL_PROFIT_MARGIN)
            : 0;
          const totalCost = rawTotalCost * profitMargin;

          // Build context from call's ownership
          const callCtx: OwnershipContext = {
            userId: call.userId!,
            organizationId: call.organizationId,
          };

          if (user.freeCallTrial) {
            // consumeFreeCallTrial invalidates the cached user, so the next
            // call re-validates against real credit instead of a stale trial.
            await this.userService.consumeFreeCallTrial(user.id);
          } else {
            await this.creditService.consumeCredits(callCtx, totalCost);
          }

          await this.callRepository.updateCost(
            callControlId,
            totalCost,
            payload,
          );
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
