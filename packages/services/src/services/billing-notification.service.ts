import { Injectable, Logger } from "@nestjs/common";
import { User, UserEmail, UserRepository } from "@ringee/database";
import { RedisService, ResendProvider } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

/** Long enough to cover Stripe's webhook retry window for a single attempt. */
const FAILED_PAYMENT_DEDUP_SECONDS = 3 * 24 * 60 * 60;

/** What the declined subscription pays for, so the email names what is at risk. */
export type FailedSubscriptionKind =
  | "credit_funding"
  | "phone_number"
  | "organization"
  | "unknown";

export interface SubscriptionPaymentFailedParams {
  /** Owner from the subscription metadata; null when Stripe has no Ringee user. */
  userId: string | null;
  /** Dedupe key together with `attemptCount` — one email per real attempt. */
  invoiceId: string;
  kind: FailedSubscriptionKind;
  /** E.164 number for `phone_number` subscriptions. */
  phoneNumber?: string | null;
  /** Amount due in major units (dollars), not cents. */
  amountDue: number | null;
  currency: string;
  /** Stripe's attempt counter for this invoice (1 = first charge attempt). */
  attemptCount: number;
  /** When Stripe will retry, if it still will. */
  nextAttemptAt: Date | null;
  hostedInvoiceUrl?: string | null;
  /** Billing address Stripe has on file; used when it differs from the app one. */
  billingEmail?: string | null;
}

type UserWithEmails = User & { emails?: UserEmail[] };

/**
 * Billing emails that are not tied to a single domain service — today, the
 * "your subscription renewal was declined" notice fired from the Stripe
 * webhook. Everything here is best-effort: a mail failure must never make the
 * webhook handler fail, or Stripe would retry the whole event.
 */
