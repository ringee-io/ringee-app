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

  /**
   * EMBEDDED Checkout Session for a monthly credit-funding SUBSCRIPTION.
   *
   * The subscription-mode analogue of `createEmbeddedCreditTopupSession`: the
   * user sets up recurring monthly funding inside the dashboard (no redirect).
   * Crediting is NEVER done here — every paid cycle (including the first) is
   * credited idempotently from the confirmed `invoice.payment_succeeded`
   * webhook via `creditTopupOnce`. Metadata lives on both the session and the
   * subscription so the webhook can resolve owner + amount from either object.
   */
  async createEmbeddedMonthlyCreditSubscriptionSession(
    userId: string,
    customerId: string,
    amountUsd: number,
    organizationId?: string | null,
    frontendOrigin?: string,
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
    const returnUrl = `${baseUrl}/dashboard/overview?payment=success&monthly_fund={CHECKOUT_SESSION_ID}`;

    const metadata: Record<string, string> = {
      userId,
      organizationId: organizationId ?? "",
      amount: String(amountUsd),
      amountCents: String(amountCents),
      amountUsd: String(amountUsd),
      type: "monthly_credit_funding",
      service: "ringee",
      fn: "creditSubscription",
    };

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "subscription",
      customer: customerId,
      redirect_on_completion: "if_required",
      return_url: returnUrl,
      metadata,
      subscription_data: { metadata },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Ringee Monthly Credit Fund",
              description: `$${amountUsd} in credits added to your account every month`,
            },
            unit_amount: amountCents,
            recurring: { interval: "month" },
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
   * Change the monthly amount of an active credit-funding subscription by
   * swapping the single item to a new inline price. Reuses the existing product
   * so we don't accumulate orphan products. Prorates the difference.
   */
  async updateMonthlyCreditSubscriptionAmount(
    subscriptionId: string,
    amountUsd: number,
  ): Promise<{ subscriptionId: string; amountUsd: number }> {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const item = sub.items.data[0];
    if (!item) {
      throw new Error(`Subscription ${subscriptionId} has no items to update.`);
    }
    const currentProductId =
      typeof item.price.product === "string"
        ? item.price.product
        : item.price.product.id;

    // Products Stripe creates on-the-fly from a Checkout `price_data.product_data`
    // are created INACTIVE. Stripe then refuses to attach the new price (for the
    // amount change) to an inactive product ("product … is marked as inactive").
    // Reactivate it first; if it was deleted entirely, mint a fresh product.
    const productId = await this.ensureActiveProduct(currentProductId, amountUsd);

    await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: item.id,
          price_data: {
            currency: "usd",
            product: productId,
            unit_amount: Math.round(amountUsd * 100),
            recurring: { interval: "month" },
          },
        },
      ],
      proration_behavior: "create_prorations",
      metadata: {
        ...sub.metadata,
        amount: String(amountUsd),
        amountUsd: String(amountUsd),
      },
    });

    return { subscriptionId, amountUsd };
  }

  /**
   * Guarantee a usable (active) product id to hang a new subscription price on.
   * Reactivates the given product if it's archived; if it no longer exists,
   * creates a fresh "Ringee Monthly Credit Fund" product and returns that id.
   */
  private async ensureActiveProduct(
    productId: string,
    amountUsd: number,
  ): Promise<string> {
    try {
      const product = await stripe.products.retrieve(productId);
      if (!product.active) {
        await stripe.products.update(productId, { active: true });
      }
      return productId;
    } catch {
      const created = await stripe.products.create({
        name: "Ringee Monthly Credit Fund",
        description: `$${amountUsd} in credits added to your account every month`,
      });
      return created.id;
    }
  }

  /**
   * Read-only snapshot of a subscription for the "monthly funding active" view:
   * next charge date, current amount, whether it's set to cancel, and the card
   * on file. `current_period_end` moved onto the item in recent API versions,
   * so we read from the item first and fall back to the subscription.
   */
  async getSubscriptionSummary(subscriptionId: string): Promise<{
    status: string;
    nextChargeDate: Date | null;
    amountUsd: number | null;
    cancelAtPeriodEnd: boolean;
    paymentMethod: { brand: string | null; last4: string | null } | null;
  }> {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method"],
    });
    const item = sub.items?.data?.[0];
    const periodEnd =
      (item as unknown as { current_period_end?: number })
        ?.current_period_end ??
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      null;
    const unitAmount = item?.price?.unit_amount ?? null;

    const pm =
      sub.default_payment_method &&
      typeof sub.default_payment_method !== "string"
        ? (sub.default_payment_method as Stripe.PaymentMethod)
        : null;

    return {
      status: sub.status,
      nextChargeDate: periodEnd ? new Date(periodEnd * 1000) : null,
      amountUsd: unitAmount != null ? unitAmount / 100 : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      paymentMethod: pm?.card
        ? { brand: pm.card.brand ?? null, last4: pm.card.last4 ?? null }
        : null,
    };
  }

  /**
   * Subscription metadata + current amount, for the invoice-driven monthly
   * crediting path. Reading the owner from the subscription (not our own
   * settings row) makes crediting resilient to webhook ordering — the first
   * invoice can land before `checkout.session.completed` writes our row.
   */
  async getSubscriptionMetadata(subscriptionId: string): Promise<{
    metadata: Record<string, string>;
    amountUsd: number | null;
  }> {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const unit = sub.items?.data?.[0]?.price?.unit_amount ?? null;
    return {
      metadata: (sub.metadata ?? {}) as Record<string, string>,
      amountUsd: unit != null ? unit / 100 : null,
    };
  }

  /**
   * Sets a payment method as the customer default and, if given, the default
   * for an active subscription. Called from the webhook after a `mode:"setup"`
   * embedded session completes, so "change payment method" never leaves the
   * dashboard.
   */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
    subscriptionId?: string | null,
  ): Promise<void> {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }
  }

  /** Retrieve the payment-method id a completed setup session attached. */
  async getSetupSessionPaymentMethodId(
    sessionId: string,
  ): Promise<string | null> {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent"],
    });
    const si = session.setup_intent;
    if (!si || typeof si === "string") return null;
    const pm = (si as Stripe.SetupIntent).payment_method;
    return typeof pm === "string" ? pm : (pm?.id ?? null);
  }

  /**
   * EMBEDDED Checkout Session in `mode:"setup"` — collects and saves a new card
   * WITHOUT charging it. Used by "change payment method" for monthly funding and
   * auto-reload. The webhook (`fn:"updateSavedPaymentMethod"`) then promotes the
   * saved card to the customer / subscription default.
   */
  async createEmbeddedCardSetupSession(
    userId: string,
    customerId: string,
    organizationId?: string | null,
    frontendOrigin?: string,
    subscriptionId?: string | null,
  ): Promise<{ clientSecret: string; sessionId: string }> {
    const baseUrl = (frontendOrigin || process.env.FRONTEND_URL!).replace(
      /\/$/,
      "",
    );
    const returnUrl = `${baseUrl}/dashboard/overview?setup=complete&card_setup={CHECKOUT_SESSION_ID}`;
    const metadata: Record<string, string> = {
      userId,
      organizationId: organizationId ?? "",
      subscriptionId: subscriptionId ?? "",
      type: "card_setup",
      service: "ringee",
      fn: "updateSavedPaymentMethod",
    };

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "setup",
      customer: customerId,
      currency: "usd",
      redirect_on_completion: "if_required",
      return_url: returnUrl,
      metadata,
      setup_intent_data: { metadata },
    });

    return {
      clientSecret: session.client_secret!,
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

  /**
   * Off-session balance-drop auto-reload charge against the customer's saved
   * card. The `customerId` and `paymentMethodId` are resolved authoritatively by
   * the caller (never from client input, never via a fuzzy `customers.search`),
   * so a charge can only ever hit the owner's own saved card. An
   * `idempotencyKey` makes a duplicated call a no-op at Stripe's edge — a second
   * safety net on top of the DB `active -> charging` lock.
   *
   * Crediting still happens ONLY from the confirmed `payment_intent.succeeded`
   * webhook (idempotent via `creditTopupOnce`). This method throws on a decline;
   * the caller marks the auto-reload `failed` / `requires_payment_method`.
   */
  async createAutoReloadCharge(params: {
    userId: string;
    customerId: string;
    paymentMethodId: string;
    amountUsd: number;
    thresholdUsd: number;
    organizationId?: string | null;
    idempotencyKey: string;
  }): Promise<{
    status: "succeeded" | "processing" | "requires_action" | "failed";
    paymentIntentId: string;
  }> {
    const {
      userId,
      customerId,
      paymentMethodId,
      amountUsd,
      thresholdUsd,
      organizationId,
      idempotencyKey,
    } = params;
    const amountCents = Math.round(amountUsd * 100);

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          userId,
          organizationId: organizationId ?? "",
          amount: String(amountUsd),
          amountCents: String(amountCents),
          thresholdAmountCents: String(Math.round(thresholdUsd * 100)),
          reloadAmountCents: String(amountCents),
          type: "auto_reload",
          service: "ringee",
          fn: "autoReloadCharge",
        },
      },
      { idempotencyKey },
    );

    return {
      status: this.mapPaymentIntentStatus(paymentIntent.status),
      paymentIntentId: paymentIntent.id,
    };
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
