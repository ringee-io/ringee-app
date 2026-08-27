import { Injectable, Logger } from "@nestjs/common";
import { User, UserEmail, UserRepository } from "@ringee/database";
import { RedisService, ResendProvider } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

/** Long enough to cover Stripe's webhook retry window for a single attempt. */
const FAILED_PAYMENT_DEDUP_SECONDS = 3 * 24 * 60 * 60;

/**
 * Race guard only. "First ever" is decided from the subscription table, so this
 * exists to stop two subscriptions created for the same user in the same
 * instant from both being welcomed.
 */
const SUBSCRIPTION_WELCOME_DEDUP_SECONDS = 30 * 24 * 60 * 60;

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
  /** Stripe-hosted page to settle this invoice with a new card. */
  hostedInvoiceUrl?: string | null;
  /** Billing address Stripe has on file; used when it differs from the app one. */
  billingEmail?: string | null;
}

export interface OrganizationSubscriptionStartedParams {
  /** Owner from the subscription metadata. */
  userId: string;
  /** Stripe subscription id — the dedupe key for this welcome. */
  subscriptionId: string;
  /** Cadence chosen at checkout; anything else is treated as monthly. */
  billingInterval?: string | null;
  /** Price per cycle in major units (dollars), not cents. */
  amount?: number | null;
  currency?: string;
}

type UserWithEmails = User & { emails?: UserEmail[] };

