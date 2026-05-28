import { BadRequestException, Injectable } from "@nestjs/common";
import { User, UserRepository } from "@ringee/database";

// Mirrors the mobile settings toggles. Missing keys default to "on" so a
// user who has never opened the screen still receives notifications.
export interface NotificationPreferences {
  callbacks: boolean;
  meetings: boolean;
  missedCalls: boolean;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  callbacks: true,
  meetings: true,
  missedCalls: true,
};

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  const pick = (k: keyof NotificationPreferences) =>
    typeof obj[k] === "boolean"
      ? (obj[k] as boolean)
      : DEFAULT_NOTIFICATION_PREFERENCES[k];
  return {
    callbacks: pick("callbacks"),
    meetings: pick("meetings"),
    missedCalls: pick("missedCalls"),
  };
}

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) { }

  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferences> {
    const user = await this.userRepository.findById(userId);
    return normalizeNotificationPreferences(
      (user as { notificationPreferences?: unknown } | null)
        ?.notificationPreferences,
    );
  }

  async setNotificationPreferences(
    userId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.getNotificationPreferences(userId);
    const next: NotificationPreferences = {
      callbacks:
        typeof patch.callbacks === "boolean" ? patch.callbacks : current.callbacks,
      meetings:
        typeof patch.meetings === "boolean" ? patch.meetings : current.meetings,
      missedCalls:
        typeof patch.missedCalls === "boolean"
          ? patch.missedCalls
          : current.missedCalls,
    };
    await this.userRepository.update(userId, {
      // Prisma's InputJsonValue requires an index signature; spread to make
      // the literal compatible without losing the structural typing above.
      notificationPreferences: { ...next },
    });
    return next;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async getByClerkId(clerkId: string): Promise<User | null> {
    return this.userRepository.findByClerkId(clerkId);
  }

  async getByClerkIds(clerkIds: string[]): Promise<{ id: string; clerkId: string | null }[]> {
    return this.userRepository.findByClerkIds(clerkIds);
  }

  async patchCustomerId(userId: string, customerId: string): Promise<User> {
    return this.userRepository.update(userId, { customerId });
  }

  async consumeFreeCallTrial(userId: string): Promise<User> {
    try {
      const user = await this.userRepository.updateFreeCallTrial(userId, false);
      return user;
    } catch (error) {
      console.error(
        "Error consuming free call trial:",
        JSON.stringify(error, null, 2),
      );
      throw new BadRequestException(error);
    }
  }
}
