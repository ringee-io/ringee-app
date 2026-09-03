import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgent,
  AiVoiceAgentCall,
  OrganizationRepository,
  User,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  NotificationService,
  OwnershipContext,
  RedisService,
  ResendProvider,
} from "@ringee/platform";
import { UserDeviceService } from "../user.device.service";

/** One support notification per conversation, including provider retries. */
const SUPPORT_REQUEST_DEDUP_SECONDS = 24 * 60 * 60;

type UserWithEmails = User & { emails?: UserEmail[] };

interface Recipient {
  userId: string;
  email: string | null;
}

export interface VoiceAgentSupportContact {
  id: string | null;
  name: string | null;
  phoneNumber: string;
  email: string | null;
  company: string | null;
}

export interface VoiceAgentSupportDelivery {
  delivered: boolean;
  duplicate: boolean;
  recipientCount: number;
}

/**
 * Delivers the human follow-up an AI voice agent requests.
 *
 * Organization calls notify only resolved organization admins. Personal calls
 * notify their owner. Email is the durable/default channel; push is additive
 * for every active device. Delivery is best-effort so a notification provider
 * failure never interrupts the live phone conversation.
 */
@Injectable()
export class VoiceAgentHumanSupportService {
  private readonly logger = new Logger(VoiceAgentHumanSupportService.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly devices: UserDeviceService,
    private readonly notifications: NotificationService,
    private readonly redis: RedisService,
  ) {}

  async notify(params: {
    ctx: OwnershipContext;
    agent: AiVoiceAgent;
    call: AiVoiceAgentCall;
    contact: VoiceAgentSupportContact;
    subject: string;
    message: string;
  }): Promise<VoiceAgentSupportDelivery> {
    const key = `voice-agent:human-support:${params.call.id}`;

    try {
      if (!(await this.claim(key))) {
        return { delivered: true, duplicate: true, recipientCount: 0 };
      }

      const recipients = await this.resolveRecipients(params.ctx);
      if (recipients.length === 0) {
        await this.release(key);
        this.logger.warn(
          `No recipient for human support requested by agent call ${params.call.id}`,
        );
        return { delivered: false, duplicate: false, recipientCount: 0 };
      }

      const title = `Human support requested — ${params.subject}`;
      const [emailResult, pushResult] = await Promise.allSettled([
        this.sendEmails(recipients, title, params),
        this.sendPushes(recipients, title, params),
      ]);
      const emailSent =
        emailResult.status === "fulfilled" && emailResult.value === true;
      const pushesAttempted =
        pushResult.status === "fulfilled" ? pushResult.value : 0;

      if (!emailSent && pushesAttempted === 0) {
        // No recipient had a usable channel. Let a later provider retry make
        // another attempt instead of treating this request as delivered.
        await this.release(key);
        this.logger.warn(
          `No usable delivery channel for human support on agent call ${params.call.id}`,
        );
        return {
          delivered: false,
          duplicate: false,
          recipientCount: recipients.length,
        };
      }

      this.logger.log(
        `Human support requested for agent call ${params.call.id}; notified ${recipients.length} recipient(s)`,
      );
      return {
        delivered: true,
        duplicate: false,
        recipientCount: recipients.length,
      };
    } catch (error) {
      await this.release(key);
      this.logger.error(
        `Could not notify human support for agent call ${params.call.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { delivered: false, duplicate: false, recipientCount: 0 };
    }
  }

  private async claim(key: string): Promise<boolean> {
    try {
      return await this.redis.setIfAbsent(
        key,
        new Date().toISOString(),
        SUPPORT_REQUEST_DEDUP_SECONDS,
      );
    } catch (error) {
      // Redis protects against duplicate alerts; it must not silence the only
      // alert when unavailable.
      this.logger.warn(
        `Human-support dedupe failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }
  }

  private async release(key: string): Promise<void> {
    await this.redis.del(key).catch(() => undefined);
  }

  private async resolveRecipients(ctx: OwnershipContext): Promise<Recipient[]> {
    const users = new Map<string, UserWithEmails>();

    if (ctx.organizationId) {
      const admins = await this.organizations.findAdminMembersWithEmails(
        ctx.organizationId,
      );
      for (const admin of admins) users.set(admin.id, admin);
    } else {
      const owner = (await this.users.findById(
        ctx.userId,
      )) as UserWithEmails | null;
      if (owner) users.set(owner.id, owner);
    }

    return [...users.values()].map((user) => ({
      userId: user.id,
      email:
        user.emails?.find((email) => email.isPrimary)?.email ??
        user.emails?.[0]?.email ??
        null,
    }));
  }

  private async sendEmails(
    recipients: Recipient[],
    subject: string,
    params: {
      agent: AiVoiceAgent;
      call: AiVoiceAgentCall;
      contact: VoiceAgentSupportContact;
      message: string;
    },
  ): Promise<boolean> {
    const addresses = [
      ...new Set(
        recipients
          .map((recipient) => recipient.email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    ];
    if (addresses.length === 0) return false;

    const result = await this.email.sendEmail(
      addresses,
      subject,
      this.buildEmailHtml(params),
      "Ringee Voice Agents",
      apiConfiguration.EMAIL_FROM_ADDRESS,
    );
    if (!result || typeof result !== "object") return false;
    if ("sent" in result && result.sent === false) return false;
    if ("error" in result && result.error) return false;
    return true;
  }

  private async sendPushes(
    recipients: Recipient[],
    title: string,
    params: {
      agent: AiVoiceAgent;
      call: AiVoiceAgentCall;
      contact: VoiceAgentSupportContact;
      message: string;
    },
  ): Promise<number> {
    const contact = params.contact.name || params.contact.phoneNumber;
    const body = `${contact}: ${params.message}`.slice(0, 180);
    let attempted = 0;

    for (const recipient of recipients) {
      const devices = await this.devices
        .findActiveByUser(recipient.userId)
        .catch(() => []);
      attempted += devices.length;
      await Promise.allSettled(
        devices.map((device) =>
          this.notifications.sendNotification(device.fcmToken, {
            title,
            body,
            data: {
              type: "voice_agent_human_support",
              agentId: params.agent.id,
              agentCallId: params.call.id,
              ...(params.call.callId ? { callId: params.call.callId } : {}),
              ...(params.contact.id ? { contactId: params.contact.id } : {}),
            },
          }),
        ),
      );
    }
    return attempted;
  }

  private buildEmailHtml(params: {
    agent: AiVoiceAgent;
    call: AiVoiceAgentCall;
    contact: VoiceAgentSupportContact;
    message: string;
  }): string {
    const contactRows = [
      ["Name", params.contact.name],
      ["Phone", params.contact.phoneNumber],
      ["Email", params.contact.email],
      ["Company", params.contact.company],
    ]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#737373;">${escapeHtml(label)}</td><td style="padding:4px 0;">${escapeHtml(value)}</td></tr>`,
      )
      .join("");
    const callUrl = params.call.callId
      ? `${apiConfiguration.FRONTEND_URL.replace(/\/+$/, "")}/dashboard/call/${params.call.callId}`
      : null;

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:600px;">
        <p>An AI voice agent requested human follow-up during a live conversation.</p>
        <p style="white-space:pre-wrap;"><strong>What happened</strong><br>${escapeHtml(params.message)}</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#737373;">Agent</td><td style="padding:4px 0;">${escapeHtml(params.agent.name)}</td></tr>
          ${contactRows}
        </table>
        ${callUrl ? `<p><a href="${escapeHtml(callUrl)}">Open the call in Ringee</a></p>` : ""}
      </div>
    `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
