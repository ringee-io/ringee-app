import Stripe from "stripe";
import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";

const stripe = new Stripe(apiConfiguration.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

@Injectable()
export class StripeService {
  async createCustomer(
    userId: string,
    name: string,
    email?: string,
  ): Promise<{ id: string }> {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });

    return { id: customer.id };
  }

  async createOneTimePaymentSession(
    userId: string,
    customerId: string,
    amountUsd: number,
    description: string,
    organizationId?: string | null,
    frontendOrigin?: string,
  ): Promise<{
    url: string;
    sessionId: string;
    customerId: string;
    amountUsd: number;
  }> {
    const msg = `You have added ${amountUsd} credits to your Ringee balance.`;
    const baseUrl = frontendOrigin || process.env.FRONTEND_URL!;
    const callbackUrl = frontendOrigin
      ? baseUrl + "/call?"
      : baseUrl + "/dashboard/overview?";
    const cancelUrl = callbackUrl + "payment=cancel";
    const successUrl =
      callbackUrl + `payment=success&msg=${msg}&amount=${amountUsd}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        organizationId: organizationId ?? "",
        fn: "createOneTimePaymentSession",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Ringee Credit Recharge", description },
            unit_amount: Math.round(amountUsd * 100),
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
    });

    return {
      url: session.url!,
      sessionId: session.id,
      customerId,
      amountUsd,
    };
  }

  /**
   * Creates an EMBEDDED Checkout Session for a one-time credit top-up.
   *
   * Unlike `createOneTimePaymentSession` (which returns a hosted redirect URL),
   * this uses `ui_mode: "embedded"` and returns a `client_secret` the frontend
   * mounts inside the dashboard — the user never leaves Ringee. Standard card
   * payments complete inside the embedded form (`redirect_on_completion:
   * "if_required"`); only payment methods that mandate a redirect fall back to
   * `return_url`. Crediting still happens exclusively from the confirmed
   * `checkout.session.completed` webhook — this call never moves balance.
   */
  async createEmbeddedCreditTopupSession(
    userId: string,
    customerId: string,
    amountUsd: number,
    description: string,
    organizationId?: string | null,
    frontendOrigin?: string,
    /**
     * When true, the card used for this checkout is saved on the customer for
     * future off-session top-ups (`setup_future_usage: "off_session"`). Driven
     * by an explicit consent checkbox rendered in the Ringee shell — never
     * saved without it.
     */
    savePaymentMethod: boolean = false,
  ): Promise<{
    clientSecret: string;
    sessionId: string;
    amountUsd: number;
    amountCents: number;
  }> {
    const amountCents = Math.round(amountUsd * 100);
    const baseUrl = (frontendOrigin || process.env.FRONTEND_URL!).replace(
      /\/$/,
      "",
    );
    // Only used for payment methods that force a redirect. Standard cards
    // complete in place and fire the client `onComplete` callback instead.
    const returnUrl = `${baseUrl}/dashboard/overview?payment=success&credit_topup={CHECKOUT_SESSION_ID}`;

    // Attached to BOTH the session and the underlying payment intent so the
    // webhook can read it from either object.
    const metadata: Record<string, string> = {
      userId,
      organizationId: organizationId ?? "",
      amount: String(amountUsd),
      amountCents: String(amountCents),
      type: "credit_topup",
      service: "ringee",
      rechargeMode: "embedded_checkout",
      // Kept so the existing webhook routing (`fn`) keeps working unchanged.
      fn: "createOneTimePaymentSession",
    };

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      customer: customerId,
      redirect_on_completion: "if_required",
      return_url: returnUrl,
      metadata,
      payment_intent_data: {
        metadata,
        // Save the card for future one-click recharges only with consent. The
        // consent checkbox lives in the Ringee shell (not Stripe's own UI), so
        // this flag is the single source of truth for whether we persist it.
        ...(savePaymentMethod
          ? { setup_future_usage: "off_session" as const }
          : {}),
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Ringee Credit Top-up", description },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
    });

    return {
      clientSecret: session.client_secret!,
      sessionId: session.id,
      amountUsd,
      amountCents,
    };
  }

  /**
   * Lightweight status read for an embedded credit checkout session. The
   * frontend polls this after `onComplete` to confirm payment before showing a
   * success state — it never trusts the client alone.
   */
  async getCreditCheckoutStatus(sessionId: string): Promise<{
    sessionId: string;
    status: string | null;
    paymentStatus: string | null;
    amountTotalUsd: number | null;
  }> {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      sessionId: session.id,
      status: session.status ?? null,
      paymentStatus: session.payment_status ?? null,
      amountTotalUsd:
        session.amount_total != null ? session.amount_total / 100 : null,
    };
  }

  /**
   * Resolves the customer's reusable saved card for the one-click recharge
   * path. Prefers the customer's default payment method; otherwise falls back
   * to the most recently attached card. Returns display fields plus the
   * payment-method id (the id is used server-side only — never sent to the
   * browser).
   */
  async getSavedPaymentMethod(customerId: string): Promise<{
    hasSavedMethod: boolean;
    paymentMethodId: string | null;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  }> {
    const none = {
      hasSavedMethod: false,
      paymentMethodId: null,
      brand: null,
      last4: null,
      expMonth: null,
      expYear: null,
    };

    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });

    // Deleted customers come back as `{ deleted: true }`.
    if (!customer || (customer as Stripe.DeletedCustomer).deleted) {
      return none;
    }

    const c = customer as Stripe.Customer;
    let pm: Stripe.PaymentMethod | null =
      c.invoice_settings?.default_payment_method &&
      typeof c.invoice_settings.default_payment_method !== "string"
        ? (c.invoice_settings.default_payment_method as Stripe.PaymentMethod)
        : null;

    // No explicit default — fall back to the newest attached card.
    if (!pm) {
      const list = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });
      pm = list.data[0] ?? null;
    }

    if (!pm || !pm.card) {
      return none;
    }

    return {
      hasSavedMethod: true,
      paymentMethodId: pm.id,
      brand: pm.card.brand ?? null,
      last4: pm.card.last4 ?? null,
      expMonth: pm.card.exp_month ?? null,
      expYear: pm.card.exp_year ?? null,
    };
  }

  /**
   * One-click recharge against a saved card. Creates and confirms an
   * off-session PaymentIntent server-side; the payment-method id is resolved
   * from the customer by the caller, never supplied by the client, so a user
   * can only ever charge their own saved card. Credits are added ONLY by the
   * confirmed `payment_intent.succeeded` webhook — this call never moves
   * balance.
   *
   * If the card requires 3-D Secure, the off-session confirm throws a
   * `StripeCardError` carrying the pending PaymentIntent; we surface its
   * `client_secret` as `requires_action` so the browser can complete
   * authentication in place. Any other failure maps to `failed`, and the
   * frontend falls back to entering a new card via embedded checkout.
   */
  async createSavedCardTopupIntent(params: {
    userId: string;
    customerId: string;
    paymentMethodId: string;
    amountUsd: number;
    organizationId?: string | null;
  }): Promise<{
    status: "succeeded" | "processing" | "requires_action" | "failed";
    paymentIntentId: string | null;
    clientSecret: string | null;
  }> {
    const { userId, customerId, paymentMethodId, amountUsd, organizationId } =
      params;
    const amountCents = Math.round(amountUsd * 100);

    const metadata: Record<string, string> = {
      userId,
      organizationId: organizationId ?? "",
      amount: String(amountUsd),
      amountCents: String(amountCents),
      type: "credit_topup",
      service: "ringee",
      rechargeMode: "saved_payment_method",
      fn: "creditTopupSavedCard",
    };

    try {
      const pi = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata,
      });

      return {
        status: this.mapPaymentIntentStatus(pi.status),
        paymentIntentId: pi.id,
        clientSecret:
          pi.status === "requires_action" ? (pi.client_secret ?? null) : null,
      };
    } catch (err) {
      const pi = (err as Stripe.errors.StripeCardError)?.payment_intent as
        | Stripe.PaymentIntent
        | undefined;
      if (pi?.status === "requires_action") {
        return {
          status: "requires_action",
          paymentIntentId: pi.id,
          clientSecret: pi.client_secret ?? null,
        };
      }
      return {
        status: "failed",
        paymentIntentId: pi?.id ?? null,
        clientSecret: null,
      };
    }
  }

  /**
   * Server-authoritative status read for a saved-card top-up PaymentIntent.
   * The frontend polls this after completing 3-D Secure so it never trusts the
   * client-side result on its own.
   */
  async getPaymentIntentStatus(paymentIntentId: string): Promise<{
    paymentIntentId: string;
    status: "succeeded" | "processing" | "requires_action" | "failed";
    amountUsd: number | null;
  }> {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      paymentIntentId: pi.id,
      status: this.mapPaymentIntentStatus(pi.status),
      amountUsd: pi.amount != null ? pi.amount / 100 : null,
    };
  }

  private mapPaymentIntentStatus(
    status: Stripe.PaymentIntent.Status,
  ): "succeeded" | "processing" | "requires_action" | "failed" {
    switch (status) {
      case "succeeded":
        return "succeeded";
      case "processing":
        return "processing";
      case "requires_action":
      case "requires_confirmation":
        return "requires_action";
      default:
        // requires_payment_method, canceled, requires_capture, …
        return "failed";
    }
  }

  async createPhoneNumberSubscriptionSession(
    customerId: string,
    phoneNumber: string,
    monthlyCostUsd: number,
    upfrontCostUsd: number = 0,
    userId: string,
    organizationId?: string | null,
    frontendOrigin?: string,
    /**
     * Optional override for the post-checkout redirect. Defaults to the
     * `/dashboard/buy-number` flow; Ringee Infra passes its own `/infra/overview`
     * URLs so the purchase stays inside the Infra console. Stripe substitutes
     * `{CHECKOUT_SESSION_ID}` in `successUrl` at redirect time.
     */
    returnUrls?: { successUrl: string; cancelUrl: string },
  ): Promise<{
    url: string;
    sessionId: string;
    customerId: string;
    phoneNumber: string;
    monthlyCostUsd: number;
    upfrontCostUsd: number;
  }> {
    const msg = `Your phone number ${phoneNumber} has been added to your account.`;
    const baseUrl = frontendOrigin || process.env.FRONTEND_URL!;
    const callbackUrl = baseUrl + "/dashboard/buy-number";
    const cancelUrl =
      returnUrls?.cancelUrl ?? callbackUrl + "?tab=buy&payment=cancel";
    const successUrl =
      returnUrls?.successUrl ??
      callbackUrl +
        `?tab=my-numbers&payment=success&msg=${msg}&numberId=${phoneNumber}&amount=${upfrontCostUsd}`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          userId,
          organizationId: organizationId ?? "",
          phoneNumber,
          monthlyCostUsd,
          upfrontCostUsd,
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Phone Number ${phoneNumber} (Monthly Fee)`,
              description:
                "Recurring monthly subscription for your phone number",
            },
            unit_amount: Math.round(monthlyCostUsd * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
        ...(upfrontCostUsd > 0
          ? [
              {
                price_data: {
                  currency: "usd",
                  product_data: {
                    name: `Phone Number ${phoneNumber} (Setup Fee)`,
                    description: "One-time activation fee for this number",
                  },
                  unit_amount: Math.round(upfrontCostUsd * 100),
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      allow_promotion_codes: true,
    });

    return {
      url: session.url!,
      sessionId: session.id,
      customerId,
      phoneNumber,
      monthlyCostUsd,
      upfrontCostUsd,
    };
  }

  async createOrganizationSubscriptionSession(
    customerId: string,
    userId: string,
    billingInterval: "month" | "year" = "month",
    frontendOrigin?: string,
  ): Promise<{
    url: string;
    sessionId: string;
  }> {
    const msg = "Organization subscription added successfully";
    const baseUrl = frontendOrigin || process.env.FRONTEND_URL!;
    const callbackUrl = baseUrl + "/dashboard/overview";
    const cancelUrl = callbackUrl + "?payment=cancel";
    const successUrl = callbackUrl + `?payment=success&msg=${msg}`;

    // $20/month, or $200/year (billed annually = two months free) to reward
    // the longer commitment. The interval flows through to the Stripe Price so
    // the customer is charged on the cadence they chose.
    const isAnnual = billingInterval === "year";
    const unitAmount = isAnnual ? 20000 : 2000;
    const description = isAnnual
      ? "Annual subscription to create and manage organizations (2 months free)"
      : "Monthly subscription to create and manage organizations";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          userId,
          type: "organization",
          billingInterval,
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Ringee Organization Plan",
              description,
            },
            unit_amount: unitAmount,
            recurring: { interval: billingInterval },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
    });

    return {
      url: session.url!,
      sessionId: session.id,
    };
  }

  async createMonthlyCreditSubscriptionSession(
    customerId: string,
    userId: string,
    amountUsd: number,
    organizationId?: string | null,
    frontendOrigin?: string,
  ): Promise<{
    url: string;
    sessionId: string;
  }> {
    const msg = `Monthly credit fund of $${amountUsd} activated successfully.`;
    const baseUrl = frontendOrigin || process.env.FRONTEND_URL!;
    const callbackUrl = frontendOrigin
      ? baseUrl + "/call?"
      : baseUrl + "/dashboard/overview?";
    const cancelUrl = callbackUrl + "payment=cancel";
    const successUrl =
      callbackUrl +
      `payment=success&msg=${encodeURIComponent(msg)}&amount=${amountUsd}`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        organizationId: organizationId ?? "",
        fn: "creditSubscription",
        amountUsd: String(amountUsd),
      },
      subscription_data: {
        metadata: {
          userId,
          organizationId: organizationId ?? "",
          fn: "creditSubscription",
          amountUsd: String(amountUsd),
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Ringee Monthly Credit Fund",
              description: `$${amountUsd} in credits added to your account every month`,
            },
            unit_amount: Math.round(amountUsd * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
    });

    return {
      url: session.url!,
      sessionId: session.id,
    };
  }

  async createAutoReloadSetupSession(
    customerId: string,
    userId: string,
    reloadAmount: number,
    organizationId?: string | null,
    frontendOrigin?: string,
  ): Promise<{
    url: string;
    sessionId: string;
  }> {
    const msg = `Auto-reload enabled. $${reloadAmount} will be added when your balance is low.`;
    const baseUrl = frontendOrigin || process.env.FRONTEND_URL!;
    const callbackUrl = frontendOrigin
      ? baseUrl + "/call?"
      : baseUrl + "/dashboard/overview?";
    const cancelUrl = callbackUrl + "payment=cancel";
    const successUrl =
      callbackUrl +
      `payment=success&msg=${encodeURIComponent(msg)}&amount=${reloadAmount}&autoReload=true`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          userId,
          organizationId: organizationId ?? "",
          fn: "autoReloadSetup",
        },
      },
      metadata: {
        userId,
        organizationId: organizationId ?? "",
        fn: "autoReloadSetup",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Ringee Credit Auto-Reload",
              description:
                "Initial reload. Your card will be saved for future automatic reloads.",
            },
            unit_amount: Math.round(reloadAmount * 100),
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
    });

    return {
      url: session.url!,
      sessionId: session.id,
    };
  }

  async chargeOffSession(
    userId: string,
    amountUsd: number,
    organizationId?: string,
  ): Promise<{ paymentIntentId: string }> {
    // Find the customer ID from Stripe by searching for the user
    const customers = await stripe.customers.search({
      query: `metadata["userId"]:"${userId}"`,
      limit: 1,
    });

    if (!customers.data.length) {
      throw new Error(`No Stripe customer found for user ${userId}`);
    }

    const customer = customers.data[0];

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountUsd * 100),
      currency: "usd",
      customer: customer.id,
      off_session: true,
      confirm: true,
      metadata: {
        userId,
        organizationId: organizationId ?? "",
        fn: "autoReloadCharge",
      },
    });

    return { paymentIntentId: paymentIntent.id };
  }

  async cancelSubscription(
    subscriptionId: string,
  ): Promise<{ subscriptionId: string; canceledAt: Date | null }> {
    const canceled = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    return {
      subscriptionId,
      canceledAt: canceled.cancel_at
        ? new Date(canceled.cancel_at * 1000)
        : null,
    };
  }

  async getCheckoutSessionDetails(sessionId: string): Promise<{
    sessionId: string;
    mode: string;
    paymentStatus: string;
    amountTotalUsd: number | null;
    customerId: string | null;
  }> {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      sessionId: session.id,
      mode: session.mode!,
      paymentStatus: session.payment_status!,
      amountTotalUsd: session.amount_total
        ? session.amount_total / 100
        : session.amount_total,
      customerId:
        typeof session.customer === "string" ? session.customer : null,
    };
  }

  validateWebhook(
    rawBody: Buffer,
    signature: string,
    endpointSecret: string,
  ): Stripe.Event {
    return stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  }
}
