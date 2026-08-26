import { Injectable } from "@nestjs/common";
import { UserDevice, UserDeviceRepository } from "@ringee/database";

const MAX_DEVICES_PER_USER = 10;

/** Mobile registers on every launch; a phone plus a tablet is plenty. */
const MAX_MOBILE_DEVICES_PER_USER = 5;

@Injectable()
export class UserDeviceService {
  constructor(private readonly userDeviceRepository: UserDeviceRepository) {}

  findActiveByUser(userId: string): Promise<UserDevice[]> {
    return this.userDeviceRepository.findActiveByUser(userId);
  }

  create(userId: string, fcmToken: string): Promise<UserDevice> {
    return this.userDeviceRepository.create({
      userId,
      fcmToken,
    });
  }

  async registerDevice(
    userId: string,
    fcmToken: string,
  ): Promise<UserDevice | null> {
    const active = await this.userDeviceRepository.findActiveByUser(userId);

    if (active.some((d) => d.fcmToken === fcmToken)) {
      return null;
    }

    if (active.length >= MAX_DEVICES_PER_USER) {
      await this.userDeviceRepository.revokeOldestForUser(
        userId,
        MAX_DEVICES_PER_USER - 1,
      );
    }

    return this.userDeviceRepository.create({ userId, fcmToken });
  }

  /**
   * Register (or refresh) a push token for the mobile app.
   *
   * Distinct from {@link registerDevice}: the mobile app re-sends its FCM token
   * on every launch, so this upserts rather than refusing a duplicate, and it
   * caps active devices lower — a phone plus a tablet, not a whole fleet.
   */
  async registerPushToken(
    userId: string,
    fcmToken: string,
    maxDevices = MAX_MOBILE_DEVICES_PER_USER,
  ): Promise<UserDevice> {
    const device = await this.userDeviceRepository.registerToken(
      userId,
      fcmToken,
    );
    // Cap the number of active devices per user so a stale token churning
    // doesn't accumulate forever.
    await this.userDeviceRepository.revokeOldestForUser(userId, maxDevices);
    return device;
  }

  revokePushToken(fcmToken: string): Promise<unknown> {
    return this.userDeviceRepository.revokeToken(fcmToken);
  }
}
