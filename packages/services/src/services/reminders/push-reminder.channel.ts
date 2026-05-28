import { Injectable, Logger } from "@nestjs/common";
import { UserDeviceRepository } from "@ringee/database";
import { NotificationService } from "@ringee/platform";
import {
  ReminderChannel,
  ReminderChannelKind,
  ReminderContent,
  ReminderRecipient,
} from "./reminder-channel.interface";

/**
 * Fan out reminders to every active device the recipient has registered.
 * FCM swallows individual token failures inside NotificationService, so we
 * only throw when the user has no devices at all — that keeps the reminder
 * delivery counted as "failed" in the orchestrator and lets the email path
 * still record a partial success when it ran alongside.
 */
@Injectable()
export class PushReminderChannel implements ReminderChannel {
  readonly kind: ReminderChannelKind = "in_app";
  private readonly logger = new Logger(PushReminderChannel.name);

  constructor(
    private readonly userDeviceRepo: UserDeviceRepository,
    private readonly notifications: NotificationService,
  ) {}

  async send(recipient: ReminderRecipient, content: ReminderContent) {
    const devices = await this.userDeviceRepo.findActiveByUser(recipient.userId);
    if (devices.length === 0) {
      throw new Error(
        `PushReminderChannel: no active devices for user ${recipient.userId}`,
      );
    }

    const data = this.extractData(content);

    await Promise.allSettled(
      devices.map((d) =>
        this.notifications.sendNotification(d.fcmToken, {
          title: content.subject,
          body: this.toShortBody(content.bodyText),
          data,
        }),
      ),
    );

    this.logger.debug(
      `Reminder push dispatched to ${devices.length} device(s) for ${recipient.userId}`,
    );
  }

  // Push payloads have a tight byte budget; collapse multi-line bodies to a
  // single line and trim so the notification UI stays readable on lock screen.
  private toShortBody(text: string): string {
    const oneLine = text.replace(/\s+/g, " ").trim();
    return oneLine.length > 140 ? `${oneLine.slice(0, 137)}…` : oneLine;
  }

  // FCM requires every value in the `data` map to be a string. The mobile
  // app routes off `type` + the relevant subject id, so we only carry those.
  private extractData(content: ReminderContent): Record<string, string> {
    const data: Record<string, string> = {};
    if (content.pushData) {
      for (const [k, v] of Object.entries(content.pushData)) {
        if (typeof v === "string") data[k] = v;
      }
    }
    if (content.deepLinkUrl) data.url = content.deepLinkUrl;
    return data;
  }
}
