import { Injectable } from "@nestjs/common";
import { PublicRecording } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class PublicRecordingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { callId: string; url: string }): Promise<PublicRecording> {
    return this.prisma.publicRecording.create({ data });
  }

  async findByCallId(callId: string): Promise<PublicRecording[]> {
    return this.prisma.publicRecording.findMany({
      where: { callId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findLatestByCallId(callId: string): Promise<PublicRecording | null> {
    return this.prisma.publicRecording.findFirst({
      where: { callId },
      orderBy: { createdAt: "desc" },
    });
  }
}