/**
 * Billing emails that are not tied to a single domain service: the "your
 * subscription renewal was declined" notice and the welcome a customer gets the
 * first time they subscribe to the Organization plan — both fired from the
 * Stripe webhook. Everything here is best-effort: a mail failure must never make
 * the webhook handler fail, or Stripe would retry the whole event.
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
   * Welcomes a customer the first time they subscribe to the Organization plan.
   * The caller decides what "first time" means (no prior subscription row); this
   * only guards the race, so a user who cancels and comes back is never
   * welcomed twice.
   *
   * The mail is blind-copied to Trustpilot's invitation address when one is
   * configured, which is what turns it into a review invitation for this
   * customer. That is also why it goes to a single recipient: Trustpilot invites
   * the address in `To`.
   */
  async notifyOrganizationSubscriptionStarted(
    params: OrganizationSubscriptionStartedParams,
  ): Promise<void> {
    try {
      if (!(await this.isFirstWelcome(params.userId))) {
        this.logger.log(
          `↩️ Duplicate organization-subscription welcome suppressed for user ${params.userId}`,
        );
        return;
      }

      const user = (await this.userRepository.findById(
        params.userId,
      )) as UserWithEmails | null;
      const recipient = (
        user?.emails?.find((e) => e.isPrimary)?.email ??
        user?.emails?.[0]?.email
      )
        ?.trim()
        .toLowerCase();

      if (!recipient) {
        this.logger.warn(
          `No email address to welcome user ${params.userId} to the Organization plan`,
        );
        return;
      }

      const bcc = apiConfiguration.TRUSTPILOT_INVITE_BCC_EMAIL?.trim();

      const result = await this.email.sendEmail(
        recipient,
        "Welcome to Ringee — your organization is ready to set up",
        this.buildWelcomeHtml(params, user?.firstName ?? null),
        "Ringee",
        apiConfiguration.EMAIL_FROM_ADDRESS,
        undefined,
        undefined,
        bcc || undefined,
      );

      if (
        result &&
        typeof result === "object" &&
        "sent" in result &&
        result.sent === false
      ) {
        this.logger.warn(
          `Organization-subscription welcome for user ${params.userId} was not sent`,
        );
        return;
      }

      this.logger.log(
        `📧 Organization-subscription welcome sent to user ${params.userId} for subscription ${params.subscriptionId}` +
          (bcc ? " (Trustpilot invitation requested)" : ""),
      );
    } catch (err) {
      this.logger.error(
        `Failed to send the organization-subscription welcome for user ${params.userId}: ${(err as Error).message}`,
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
   * False when this user was already welcomed. Redis being down must not cost a
   * genuine customer their welcome, so failures allow the send — the caller's
   * "no prior subscription" check is what actually keeps this to once.
   */
  private async isFirstWelcome(userId: string): Promise<boolean> {
    const key = `billing:org-subscription-welcome:${userId}`;
    try {
      return await this.redis.setIfAbsent(
        key,
        new Date().toISOString(),
        SUBSCRIPTION_WELCOME_DEDUP_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Dedupe check failed for ${key}: ${(err as Error).message}`,
      );
      return true;
    }
  }

  /**
   * Same plain house style as the dunning email: a short note and one link.
   * Creating the organization is the step the customer still has to take after
   * paying, so that is the only thing this asks them to do.
   */
  private buildWelcomeHtml(
    params: OrganizationSubscriptionStartedParams,
    firstName: string | null,
  ): string {
    const greeting = firstName?.trim()
      ? `Hi ${escapeHtml(firstName.trim())},`
      : "Hi,";
    const price =
      params.amount != null
        ? ` (${this.formatAmount(params.amount, params.currency ?? "usd")}${
            params.billingInterval === "year" ? " a year" : " a month"
          })`
        : "";
    const dashboardUrl = `${apiConfiguration.FRONTEND_URL?.replace(/\/+$/, "")}/dashboard/overview`;

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:520px;">
        <p>${greeting}</p>
        <p>Your Ringee Organization plan${price} is active. Thanks for subscribing.</p>
        <p>The next step is creating your organization — that unlocks unlimited team members, campaigns and outreach, cheaper per-minute rates and advanced analytics.</p>
        <p><a href="${escapeHtml(dashboardUrl)}">Create your organization</a></p>
        <p>You can cancel any time from Billing.</p>
        <p style="color:#737373;">Reply to this email if you need a hand getting set up.</p>
      </div>
    `;
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
          ? `Payment failed for ${params.phoneNumber}`
          : "Payment failed for your Ringee number";
      case "credit_funding":
        return "Your monthly credit funding payment failed";
      case "organization":
        return "Your Ringee subscription payment failed";
      default:
        return "Your Ringee payment failed";
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

  /**
   * Deliberately plain: a few sentences and one link, so it reads like a note
   * from a person rather than a marketing blast — which is also what keeps it
   * out of the spam folder.
   */
  private buildHtml(params: SubscriptionPaymentFailedParams): string {
    // Stripe's hosted invoice page settles the outstanding charge with a new
    // card in one step, so it beats sending people into the dashboard. It only
    // exists once the invoice is finalized — fall back to our billing page.
    const invoiceUrl = params.hostedInvoiceUrl?.trim();
    const link = invoiceUrl
      ? { url: invoiceUrl, label: "Pay the invoice with another card" }
      : {
          url: `${apiConfiguration.FRONTEND_URL?.replace(/\/+$/, "")}/dashboard/billing`,
          label: "Update your payment method",
        };
    const amount =
      params.amountDue != null
        ? ` (${this.formatAmount(params.amountDue, params.currency)})`
        : "";
    const what = escapeHtml(this.describeSubscription(params) + amount);

    // Stripe stops retrying eventually; say so plainly rather than implying the
    // charge will keep being attempted forever. The wording has to agree with
    // the link below — paying the invoice is immediate, our billing page only
    // fixes the card in time for the retry.
    const nextStep = params.nextAttemptAt
      ? `We'll try again on ${escapeHtml(this.formatDate(params.nextAttemptAt))}${
          invoiceUrl
            ? ", or you can settle it now:"
            : ". If you update your card before then, the retry will go through."
        }`
      : `We won't retry this charge automatically${
          invoiceUrl
            ? ", so it needs to be paid to keep it active:"
            : ". Update your card to keep it active."
        }`;

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:520px;">
        <p>We tried to charge ${what} and your card was declined.</p>
        <p>${nextStep}</p>
        <p><a href="${escapeHtml(link.url)}">${link.label}</a></p>
        <p style="color:#737373;">Reply to this email if you need a hand.</p>
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
