import { Injectable } from "@nestjs/common";
import { UserDevice, UserDeviceRepository } from "@ringee/database";

const MAX_DEVICES_PER_USER = 10;

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

  async registerDevice(userId: string, fcmToken: string): Promise<UserDevice | null> {
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
}

