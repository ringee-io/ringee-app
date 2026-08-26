import { Injectable, Logger } from "@nestjs/common";
import { CallTranscriptionRepository } from "@ringee/database";

@Injectable()
export class CallTranscriptionService {
  private readonly logger = new Logger(CallTranscriptionService.name);

  constructor(
    private readonly transcriptionRepo: CallTranscriptionRepository,
  ) {}

  async handleTranscriptionEvent(
    callControlId: string,
    transcription: string,
    callId: string,
    track: string,
    speaker: number,
    isFinal: boolean,
  ) {
    if (!callControlId) {
      this.logger.warn(
        "⚠️ Transcription event without call_control_id — ignored.",
      );
      return;
    }

    if (!transcription) {
      this.logger.warn("⚠️ Transcription event without text — ignored.");
      return;
    }

    if (!callId) {
      this.logger.warn("⚠️ Transcription event without call_id — ignored.");
      return;
    }

    if (!isFinal) {
      this.logger.warn("⚠️ Transcription event without is_final — ignored.");
      return;
    }

    await this.transcriptionRepo.createSegment({
      call: { connect: { id: callId } },
      text: transcription,
      track,
      speaker,
      isFinal,
    });
  }

  async clearTranscriptions(callId: string) {
    await this.transcriptionRepo.deleteByCall(callId);
  }
}
