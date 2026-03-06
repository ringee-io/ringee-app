import { Injectable, Logger } from "@nestjs/common";
import { fcm } from "./notification.config";

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendNotification(
    token: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ) {
    try {
      const message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: "high",
        },
        webpush: {
          headers: {
            Urgency: "high",
          },
        },
      };

      // const message = {
      //   token,
      //   data: {
      //     title: payload.title,
      //     body: payload.body,
      //     ...payload.data,
      //   },
      //   android: { priority: 'high' },
      //   webpush: {
      //     headers: { Urgency: 'high' },
      //   },
      // };

      // TODO: type

      // @ts-expect-error
      await fcm.send(message);
      this.logger.log(`✅ Push sent to ${token}`);
    } catch (error) {
      // @ts-expect-error
      this.logger.error("❌ Error sending FCM:", error.message);
    }
  }
}
