import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  Prisma,
  CallTranscription,
  CallTranscriptionSegment,
  TranscriptionSource,
  TranscriptionStatus,
} from "@prisma/client";

export type CallTranscriptionWithSegments = CallTranscription & {
  segments: CallTranscriptionSegment[];
};

@Injectable()
export class CallTranscriptionRepository {
  private readonly logger = new Logger(CallTranscriptionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Segments ──────────────────────────────────────────────────────────

  async createSegment(
    data: Prisma.CallTranscriptionSegmentCreateInput,
  ): Promise<CallTranscriptionSegment> {
    this.logger.debug(
      `💬 Guardando fragmento de transcripción (${data.track || "sin track"})`,
    );
    return this.prisma.callTranscriptionSegment.create({ data });
  }

  async getSegmentsByCall(callId: string): Promise<CallTranscriptionSegment[]> {
    return this.prisma.callTranscriptionSegment.findMany({
      where: { callId },
      orderBy: { createdAt: "asc" },
    });
  }

  async getSegmentsByTranscription(
    transcriptionId: string,
  ): Promise<CallTranscriptionSegment[]> {
    return this.prisma.callTranscriptionSegment.findMany({
      where: { transcriptionId },
      orderBy: { createdAt: "asc" },
    });
  }

  async deleteByCall(callId: string): Promise<number> {
    const result = await this.prisma.callTranscriptionSegment.deleteMany({
      where: { callId },
    });
    this.logger.warn(
      `🧹 Eliminados ${result.count} segmentos de la llamada ${callId}`,
    );
    return result.count;
  }

  async deleteSegmentsByTranscription(
    transcriptionId: string,
  ): Promise<number> {
    const result = await this.prisma.callTranscriptionSegment.deleteMany({
      where: { transcriptionId },
    });
    return result.count;
  }

  // ── Transcription headers ─────────────────────────────────────────────

  async createHeader(
    data: Prisma.CallTranscriptionCreateInput,
  ): Promise<CallTranscription> {
    return this.prisma.callTranscription.create({ data });
  }

  async findHeaderById(id: string): Promise<CallTranscription | null> {
    return this.prisma.callTranscription.findUnique({ where: { id } });
  }

  async findHeaderByCallAndSource(
    callId: string,
    source: TranscriptionSource,
  ): Promise<CallTranscription | null> {
    return this.prisma.callTranscription.findUnique({
      where: { callId_source: { callId, source } },
    });
  }

  async findHeadersByCall(
    callId: string,
  ): Promise<CallTranscriptionWithSegments[]> {
    return this.prisma.callTranscription.findMany({
      where: { callId },
      include: { segments: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateHeader(
    id: string,
    data: Prisma.CallTranscriptionUpdateInput,
  ): Promise<CallTranscription> {
    return this.prisma.callTranscription.update({ where: { id }, data });
  }

  /**
   * Create the (callId, source) header if it does not exist, otherwise return
   * the existing one. Used as the entry point for both realtime and recording
   * transcription so callers never race on the unique constraint.
   */
  async upsertHeader(params: {
    callId: string;
    source: TranscriptionSource;
    userId?: string | null;
    organizationId?: string | null;
    status: TranscriptionStatus;
    recordingId?: string | null;
    recordingUrl?: string | null;
    model?: string | null;
  }): Promise<CallTranscription> {
    return this.prisma.callTranscription.upsert({
      where: {
        callId_source: { callId: params.callId, source: params.source },
      },
      create: {
        callId: params.callId,
        source: params.source,
        status: params.status,
        userId: params.userId ?? null,
        organizationId: params.organizationId ?? null,
        recordingId: params.recordingId ?? null,
        recordingUrl: params.recordingUrl ?? null,
        model: params.model ?? null,
        startedAt: new Date(),
      },
      update: {
        status: params.status,
        recordingId: params.recordingId ?? undefined,
        recordingUrl: params.recordingUrl ?? undefined,
        model: params.model ?? undefined,
        errorMessage: null,
      },
    });
  }

  /**
   * Append a final segment to a transcription header and recompute the
   * aggregate text/confidence in a single transaction.
   */
  async appendFinalSegment(
    transcriptionId: string,
    segment: {
      callId: string;
      text: string;
      speaker?: number | null;
      track?: string | null;
      confidence?: number | null;
      startMs?: number | null;
      endMs?: number | null;
    },
  ): Promise<CallTranscriptionSegment> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.callTranscriptionSegment.create({
        data: {
          call: { connect: { id: segment.callId } },
          transcription: { connect: { id: transcriptionId } },
          text: segment.text,
          speaker: segment.speaker ?? null,
          track: segment.track ?? null,
          confidence: segment.confidence ?? null,
          startMs: segment.startMs ?? null,
          endMs: segment.endMs ?? null,
          isFinal: true,
        },
      });

      const segments = await tx.callTranscriptionSegment.findMany({
        where: { transcriptionId },
        orderBy: { createdAt: "asc" },
      });
      const text = segments
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join(" ");

      await tx.callTranscription.update({
        where: { id: transcriptionId },
        data: { text },
      });

      return created;
    });
  }

  /**
   * Atomically replace a transcription's segments and mark it completed. Used by
   * the recording (pre-recorded) path which produces all segments at once.
   */
  async completeWithSegments(
    transcriptionId: string,
    callId: string,
    result: {
      text: string;
      language?: string | null;
      confidence?: number | null;
      durationMs?: number | null;
      model?: string | null;
      metadata?: Prisma.InputJsonValue;
      segments: Array<{
        text: string;
        speaker?: number | null;
        track?: string | null;
        confidence?: number | null;
        startMs?: number | null;
        endMs?: number | null;
      }>;
    },
  ): Promise<CallTranscription> {
    return this.prisma.$transaction(async (tx) => {
      await tx.callTranscriptionSegment.deleteMany({
        where: { transcriptionId },
      });

      if (result.segments.length > 0) {
        await tx.callTranscriptionSegment.createMany({
          data: result.segments.map((s) => ({
            callId,
            transcriptionId,
            text: s.text,
            speaker: s.speaker ?? null,
            track: s.track ?? null,
            confidence: s.confidence ?? null,
            startMs: s.startMs ?? null,
            endMs: s.endMs ?? null,
            isFinal: true,
          })),
        });
      }

      return tx.callTranscription.update({
        where: { id: transcriptionId },
        data: {
          status: TranscriptionStatus.completed,
          text: result.text,
          language: result.language ?? undefined,
          confidence: result.confidence ?? undefined,
          durationMs: result.durationMs ?? undefined,
          model: result.model ?? undefined,
          metadata: result.metadata,
          errorMessage: null,
          completedAt: new Date(),
        },
      });
    });
  }

  async markStatus(
    transcriptionId: string,
    status: TranscriptionStatus,
    extra?: {
      errorMessage?: string | null;
      completedAt?: Date | null;
    },
  ): Promise<CallTranscription> {
    return this.prisma.callTranscription.update({
      where: { id: transcriptionId },
      data: {
        status,
        errorMessage: extra?.errorMessage ?? undefined,
        completedAt: extra?.completedAt ?? undefined,
      },
    });
  }

  async findStuckProcessing(
    olderThan: Date,
    limit = 25,
  ): Promise<CallTranscription[]> {
    return this.prisma.callTranscription.findMany({
      where: {
        status: TranscriptionStatus.processing,
        updatedAt: { lt: olderThan },
      },
      take: limit,
    });
  }
}
