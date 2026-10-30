import { Injectable } from "@nestjs/common";
import { Prisma, Recording } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class RecordingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.RecordingCreateInput): Promise<Recording> {
    return this.prisma.recording.create({
      data,
    });
  }

  async update(
    id: string,
    data: Prisma.RecordingUpdateInput,
  ): Promise<Recording> {
    return this.prisma.recording.update({
      where: { id },
      data,
    });
  }

  async findById(id: string): Promise<Recording | null> {
    return this.prisma.recording.findUnique({
      where: { id },
    });
  }

  /** The recording, only when it is one of `callId`'s. */
  async findForCall(callId: string, id: string): Promise<Recording | null> {
    return this.prisma.recording.findFirst({
      where: { id, callId },
    });
  }

  async findByCallId(callId: string): Promise<Recording[]> {
    return this.prisma.recording.findMany({
      where: { callId },
    });
  }
}
