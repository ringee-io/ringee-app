import { Injectable } from "@nestjs/common";
import {
  DNCEntryRepository,
  DNCOwnerScope,
  DNCCreateInput,
} from "@ringee/database";

@Injectable()
export class ComplianceService {
  constructor(private readonly dncRepo: DNCEntryRepository) {}

  /**
   * Check whether a phone number is on the caller's applicable DNC list.
   * The owner scope decides which list — personal lists and org lists are
   * never queried together. A freelancer placing a call only consults their
   * personal DNC; an org member only consults the org DNC.
   */
  async isOnDNC(
    owner: DNCOwnerScope,
    phoneNumber: string
  ): Promise<boolean> {
    return this.dncRepo.isOnDNC(owner, phoneNumber);
  }

  /**
   * Same scope rules as `isOnDNC` but returns the matching entry so callers
   * can show the reason / source / addedAt to the user.
   */
  async findOnDNC(owner: DNCOwnerScope, phoneNumber: string) {
    return this.dncRepo.findByPhone(owner, phoneNumber);
  }

  async addToDNC(data: DNCCreateInput) {
    return this.dncRepo.create(data);
  }

  async bulkAddToDNC(entries: DNCCreateInput[]) {
    return this.dncRepo.createMany(entries);
  }

  async removeFromDNCByPhone(owner: DNCOwnerScope, phoneNumber: string) {
    return this.dncRepo.deleteByPhone(owner, phoneNumber);
  }

  async listDNC(
    owner: DNCOwnerScope,
    options?: { search?: string; page?: number; limit?: number }
  ) {
    return this.dncRepo.listForOwner(owner, options);
  }

  async deleteDNCById(id: string) {
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
