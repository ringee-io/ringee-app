import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsEnum } from "class-validator";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { CallTranscription, TranscriptionSource } from "@ringee/database";
import { CallTranscriptionView, TranscriptionService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

class RetryDto {
  @IsEnum(TranscriptionSource)
  source!: TranscriptionSource;
}

/**
 * Call transcription endpoints. Every action resolves and enforces ownership
 * inside the service (a user only ever sees/acts on their own or their org's
 * calls). Deepgram credentials never reach the client.
 */
@Controller("transcription")
export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  /**
   * Full transcription view for a call — drives the Transcribe button, the Live
   * Transcript panel (poll this while a call is active) and the Final Transcript
   * view in call history/detail.
   */
  @Get("calls/:callId")
  async getForCall(
    @CurrentUser() user: CurrentUserData,
    @Param("callId") callId: string,
  ): Promise<CallTranscriptionView> {
    const ctx = createOwnershipContext(user);
    return this.transcriptionService.getForCall(ctx, callId);
  }

  /** Start live transcription for an active call. */
  @Post("calls/:callId/realtime/start")
  async startRealtime(
    @CurrentUser() user: CurrentUserData,
    @Param("callId") callId: string,
  ): Promise<CallTranscription> {
    const ctx = createOwnershipContext(user);
    return this.transcriptionService.startRealtime(ctx, callId);
  }

  /** Stop live transcription. */
  @Post("calls/:callId/realtime/stop")
  async stopRealtime(
    @CurrentUser() user: CurrentUserData,
    @Param("callId") callId: string,
  ): Promise<{ ok: true }> {
    const ctx = createOwnershipContext(user);
    await this.transcriptionService.stopRealtime(ctx, callId);
    return { ok: true };
  }

  /**
   * Transcribe (or re-transcribe) from the recording — the post-call
   * "Transcribe call" / "Retranscribe from recording" action.
   */
  @Post("calls/:callId/recording")
  async transcribeRecording(
    @CurrentUser() user: CurrentUserData,
    @Param("callId") callId: string,
  ): Promise<CallTranscription> {
    const ctx = createOwnershipContext(user);
    return this.transcriptionService.transcribeRecording(ctx, callId);
  }

  /** "Try again" for a failed transcription of the given source. */
  @Post("calls/:callId/retry")
  async retry(
    @CurrentUser() user: CurrentUserData,
    @Param("callId") callId: string,
    @Body() dto: RetryDto,
  ): Promise<CallTranscription> {
    const ctx = createOwnershipContext(user);
    return this.transcriptionService.retry(ctx, callId, dto.source);
  }
}
