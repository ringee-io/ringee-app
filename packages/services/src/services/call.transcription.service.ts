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
      this.logger.warn("⚠️ Evento sin call_control_id, ignorado.");
      return;
    }

    if (!transcription) {
      this.logger.warn("⚠️ Evento sin texto de transcripción, ignorado.");
      return;
    }

    if (!callId) {
      this.logger.warn("⚠️ Evento sin call_id, ignorado.");
      return;
    }

    if (!isFinal) {
      this.logger.warn("⚠️ Evento sin is_final, ignorado.");
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
