import { Injectable, Logger } from "@nestjs/common";

/**
 * Push delivery via the Expo Push Service.
 *
 * Expo brokers both APNs (iOS) and FCM (Android), so the client only ever
 * deals with an `ExponentPushToken[…]` string and we POST to a single HTTP
 * endpoint. That keeps the credential surface minimal: no Firebase Admin
 * service account, no APNs `.p8` file on the backend.
 *
 * Auth: Expo Push is callable anonymously, but production deployments should
 * set EXPO_ACCESS_TOKEN (a token minted in the Expo dashboard) so requests
 * are rate-limited against the project, not against the source IP.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly endpoint = "https://exp.host/--/api/v2/push/send";

  async sendNotification(
    token: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ) {
    if (!this.isExpoPushToken(token)) {
      this.logger.warn(
        `Skipping push: token does not look like an Expo push token (${token.slice(0, 12)}…)`,
      );
      return;
    }

    const message = {
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: "default",
      // High priority maps to APS `interruption-level: time-sensitive` on iOS
      // and FCM `priority: high` on Android — appropriate for call /
      // reminder pushes that should wake the device.
      priority: "high",
      channelId: "default",
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      };
      if (process.env.EXPO_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
      }

      const res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify([message]),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(
          `Expo Push HTTP ${res.status}: ${text.slice(0, 500)}`,
        );
        return;
      }

      // Expo returns `{ data: [{ status: 'ok' | 'error', ... }] }` — when
      // status is "error", surface the message and code so DeviceNotRegistered
      // and friends end up in logs and (eventually) trigger token cleanup.
      const body = (await res.json()) as {
        data?: Array<{
          status?: string;
          message?: string;
          details?: { error?: string };
        }>;
      };
      const ticket = body?.data?.[0];
      if (ticket?.status === "error") {
        this.logger.warn(
          `Expo Push error: ${ticket.message} (${ticket.details?.error ?? "unknown"})`,
        );
        return;
      }
      this.logger.log(`✅ Push sent to ${token.slice(0, 18)}…`);
    } catch (err) {
      this.logger.error(
        `Expo Push fetch failed: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private isExpoPushToken(token: string): boolean {
    return (
      typeof token === "string" &&
      (token.startsWith("ExponentPushToken[") ||
        token.startsWith("ExpoPushToken["))
    );
  }
}
