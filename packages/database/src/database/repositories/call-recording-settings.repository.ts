import { Injectable } from "@nestjs/common";
import { Prisma, CallRecordingSettings } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CallRecordingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<CallRecordingSettings | null> {
    return this.prisma.callRecordingSettings.findUnique({ where: { userId } });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<CallRecordingSettings | null> {
    return this.prisma.callRecordingSettings.findUnique({
      where: { organizationId },
    });
  }

  /**
   * Upsert the settings row for a user context (organizationId is null).
   */
  async upsertForUser(
    userId: string,
    data: Prisma.CallRecordingSettingsUpdateInput,
  ): Promise<CallRecordingSettings> {
    return this.prisma.callRecordingSettings.upsert({
      where: { userId },
      create: {
        user: { connect: { id: userId } },
        recordAllCalls: (data.recordAllCalls as boolean | undefined) ?? false,
        transcribeRealtime:
          (data.transcribeRealtime as boolean | undefined) ?? false,
        transcribeRecordings:
          (data.transcribeRecordings as boolean | undefined) ?? false,
      },
      update: data,
    });
  }

  /**
   * Upsert the settings row for an organization context.
   */
  async upsertForOrganization(
    organizationId: string,
    data: Prisma.CallRecordingSettingsUpdateInput,
  ): Promise<CallRecordingSettings> {
    return this.prisma.callRecordingSettings.upsert({
      where: { organizationId },
      create: {
        organization: { connect: { id: organizationId } },
        recordAllCalls: (data.recordAllCalls as boolean | undefined) ?? false,
        transcribeRealtime:
          (data.transcribeRealtime as boolean | undefined) ?? false,
        transcribeRecordings:
          (data.transcribeRecordings as boolean | undefined) ?? false,
      },
      update: data,
    });
  }
}