@Injectable()
export class BillingNotificationService {
  private readonly logger = new Logger(BillingNotificationService.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly userRepository: UserRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * Tells the subscription owner that Stripe could not collect a renewal and
   * that they need to update their card. Idempotent per (invoice, attempt), so
   * a replayed webhook is silent while every genuine retry is announced.
   */
  async notifySubscriptionPaymentFailed(
    params: SubscriptionPaymentFailedParams,
  ): Promise<void> {
    try {
      if (
        !(await this.isFirstDelivery(params.invoiceId, params.attemptCount))
      ) {
        this.logger.log(
          `↩️ Duplicate payment-failed email suppressed for invoice ${params.invoiceId} (attempt ${params.attemptCount})`,
        );
        return;
      }

      const recipients = await this.resolveRecipients(params);
      if (recipients.length === 0) {
        this.logger.warn(
          `No email address to warn about failed payment on invoice ${params.invoiceId} (user ${params.userId ?? "unknown"})`,
        );
        return;
      }

      const result = await this.email.sendEmail(
        recipients,
        this.buildSubject(params),
        this.buildHtml(params),
        "Ringee Billing",
        apiConfiguration.EMAIL_FROM_ADDRESS,
      );

      if (
        result &&
        typeof result === "object" &&
        "sent" in result &&
        result.sent === false
      ) {
        this.logger.warn(
          `Payment-failed email for invoice ${params.invoiceId} was not sent`,
        );
        return;
      }

      this.logger.log(
        `📧 Payment-failed email sent to ${recipients.length} address(es) for invoice ${params.invoiceId} (attempt ${params.attemptCount})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send payment-failed email for invoice ${params.invoiceId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * False when this (invoice, attempt) pair was already emailed. Redis being
   * down must not silence a genuine dunning notice, so failures allow the send.
   */
  private async isFirstDelivery(
    invoiceId: string,
    attemptCount: number,
  ): Promise<boolean> {
    const key = `billing:payment-failed:${invoiceId}:${attemptCount}`;
    try {
      return await this.redis.setIfAbsent(
        key,
        new Date().toISOString(),
        FAILED_PAYMENT_DEDUP_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Dedupe check failed for ${key}: ${(err as Error).message}`,
      );
      return true;
    }
  }

  /**
   * The owner's primary app address, plus the Stripe billing address when the
   * user set a different one for invoices.
   */
  private async resolveRecipients(
    params: SubscriptionPaymentFailedParams,
  ): Promise<string[]> {
    const addresses: (string | null | undefined)[] = [];

    if (params.userId) {
      const user = (await this.userRepository.findById(
        params.userId,
      )) as UserWithEmails | null;
      addresses.push(
        user?.emails?.find((e) => e.isPrimary)?.email ??
          user?.emails?.[0]?.email,
      );
    }
    addresses.push(params.billingEmail);

    return [
      ...new Set(
        addresses
          .filter((e): e is string => Boolean(e && e.trim()))
          .map((e) => e.trim().toLowerCase()),
      ),
    ];
  }

  private buildSubject(params: SubscriptionPaymentFailedParams): string {
    switch (params.kind) {
      case "phone_number":
        return params.phoneNumber
          ? `Payment failed for ${params.phoneNumber} — update your payment method`
          : "Payment failed for your Ringee number — update your payment method";
      case "credit_funding":
        return "Your monthly credit funding payment failed — update your payment method";
      case "organization":
        return "Your Ringee subscription payment failed — update your payment method";
      default:
        return "Your Ringee payment failed — update your payment method";
    }
  }

  /** Human name of what the declined subscription pays for. */
  private describeSubscription(
    params: SubscriptionPaymentFailedParams,
  ): string {
    switch (params.kind) {
      case "phone_number":
        return params.phoneNumber
          ? `the monthly fee for your phone number ${params.phoneNumber}`
          : "the monthly fee for your phone number";
      case "credit_funding":
        return "your monthly credit funding";
      case "organization":
        return "your Ringee subscription";
      default:
        return "your Ringee subscription";
    }
  }

  private buildHtml(params: SubscriptionPaymentFailedParams): string {
    const billingUrl = `${apiConfiguration.FRONTEND_URL?.replace(/\/+$/, "")}/dashboard/billing`;
    const amount =
      params.amountDue != null
        ? this.formatAmount(params.amountDue, params.currency)
        : null;

    const rows = [
      ["What failed", escapeHtml(this.describeSubscription(params))],
      amount ? ["Amount due", escapeHtml(amount)] : null,
      ["Attempt", String(params.attemptCount)],
      params.nextAttemptAt
        ? ["Next retry", escapeHtml(this.formatDate(params.nextAttemptAt))]
        : null,
    ]
      .filter((row): row is [string, string] => row !== null)
      .map(
        ([label, value]) => `
          <tr>
            <td style="padding:6px 12px;color:#737373;">${label}</td>
            <td style="padding:6px 12px;"><strong>${value}</strong></td>
          </tr>`,
      )
      .join("");

    // Stripe stops retrying eventually; say so plainly rather than implying the
    // charge will keep being attempted forever.
    const nextStep = params.nextAttemptAt
      ? `We'll try again on <strong>${escapeHtml(this.formatDate(params.nextAttemptAt))}</strong>. Update your card before then and the retry will go through.`
      : `We won't retry this charge automatically. Update your card to keep ${escapeHtml(this.describeSubscription(params))} active.`;

    const payNow = params.hostedInvoiceUrl
      ? `<p style="margin:16px 0 0;">
           Prefer to settle this invoice directly?
           <a href="${escapeHtml(params.hostedInvoiceUrl)}" style="color:#2563eb;">Pay it here</a>.
         </p>`
      : "";

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;max-width:560px;">
        <h2 style="margin:0 0 12px;color:#b91c1c;">Your payment failed</h2>
        <p style="margin:0 0 12px;">
          We tried to charge ${escapeHtml(this.describeSubscription(params))} and your
          payment method was declined. Nothing has been charged.
        </p>
        <table style="border-collapse:collapse;margin:12px 0;font-size:14px;">${rows}</table>
        <p style="margin:0 0 20px;">${nextStep}</p>
        <p style="margin:0 0 20px;">
          <a href="${escapeHtml(billingUrl)}"
             style="background:#171717;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600;">
            Update payment method
          </a>
        </p>
        ${payNow}
        <p style="margin-top:24px;color:#737373;font-size:12px;">
          If your card details already changed, updating them in Ringee is enough — no
          need to re-purchase anything. Reply to this email if you need a hand.
        </p>
      </div>
    `;
  }

  private formatAmount(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
