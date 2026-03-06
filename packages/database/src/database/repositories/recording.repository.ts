import { Injectable } from "@nestjs/common";
import { Prisma, Recording } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class RecordingRepository {
  constructor(private readonly prisma: PrismaService) { }

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

  async findByCallId(callId: string): Promise<Recording[]> {
    return this.prisma.recording.findMany({
      where: { callId },
    });
  }
}
