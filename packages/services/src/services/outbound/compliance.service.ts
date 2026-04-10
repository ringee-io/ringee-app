import { Injectable } from "@nestjs/common";
import { DNCEntryRepository } from "@ringee/database";

@Injectable()
export class ComplianceService {
  constructor(private readonly dncRepo: DNCEntryRepository) {}

  async isOnDNC(
    organizationId: string,
    phoneNumber: string
  ): Promise<boolean> {
    return this.dncRepo.isOnDNC(organizationId, phoneNumber);
  }

  async addToDNC(data: {
    phoneNumber: string;
    organizationId: string;
    reason?: string;
    source?: string;
    addedByUserId?: string;
  }) {
    return this.dncRepo.create(data);
  }

  async bulkAddToDNC(
    entries: {
      phoneNumber: string;
      organizationId: string;
      reason?: string;
      source?: string;
      addedByUserId?: string;
    }[]
  ) {
    return this.dncRepo.createMany(entries);
  }

  async removeFromDNC(organizationId: string, phoneNumber: string) {
    return this.dncRepo.deleteByPhone(organizationId, phoneNumber);
  }

  async listDNC(
    organizationId: string,
    options?: { search?: string; page?: number; limit?: number }
  ) {
    return this.dncRepo.listByOrganization(organizationId, options);
  }

  async checkDNCById(id: string) {
    return this.dncRepo.delete(id);
  }

  /**
   * Check if the current time is within the campaign's allowed calling window.
   */
  isWithinCallingWindow(campaign: {
    timezone: string;
    workStartMin: number;
    workEndMin: number;
    workDays: number[];
  }): boolean {
    const now = new Date();

    // Get current time in campaign timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: campaign.timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      weekday: "short",
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(
      parts.find((p) => p.type === "hour")?.value ?? "0",
      10
    );
    const minute = parseInt(
      parts.find((p) => p.type === "minute")?.value ?? "0",
      10
    );
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const currentDay = dayMap[weekday] ?? 0;
    const currentMin = hour * 60 + minute;

    if (!campaign.workDays.includes(currentDay)) {
      return false;
    }

    return (
      currentMin >= campaign.workStartMin &&
      currentMin < campaign.workEndMin
    );
  }
}
