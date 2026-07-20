import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Call,
  CallRepository,
  CallTranscription,
  CallTranscriptionRepository,
  CallTranscriptionWithSegments,
  PublicRecordingRepository,
  TranscriptionSource,
  TranscriptionStatus,
} from "@ringee/database";
import {
  DeepgramService,
  OrchestratorService,
  OwnershipContext,
  RedisService,
  TelephonyService,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { CreditService } from "../credit.service";
import { CrmCallLogService } from "../crm/crm-call-log.service";
import {
  CallTranscriptionView,
  TranscriptionView,
} from "./transcription.types";
import {
  formatTranscriptWithSpeakers,
  LivePartial,
  livePartialKey,
} from "./transcription.constants";
import { PipelineFanoutService } from "../ai-pipeline";

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private readonly transcriptionRepo: CallTranscriptionRepository,
    private readonly callRepo: CallRepository,
    private readonly publicRecordingRepo: PublicRecordingRepository,
    private readonly telephonyService: TelephonyService,
    private readonly deepgramService: DeepgramService,
    private readonly orchestratorService: OrchestratorService,
    private readonly redisService: RedisService,
    private readonly creditService: CreditService,
    private readonly crmCallLogService: CrmCallLogService,
    private readonly pipelineFanout: PipelineFanoutService,
  ) {}

  // ── Access control ────────────────────────────────────────────────────

  /**
   * A user may only touch a call's transcripts when:
   *  - the call belongs to an organization → the caller is acting in that org;
   *  - the call is personal → the caller owns it.
   * No cross-tenant access.
   */
  private assertCallAccess(ctx: OwnershipContext, call: Call): void {
    if (call.organizationId) {
      if (ctx.organizationId !== call.organizationId) {
        throw new ForbiddenException("No access to this call's transcription");
      }
      return;
    }
    if (call.userId !== ctx.userId || ctx.organizationId) {
      throw new ForbiddenException("No access to this call's transcription");
    }
  }

  private async loadCallForCtx(
    ctx: OwnershipContext,
    callId: string,
  ): Promise<Call> {
    const call = await this.callRepo.findById(callId);
    if (!call) throw new NotFoundException("Call not found");
    this.assertCallAccess(ctx, call);
    return call;
  }

  private ctxFromCall(call: Call): OwnershipContext {
    return { userId: call.userId!, organizationId: call.organizationId };
  }

  private getTranscriptionCreditsPerMinute(): number {
    const unitCost = Math.max(
      Number(apiConfiguration.TRANSCRIPTION_CREDIT_COST_PER_MINUTE) || 0,
      0,
    );
    const margin = Math.max(
      Number(apiConfiguration.TRANSCRIPTION_CREDIT_PROFIT_MARGIN) || 1,
      1,
    );
    return unitCost * margin;
  }

  private getTranscriptionProfitMargin(): number {
    return Math.max(
      Number(apiConfiguration.TRANSCRIPTION_CREDIT_PROFIT_MARGIN) || 1,
      1,
    );
  }

  private computeCreditsFromProviderCost(costUsd: number): number {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
    return Number((costUsd * this.getTranscriptionProfitMargin()).toFixed(6));
  }

  private parseNonNegativeNumber(value: unknown): number | null {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? value : null;
    }
    if (typeof value === "string") {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
  }

  private resolveDurationSeconds(call: Call): number {
    if (
      typeof call.durationSeconds === "number" &&
      Number.isFinite(call.durationSeconds)
    ) {
      return Math.max(call.durationSeconds, 0);
    }

    if (call.startedAt && call.endedAt) {
      return Math.max(
        Math.floor((call.endedAt.getTime() - call.startedAt.getTime()) / 1000),
        0,
      );
    }

    return 0;
  }

  private computeCreditsForDuration(durationSeconds: number): number {
    if (durationSeconds <= 0) return 0;
    const credits =
      (durationSeconds / 60) * this.getTranscriptionCreditsPerMinute();
    return Number(credits.toFixed(6));
  }

  private async assertTranscriptionCredits(
    call: Call,
    requiredCredits: number,
  ): Promise<void> {
    if (requiredCredits <= 0) return;

    const balance = await this.creditService.getBalance(this.ctxFromCall(call));
    if (balance < requiredCredits) {
      throw new BadRequestException(
        "Insufficient credits to start transcription",
      );
    }
  }

  private toMetadataObject(metadata: unknown): Record<string, unknown> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return {};
    }
    return metadata as Record<string, unknown>;
  }

  private extractDeepgramCostFromMetadata(
    metadata: Record<string, unknown>,
  ): number | null {
    const candidates: unknown[] = [
      metadata.deepgramCostUsd,
      metadata.requestCostUsd,
      metadata.providerCostUsd,
      this.toMetadataObject(metadata.deepgram).costUsd,
    ];

    for (const candidate of candidates) {
      const parsed = this.parseNonNegativeNumber(candidate);
      if (parsed !== null) return parsed;
    }

    return null;
  }

  /**
   * Telnyx errors surface as Nest HttpExceptions whose `.message` is just
   * "Http Exception"; the real provider detail lives in the response body.
   * Flatten it into a readable string for logs and the stored errorMessage.
   */
  private describeError(err: unknown): string {
    if (err instanceof HttpException) {
      const res = err.getResponse() as any;
      const detail =
        res?.errors?.[0]?.detail ||
        res?.errors?.[0]?.title ||
        res?.message ||
        (typeof res === "string" ? res : null);
      return detail ? `${detail}` : JSON.stringify(res);
    }
    return (err as Error)?.message ?? String(err);
  }

  // ── Realtime (live) ───────────────────────────────────────────────────

  /**
   * Start realtime transcription for an in-progress call. Idempotent: if a
   * realtime header is already transcribing it is returned untouched.
   */
  async startRealtimeForCall(call: Call): Promise<CallTranscription> {
    if (!this.deepgramService.isConfigured) {
      throw new BadRequestException(
        "Transcription is not configured on this server",
      );
    }
    if (!apiConfiguration.TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL) {
      throw new BadRequestException(
        "Realtime transcription is not configured (media stream URL missing)",
      );
    }
    if (!call.callControlId) {
      throw new BadRequestException("Call has no active control channel");
    }

    const existing = await this.transcriptionRepo.findHeaderByCallAndSource(
      call.id,
      TranscriptionSource.realtime,
    );
    const activeStatuses: TranscriptionStatus[] = [
      TranscriptionStatus.starting,
      TranscriptionStatus.transcribing,
    ];
    if (existing && activeStatuses.includes(existing.status)) {
      return existing;
    }

    const estimatedStartCharge = this.computeCreditsForDuration(
      Math.max(this.resolveDurationSeconds(call), 60),
    );
    await this.assertTranscriptionCredits(call, estimatedStartCharge);

    const header = await this.transcriptionRepo.upsertHeader({
      callId: call.id,
      source: TranscriptionSource.realtime,
      userId: call.userId,
      organizationId: call.organizationId,
      status: TranscriptionStatus.starting,
      model: apiConfiguration.DEEPGRAM_MODEL,
    });

    const base = apiConfiguration.TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL;
    const streamUrl = `${base}${base.includes("?") ? "&" : "?"}callId=${call.id}`;

    try {
      await this.telephonyService.startStreaming(
        call.callControlId,
        streamUrl,
        "both_tracks",
      );
      this.logger.log(`▶️ Realtime transcription started for call ${call.id}`);
    } catch (err) {
      const detail = this.describeError(err);
      await this.transcriptionRepo.markStatus(
        header.id,
        TranscriptionStatus.failed,
        {
          errorMessage: detail,
        },
      );
      this.logger.error(
        `Failed to start media streaming for call ${call.id} ` +
          `(streamUrl=${streamUrl}): ${detail}`,
      );
      throw new BadRequestException("Failed to start live transcription");
    }

    return header;
  }

  /**
   * Stop realtime transcription. The media bridge finalizes the header status
   * when Telnyx closes the socket; here we just stop the Telnyx stream and, as
   * a safety net, demote a never-started header to `stopped`.
   */
  async stopRealtimeForCall(call: Call): Promise<void> {
    if (call.callControlId) {
      await this.telephonyService
        .stopStreaming(call.callControlId)
        .catch((err) =>
          this.logger.warn(
            `stopStreaming failed for call ${call.id}: ${err.message}`,
          ),
        );
    }
    await this.redisService.del(livePartialKey(call.id)).catch(() => undefined);
  }

  /**
   * Mark the realtime transcript as failed in response to a Telnyx
   * `streaming.failed` event (e.g. Telnyx could not reach the media stream
   * URL). Best-effort; only touches an in-flight header.
   */
  async markRealtimeFailed(call: Call, reason?: string): Promise<void> {
    const header = await this.transcriptionRepo.findHeaderByCallAndSource(
      call.id,
      TranscriptionSource.realtime,
    );
    const inFlight: TranscriptionStatus[] = [
      TranscriptionStatus.starting,
      TranscriptionStatus.transcribing,
    ];
    if (!header || !inFlight.includes(header.status)) return;
    await this.transcriptionRepo.markStatus(
      header.id,
      TranscriptionStatus.failed,
      {
        errorMessage: reason || "Telnyx media streaming failed",
      },
    );
    await this.redisService.del(livePartialKey(call.id)).catch(() => undefined);
  }

  // ── Recording (pre-recorded) ──────────────────────────────────────────

  /**
   * Request transcription of a call's recording. When `manual` is false this is
   * the automatic path and is skipped if a completed realtime transcript already
   * exists (no duplicate). `manual` always proceeds (the "Retranscribe from
   * recording" action). Heavy work happens in the worker.
   */
  async transcribeFromRecording(
    call: Call,
    opts: { manual: boolean },
  ): Promise<CallTranscription> {
    if (!this.deepgramService.isConfigured) {
      throw new BadRequestException(
        "Transcription is not configured on this server",
      );
    }

    if (!opts.manual) {
      const realtime = await this.transcriptionRepo.findHeaderByCallAndSource(
        call.id,
        TranscriptionSource.realtime,
      );
      if (
        realtime &&
        realtime.status === TranscriptionStatus.completed &&
        (realtime.text?.trim().length ?? 0) > 0
      ) {
        this.logger.debug(
          `Skipping auto recording transcription for call ${call.id}: realtime transcript already exists`,
        );
        return realtime;
      }
    }

    const recording = await this.publicRecordingRepo.findLatestByCallId(
      call.id,
    );

    if (!recording?.url) {
      // No recordingUrl yet → mark unavailable so the UI shows the right state.
      return this.transcriptionRepo.upsertHeader({
        callId: call.id,
        source: TranscriptionSource.recording,
        userId: call.userId,
        organizationId: call.organizationId,
        status: TranscriptionStatus.unavailable,
      });
    }

    const estimatedCharge = this.computeCreditsForDuration(
      Math.max(this.resolveDurationSeconds(call), 60),
    );
    await this.assertTranscriptionCredits(call, estimatedCharge);

    const header = await this.transcriptionRepo.upsertHeader({
      callId: call.id,
      source: TranscriptionSource.recording,
      userId: call.userId,
      organizationId: call.organizationId,
      status: TranscriptionStatus.processing,
      recordingId: recording.id,
      recordingUrl: recording.url,
      model: apiConfiguration.DEEPGRAM_MODEL,
    });

    await this.orchestratorService.processTranscribeRecording({
      callId: call.id,
      manual: opts.manual,
    });

    return header;
  }

  /**
   * Debit realtime transcription credits once the call ends. Idempotent across
   * duplicate hangup webhook deliveries.
   */
  async chargeRealtimeOnHangup(call: Call): Promise<void> {
    const header = await this.transcriptionRepo.findHeaderByCallAndSource(
      call.id,
      TranscriptionSource.realtime,
    );
    if (!header) return;

    if (
      header.status === TranscriptionStatus.failed ||
      header.status === TranscriptionStatus.unavailable
    ) {
      return;
    }

    const metadata = this.toMetadataObject(header.metadata);
    if (metadata.chargedOnHangup === true) {
      return;
    }

    const durationSeconds = this.resolveDurationSeconds(call);
    const deepgramCostUsd = this.extractDeepgramCostFromMetadata(metadata);
    const chargedCredits =
      deepgramCostUsd !== null
        ? this.computeCreditsFromProviderCost(deepgramCostUsd)
        : this.computeCreditsForDuration(durationSeconds);
    const chargeBasis =
      deepgramCostUsd !== null ? "deepgram_cost" : "duration_fallback";

    if (chargedCredits > 0) {
      await this.assertTranscriptionCredits(call, chargedCredits);
      await this.creditService.consumeCredits(
        this.ctxFromCall(call),
        chargedCredits,
      );
    }

    await this.transcriptionRepo.updateHeader(header.id, {
      metadata: {
        ...metadata,
        chargedOnHangup: true,
        chargedCredits,
        chargeBasis,
        deepgramCostUsd,
        chargedAt: new Date().toISOString(),
        durationSeconds,
        creditsPerMinute: this.getTranscriptionCreditsPerMinute(),
      },
    });
  }

  /**
   * Worker entry point: actually run Deepgram over the recording URL and persist
   * the result. Safe to retry; segments are replaced atomically.
   */
  async runRecordingTranscription(callId: string): Promise<void> {
    const header = await this.transcriptionRepo.findHeaderByCallAndSource(
      callId,
      TranscriptionSource.recording,
    );
    if (!header) {
      this.logger.warn(`No recording transcription header for call ${callId}`);
      return;
    }

    const recordingUrl =
      header.recordingUrl ||
      (await this.publicRecordingRepo.findLatestByCallId(callId))?.url;

    if (!recordingUrl) {
      await this.transcriptionRepo.markStatus(
        header.id,
        TranscriptionStatus.unavailable,
      );
      return;
    }

    try {
      await this.transcriptionRepo.markStatus(
        header.id,
        TranscriptionStatus.processing,
      );

      const result = await this.deepgramService.transcribeUrl(recordingUrl);
      const deepgramCostUsd = this.parseNonNegativeNumber(result.costUsd);
      const durationSeconds = Math.max((result.durationMs ?? 0) / 1000, 0);
      const chargedCredits =
        deepgramCostUsd !== null
          ? this.computeCreditsFromProviderCost(deepgramCostUsd)
          : this.computeCreditsForDuration(durationSeconds);

      if (chargedCredits > 0 && header.userId) {
        await this.creditService.consumeCredits(
          {
            userId: header.userId,
            organizationId: header.organizationId,
          },
          chargedCredits,
        );
      }

      if (chargedCredits > 0 && !header.userId) {
        this.logger.warn(
          `Skipping transcription credit debit for ${callId}: header has no userId`,
        );
      }

      await this.transcriptionRepo.completeWithSegments(header.id, callId, {
        text: result.text,
        language: result.language,
        confidence: result.confidence,
        durationMs: result.durationMs,
        model: apiConfiguration.DEEPGRAM_MODEL,
        metadata: {
          deepgramCostUsd,
          chargedCredits,
          chargeBasis:
            deepgramCostUsd !== null ? "deepgram_cost" : "duration_fallback",
          transcriptionProfitMargin: this.getTranscriptionProfitMargin(),
          chargedAt: new Date().toISOString(),
          deepgramRaw: result.raw ?? null,
        },
        segments: result.segments,
      });

      this.logger.log(
        `✅ Recording transcription completed for call ${callId} (${result.segments.length} segments)`,
      );

      // Refresh the shared call analysis only after the completed transcript is
      // durable. If the outcome is not set yet the fan-out is a no-op; the
      // later outcome write will analyze the already-completed transcript.
      this.pipelineFanout.handleCallFinalized(callId);

      // Best-effort: push the transcript onto the CRM record. Never let a CRM
      // failure break transcription. Use the speaker-labeled rendering so the
      // note separates who said what (Agent/Contact for per-track, Speaker N
      // for diarized recordings) instead of one undifferentiated block.
      const crmTranscript =
        result.segments.length > 0
          ? formatTranscriptWithSpeakers(result.segments)
          : result.text;
      await this.crmCallLogService
        .enqueueTranscriptSync(callId, { transcript: crmTranscript })
        .catch((crmErr: Error) =>
          this.logger.warn(
            `CRM transcript sync enqueue failed for call ${callId}: ${crmErr.message}`,
          ),
        );
    } catch (err) {
      await this.transcriptionRepo.markStatus(
        header.id,
        TranscriptionStatus.failed,
        { errorMessage: (err as Error).message },
      );
      this.logger.error(
        `Recording transcription failed for call ${callId}: ${(err as Error).message}`,
      );
    }
  }

  // ── Public API (controller-facing) ────────────────────────────────────

  /**
   * Start live transcription on demand (the "Transcribe call" button during an
   * active call).
   */
  async startRealtime(
    ctx: OwnershipContext,
    callId: string,
  ): Promise<CallTranscription> {
    const call = await this.loadCallForCtx(ctx, callId);
    return this.startRealtimeForCall(call);
  }

  async stopRealtime(ctx: OwnershipContext, callId: string): Promise<void> {
    const call = await this.loadCallForCtx(ctx, callId);
    await this.stopRealtimeForCall(call);
  }

  /**
   * Trigger (or retry) transcription from the recording (the post-call
   * "Transcribe call" / "Retranscribe from recording" action). Always manual.
   */
  async transcribeRecording(
    ctx: OwnershipContext,
    callId: string,
  ): Promise<CallTranscription> {
    const call = await this.loadCallForCtx(ctx, callId);
    return this.transcribeFromRecording(call, { manual: true });
  }

  /**
   * "Try again" — re-run whichever source failed. Realtime can only retry while
   * the call is live; otherwise we fall back to the recording.
   */
  async retry(
    ctx: OwnershipContext,
    callId: string,
    source: TranscriptionSource,
  ): Promise<CallTranscription> {
    const call = await this.loadCallForCtx(ctx, callId);
    if (
      source === TranscriptionSource.realtime &&
      call.callControlId &&
      !call.endedAt
    ) {
      return this.startRealtimeForCall(call);
    }
    return this.transcribeFromRecording(call, { manual: true });
  }

  /**
   * Assemble the full transcription view for a call (Live + Final transcript).
   */
  async getForCall(
    ctx: OwnershipContext,
    callId: string,
  ): Promise<CallTranscriptionView> {
    const call = await this.loadCallForCtx(ctx, callId);

    const headers = await this.transcriptionRepo.findHeadersByCall(callId);
    const recording = await this.publicRecordingRepo.findLatestByCallId(callId);
    const partial = await this.redisService
      .get<LivePartial>(livePartialKey(callId))
      .catch(() => undefined);

    const realtime = headers.find(
      (h) => h.source === TranscriptionSource.realtime,
    );
    const recordingHeader = headers.find(
      (h) => h.source === TranscriptionSource.recording,
    );

    return {
      callId,
      recordingAvailable: !!recording?.url,
      transcriptionEnabled: this.deepgramService.isConfigured,
      realtime: realtime ? this.toView(realtime) : null,
      recording: recordingHeader ? this.toView(recordingHeader) : null,
      livePartial:
        partial && partial.text
          ? { track: partial.track, text: partial.text }
          : null,
    };
  }

  private toView(header: CallTranscriptionWithSegments): TranscriptionView {
    return {
      id: header.id,
      source: header.source,
      status: header.status,
      text: header.text,
      language: header.language,
      confidence: header.confidence,
      errorMessage: header.errorMessage,
      startedAt: header.startedAt,
      completedAt: header.completedAt,
      durationMs: header.durationMs,
      segments: (header.segments ?? []).map((s) => ({
        id: s.id,
        text: s.text,
        speaker: s.speaker,
        track: s.track,
        confidence: s.confidence,
        startMs: s.startMs,
        endMs: s.endMs,
        createdAt: s.createdAt,
      })),
    };
  }
}
