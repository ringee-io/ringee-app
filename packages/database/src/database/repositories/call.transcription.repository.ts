import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma, CallTranscriptionSegment } from "@prisma/client";

@Injectable()
export class CallTranscriptionRepository {
  private readonly logger = new Logger(CallTranscriptionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async deleteByCall(callId: string): Promise<number> {
    const result = await this.prisma.callTranscriptionSegment.deleteMany({
      where: { callId },
    });
    this.logger.warn(
      `🧹 Eliminados ${result.count} segmentos de la llamada ${callId}`,
    );
    return result.count;
  }
}
