import { Injectable, Logger } from "@nestjs/common";
import {
  CustomIntegration,
  CustomIntegrationDelivery,
  OrganizationRepository,
  User,
  UserDeviceRepository,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  NotificationService,
  RedisService,
  ResendProvider,
} from "@ringee/platform";

// One alert per integration per window — a dead endpoint fails every queued
// delivery, and the owner only needs to hear about it once until it recovers.
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

type UserWithEmails = User & { emails: UserEmail[] };

interface Recipient {
  userId: string;
  email: string | null;
  name: string | null;
}

/**
 * Tells the workspace that owns a custom integration when webhook delivery to
 * their endpoint has permanently failed (all retries exhausted): email always,
 * plus a push to every active device the recipients have registered.
 *
 * Organization integrations alert the org admins (and the integration owner);
 * personal integrations alert the owner only. Everything here is best-effort —
 * a notification failure must never affect delivery processing.
 */
@Injectable()
export class CustomIntegrationFailureNotifierService {
  private readonly logger = new Logger(
    CustomIntegrationFailureNotifierService.name,
  );
  private readonly emailProvider = new ResendProvider();

  constructor(
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly userDeviceRepo: UserDeviceRepository,
    private readonly notifications: NotificationService,
    private readonly redis: RedisService,
  ) {}

  async notifyDeliveryFailed(
    integration: CustomIntegration,
    delivery: CustomIntegrationDelivery,
    error: string,
  ): Promise<void> {
    try {
      if (await this.inCooldown(integration.id)) return;

      const recipients = await this.resolveRecipients(integration);
      if (recipients.length === 0) {
        this.logger.warn(
          `No recipients to alert for failed webhook of integration ${integration.id}`,
        );
        return;
      }

      const subject = `Webhook delivery failing for "${integration.name}"`;
      await Promise.allSettled([
        this.sendEmails(recipients, subject, integration, delivery, error),
        this.sendPushes(recipients, subject, integration, error),
      ]);
    } catch (err) {
      this.logger.error(
        `Failed to send webhook-failure alert for integration ${integration.id}: ${(err as Error).message}`,
      );
    }
  }

  /** True when an alert for this integration already went out recently. */
  private async inCooldown(integrationId: string): Promise<boolean> {
    const key = `custom-integrations:failure-alert:${integrationId}`;
    try {
      if (await this.redis.get(key)) return true;
      await this.redis.set(key, new Date().toISOString(), ALERT_COOLDOWN_MS);
      return false;
    } catch (err) {
      // Redis being down should not silence the alert entirely.
      this.logger.warn(
        `Cooldown check failed for ${key}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async resolveRecipients(
    integration: CustomIntegration,
  ): Promise<Recipient[]> {
    const users = new Map<string, UserWithEmails>();

    const owner = await this.userRepo.findById(integration.userId);
    if (owner) users.set(owner.id, owner as UserWithEmails);

    if (integration.organizationId) {
      const admins = await this.orgRepo.findAdminMembersWithEmails(
        integration.organizationId,
      );
      for (const admin of admins) users.set(admin.id, admin);
    }

    return [...users.values()].map((user) => ({
      userId: user.id,
      email:
        user.emails?.find((e) => e.isPrimary)?.email ??
        user.emails?.[0]?.email ??
        null,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        null,
    }));
  }

  private async sendEmails(
    recipients: Recipient[],
    subject: string,
    integration: CustomIntegration,
    delivery: CustomIntegrationDelivery,
    error: string,
  ): Promise<void> {
    const emails = recipients
      .map((r) => r.email)
      .filter((e): e is string => Boolean(e));
    if (emails.length === 0) return;

    const html = this.buildEmailHtml(integration, delivery, error);
    const result = await this.emailProvider.sendEmail(
      emails,
      subject,
      html,
      "no-reply",
      "no-reply@notifications.ringee.io",
    );
    if (
      result &&
      typeof result === "object" &&
      "sent" in result &&
      result.sent === false
    ) {
      this.logger.warn(
        `Webhook-failure email for integration ${integration.id} was not sent`,
      );
      return;
    }
    this.logger.log(
      `Webhook-failure email sent to ${emails.length} recipient(s) for integration ${integration.id}`,
    );
  }

  private async sendPushes(
    recipients: Recipient[],
    title: string,
    integration: CustomIntegration,
    error: string,
  ): Promise<void> {
    const body =
      `Ringee couldn't deliver events to your endpoint: ${error}`.slice(0, 140);
    for (const recipient of recipients) {
      const devices = await this.userDeviceRepo
        .findActiveByUser(recipient.userId)
        .catch(() => []);
      if (devices.length === 0) continue;
      await Promise.allSettled(
        devices.map((device) =>
          this.notifications.sendNotification(device.fcmToken, {
            title,
            body,
            data: {
              type: "custom_integration_webhook_failed",
              integrationId: integration.id,
            },
          }),
        ),
      );
    }
  }

  private buildEmailHtml(
    integration: CustomIntegration,
    delivery: CustomIntegrationDelivery,
    error: string,
  ): string {
    const esc = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #b91c1c;">Webhook delivery is failing</h2>
        <p>
          Ringee could not deliver events for your custom integration
          <strong>${esc(integration.name)}</strong> after several retries.
          New events will keep being attempted, but your endpoint is currently
          not receiving them.
        </p>
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 6px 8px; color: #6b7280;">Endpoint</td>
            <td style="padding: 6px 8px;"><code>${esc(delivery.destinationUrl)}</code></td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; color: #6b7280;">Event</td>
            <td style="padding: 6px 8px;">${esc(delivery.eventType)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; color: #6b7280;">Attempts</td>
            <td style="padding: 6px 8px;">${delivery.attemptCount + 1}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; color: #6b7280;">Last error</td>
            <td style="padding: 6px 8px;">${esc(error)}</td>
          </tr>
        </table>
        <p style="margin-top: 16px;">
          Please check that your endpoint is reachable and returns a 2xx
          response. You can send a test event from the integration settings in
          Ringee to verify the fix.
        </p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
          You are receiving this because you own or administer this Ringee
          workspace.
        </p>
      </div>
    `;
  }
}
