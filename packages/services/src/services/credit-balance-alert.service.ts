import { Injectable, Logger } from "@nestjs/common";
import {
  OrganizationRepository,
  User,
  UserDeviceRepository,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  NotificationService,
  OwnershipContext,
  RedisService,
  ResendProvider,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import {
  CreditAlertTier,
  LOW_BALANCE_USD,
  resolveCreditAlertTier,
} from "./credit-policy";

/**
 * Race guard only. Crossing detection already makes each tier fire once per
 * drop, so this exists to stop two debits that commit in the same instant from
 * both reporting the same crossing — not to rate-limit a workspace that has
 * genuinely topped up and fallen again.
 */
const ALERT_DEDUP_SECONDS = 60 * 60;

type UserWithEmails = User & { emails?: UserEmail[] };

interface Recipient {
  userId: string;
  email: string | null;
}

/**
 * Tells a workspace that its prepaid balance is running out, at the points
 * where that starts to mean something (BILL-019): the early warning an
 * organization gets while nothing is restricted yet, the tier where answered
 * calls start being cut off after five minutes, and the point where the
 * workspace goes inactive and no call is placed at all. The thresholds
 * themselves live in `credit-policy.ts`, shared with the call gate that
 * enforces them.
 *
 * Email always; push on top of it for every device the recipients have
 * registered. Organizations alert their admins — the people who can actually
 * top up — while a personal workspace alerts its owner.
 *
 * Everything here is best-effort: this hangs off a credit debit, and a mail or
 * push failure must never turn a settled charge into a failed one.
 */
@Injectable()
export class CreditBalanceAlertService {
  private readonly logger = new Logger(CreditBalanceAlertService.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly userDeviceRepo: UserDeviceRepository,
    private readonly notifications: NotificationService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Alert the workspace when this debit is the one that took the balance past
   * a threshold. A debit that crossed nothing is silent, so this is safe to
   * call after every single consumption.
   */
  async notifyIfCrossed(
    ctx: OwnershipContext,
    balances: { balanceBefore: number; balanceAfter: number },
  ): Promise<void> {
    try {
      const tier = resolveCreditAlertTier({
        ...balances,
        isOrganization: Boolean(ctx.organizationId),
      });
      if (!tier) return;

      if (!(await this.isFirstDelivery(ctx, tier))) {
        this.logger.debug(
          `↩️ Duplicate ${tier} balance alert suppressed for ${this.workspaceKey(ctx)}`,
        );
        return;
      }

      const recipients = await this.resolveRecipients(ctx);
      if (recipients.length === 0) {
        this.logger.warn(
          `No recipient to alert about a ${tier} balance in ${this.workspaceKey(ctx)}`,
        );
        return;
      }

      const workspaceName = await this.resolveWorkspaceName(ctx);
      const subject = this.buildSubject(tier, workspaceName);

      await Promise.allSettled([
        this.sendEmails(recipients, subject, tier, balances.balanceAfter),
        this.sendPushes(recipients, subject, tier, balances.balanceAfter),
      ]);

      this.logger.log(
        `💳 ${tier} balance alert sent to ${recipients.length} recipient(s) for ${this.workspaceKey(ctx)} ` +
          `($${balances.balanceBefore.toFixed(2)} → $${balances.balanceAfter.toFixed(2)})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send a credit balance alert for ${this.workspaceKey(ctx)}: ${(err as Error).message}`,
      );
    }
  }

  /** An organization is one workspace; a personal balance belongs to its user. */
  private workspaceKey(ctx: OwnershipContext): string {
    return ctx.organizationId
      ? `org:${ctx.organizationId}`
      : `user:${ctx.userId}`;
  }

  /**
   * False when this tier was already announced moments ago. Redis being down
   * must not silence an alert about a balance the customer cannot call on, so
   * a failure allows the send.
   */
  private async isFirstDelivery(
    ctx: OwnershipContext,
    tier: CreditAlertTier,
  ): Promise<boolean> {
    const key = `credit:balance-alert:${this.workspaceKey(ctx)}:${tier}`;
    try {
      return await this.redis.setIfAbsent(
        key,
        new Date().toISOString(),
        ALERT_DEDUP_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Dedupe check failed for ${key}: ${(err as Error).message}`,
      );
      return true;
    }
  }

  /**
   * Org admins for an organization workspace, the owner for a personal one —
   * and nothing else. An organization with no resolvable admin yields no
   * recipients rather than falling back to the member whose call caused the
   * debit: the balance and the top-up link belong to the people who can act
   * on them, and a non-admin agent is not one of them. The caller logs the
   * empty result, so the case stays visible instead of silently mis-sending.
   */
  private async resolveRecipients(ctx: OwnershipContext): Promise<Recipient[]> {
    const users = new Map<string, UserWithEmails>();

    if (ctx.organizationId) {
      // Admins are resolved by membership, not by whether they have an email:
      // one without an address still gets the push.
      const admins = await this.orgRepo.findAdminMembersWithEmails(
        ctx.organizationId,
      );
      for (const admin of admins) users.set(admin.id, admin);
    } else {
      const owner = (await this.userRepo.findById(
        ctx.userId,
      )) as UserWithEmails | null;
      if (owner) users.set(owner.id, owner);
    }

    return [...users.values()].map((user) => ({
      userId: user.id,
      email:
        user.emails?.find((e) => e.isPrimary)?.email ??
        user.emails?.[0]?.email ??
        null,
    }));
  }

  private async resolveWorkspaceName(
    ctx: OwnershipContext,
  ): Promise<string | null> {
    if (!ctx.organizationId) return null;
    const org = await this.orgRepo
      .findById(ctx.organizationId)
      .catch(() => null);
    return org?.name ?? null;
  }

  private async sendEmails(
    recipients: Recipient[],
    subject: string,
    tier: CreditAlertTier,
    balance: number,
  ): Promise<void> {
    const addresses = [
      ...new Set(
        recipients
          .map((r) => r.email?.trim().toLowerCase())
          .filter((e): e is string => Boolean(e)),
      ),
    ];
    if (addresses.length === 0) return;

    const result = await this.email.sendEmail(
      addresses,
      subject,
      this.buildHtml(tier, balance),
      "Ringee Billing",
      apiConfiguration.EMAIL_FROM_ADDRESS,
    );

    if (
      result &&
      typeof result === "object" &&
      "sent" in result &&
      result.sent === false
    ) {
      this.logger.warn(`Balance alert email (${tier}) was not sent`);
    }
  }

  /** Push is additive: a recipient with no registered device just gets email. */
  private async sendPushes(
    recipients: Recipient[],
    title: string,
    tier: CreditAlertTier,
    balance: number,
  ): Promise<void> {
    const body = this.buildPushBody(tier, balance);

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
              type: "credit_balance_alert",
              tier,
              balance: balance.toFixed(2),
            },
          }),
        ),
      );
    }
  }

  private buildSubject(
    tier: CreditAlertTier,
    workspaceName: string | null,
  ): string {
    const suffix = workspaceName ? ` — ${workspaceName}` : "";
    switch (tier) {
      case "early_warning":
        return `Your Ringee credit is running low${suffix}`;
      case "call_cap":
        return `Low credit: your calls are now cut off at 5 minutes${suffix}`;
      case "depleted":
        return `Out of credit: calling is paused${suffix}`;
    }
  }

  private buildPushBody(tier: CreditAlertTier, balance: number): string {
    const amount = formatUsd(balance);
    switch (tier) {
      case "early_warning":
        return `${amount} left. Top up to keep calling without interruptions.`;
      case "call_cap":
        return `${amount} left. Calls are now hung up automatically after 5 minutes.`;
      case "depleted":
        return "Your workspace is inactive — no outbound calls until you top up.";
    }
  }

  /**
   * Deliberately plain: what changed, what it means right now, one link. The
   * capped tier has to name the 5-minute cut-off explicitly, because that is
   * the point where a customer starts losing conversations mid-sentence and
   * would otherwise blame the line quality.
   */
  private buildHtml(tier: CreditAlertTier, balance: number): string {
    const amount = escapeHtml(formatUsd(balance));
    const topUpUrl = `${(apiConfiguration.FRONTEND_URL ?? "").replace(/\/+$/, "")}/dashboard/billing`;

    const body: Record<CreditAlertTier, string> = {
      early_warning: `
        <p>Your Ringee balance is down to <strong>${amount}</strong>.</p>
        <p>
          Nothing has changed yet. Below
          <strong>${formatUsd(LOW_BALANCE_USD)}</strong>, answered calls start
          being hung up automatically after 5 minutes, and at
          <strong>${formatUsd(0)}</strong> the workspace stops placing calls
          altogether.
        </p>`,
      call_cap: `
        <p>Your Ringee balance is down to <strong>${amount}</strong>.</p>
        <p>
          While it stays at or below
          <strong>${formatUsd(LOW_BALANCE_USD)}</strong>, every answered call is
          <strong>hung up automatically once it reaches 5 minutes</strong>. Your
          team will lose conversations mid-call until the balance is topped up.
        </p>`,
      depleted: `
        <p>Your Ringee balance is <strong>${amount}</strong>.</p>
        <p>
          The workspace is now <strong>inactive</strong>: outbound calls are
          refused, and a call already in progress is ended. Everything else —
          your numbers, contacts, campaigns and history — is untouched and
          resumes the moment credit is added.
        </p>`,
    };

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:520px;">
        ${body[tier]}
        <p><a href="${escapeHtml(topUpUrl)}">Top up your credit</a></p>
        <p style="color:#737373;">Reply to this email if you need a hand.</p>
      </div>
    `;
  }
}

/** Never show a negative balance as "-$0.30 left" — that reads as a bill. */
function formatUsd(amount: number): string {
  const safe = amount > 0 ? amount : 0;
  return `$${safe.toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
