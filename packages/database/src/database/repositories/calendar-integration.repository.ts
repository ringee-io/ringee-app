import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CalendarIntegration, CalendarProvider } from "@prisma/client";

@Injectable()
export class CalendarIntegrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    organizationId: string,
    provider: CalendarProvider,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      calendarId?: string;
      email?: string;
    },
  ): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: {
        organizationId,
        provider,
        ...data,
      },
      update: {
        ...data,
        isActive: true,
      },
    });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: { organizationId, isActive: true },
    });
  }

  async findByOrgAndProvider(
    organizationId: string,
    provider: CalendarProvider,
  ): Promise<CalendarIntegration | null> {
    return this.prisma.calendarIntegration.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
  }

  async updateTokens(
    id: string,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
    },
  ): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async delete(id: string): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.delete({ where: { id } });
  }
}
