import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CalendarIntegration, CalendarProvider } from "@prisma/client";

@Injectable()
export class CalendarIntegrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    userId: string,
    provider: CalendarProvider,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      calendarId?: string;
      email?: string;
      organizationId?: string | null;
    },
  ): Promise<CalendarIntegration> {
    return this.prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        organizationId: data.organizationId ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        calendarId: data.calendarId,
        email: data.email,
      },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        calendarId: data.calendarId,
        email: data.email,
        isActive: true,
      },
    });
  }

  async findByUser(userId: string): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: { userId, isActive: true },
    });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: { organizationId, isActive: true },
    });
  }

  async findByUserOrOrg(
    userId: string,
    organizationId?: string | null,
  ): Promise<CalendarIntegration[]> {
    return this.prisma.calendarIntegration.findMany({
      where: {
        isActive: true,
        OR: [{ userId }, ...(organizationId ? [{ organizationId }] : [])],
      },
    });
  }

  async findByOrgAndProvider(
    organizationId: string,
    provider: CalendarProvider,
  ): Promise<CalendarIntegration | null> {
    return this.prisma.calendarIntegration.findFirst({
      where: { organizationId, provider, isActive: true },
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
