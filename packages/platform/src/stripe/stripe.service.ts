import Stripe from "stripe";
import { BadRequestException, Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";

const stripe = new Stripe(apiConfiguration.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

@Injectable()
export class StripeService {
  private billingPortalConfigurationId?: Promise<string>;

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

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const configuration = await this.getBillingPortalConfigurationId();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  private getBillingPortalConfigurationId(): Promise<string> {
    if (!this.billingPortalConfigurationId) {
      this.billingPortalConfigurationId =
        this.resolveBillingPortalConfiguration().catch((error) => {
          this.billingPortalConfigurationId = undefined;
          throw error;
        });
    }
    return this.billingPortalConfigurationId;
  }

  private async resolveBillingPortalConfiguration(): Promise<string> {
    const configurations = await stripe.billingPortal.configurations.list({
      active: true,
      limit: 100,
    });
    const existing = configurations.data.find(
      (configuration) => configuration.metadata?.ringee === "billing_portal_v1",
    );
    if (existing) return existing.id;

    const configuration = await stripe.billingPortal.configurations.create({
      name: "Ringee billing portal",
      metadata: { ringee: "billing_portal_v1" },
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["address", "email", "name", "tax_id"],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          cancellation_reason: {
            enabled: true,
            options: [
              "customer_service",
              "low_quality",
              "missing_features",
              "switched_service",
              "too_complex",
              "too_expensive",
              "unused",
              "other",
            ],
          },
        },
        subscription_update: { enabled: false },
      },
    });
    return configuration.id;
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
   * Creates a PaymentIntent for a one-time credit top-up, confirmed by a CUSTOM
   * Stripe Elements form rendered INSIDE Ringee (no Stripe-hosted checkout UI).
   *
   * Card-only (`payment_method_types: ["card"]`) so the form stays minimal, and
   * `receipt_email` routes the Stripe receipt to whatever billing email the user
   * chose. Crediting still happens EXCLUSIVELY from the confirmed
   * `payment_intent.succeeded` webhook (rechargeMode `custom_checkout`) — this
   * call never moves balance. Toggling `savePaymentMethod` changes
   * `setup_future_usage`, which is fixed at creation, so the caller recreates
   * the intent when the consent flips.
   */
  async createCreditTopupPaymentIntent(
    userId: string,
    customerId: string,
    amountUsd: number,
    description: string,
    organizationId?: string | null,
    savePaymentMethod: boolean = false,
    invoiceEmail?: string | null,
  ): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    amountUsd: number;
    amountCents: number;
    billingEmail: string | null;
  }> {
    const amountCents = Math.round(amountUsd * 100);
    const receiptEmail = invoiceEmail?.trim() || undefined;

    const metadata: Record<string, string> = {
      userId,
      organizationId: organizationId ?? "",
      amount: String(amountUsd),
      amountCents: String(amountCents),
      type: "credit_topup",
      service: "ringee",
      rechargeMode: "custom_checkout",
      fn: "creditTopupCustomCard",
    };

    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method_types: ["card"],
      description,
      metadata,
      ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
      // Save the card for future one-click recharges only with consent. The
      // consent checkbox lives in the Ringee form (not Stripe's own UI), so this
      // flag is the single source of truth for whether we persist it.
      ...(savePaymentMethod
        ? { setup_future_usage: "off_session" as const }
        : {}),
    });

    return {
      clientSecret: pi.client_secret!,
      paymentIntentId: pi.id,
      amountUsd,
      amountCents,
      billingEmail: receiptEmail ?? null,
    };
  }

  /**
   * Update where Stripe delivers receipts / invoices for this customer. Sets the
   * customer's email (used for subscription invoices) and, when a one-time
   * PaymentIntent id is supplied, its `receipt_email` (used for the top-up
   * receipt). Called right before a custom-form confirm when the user edited the
   * billing email — a no-op for a blank value.
   */
  async updateBillingEmail(
    customerId: string,
    email: string,
    paymentIntentId?: string | null,
  ): Promise<void> {
    const clean = email.trim();
    if (!clean) return;
    await stripe.customers.update(customerId, { email: clean });
    if (paymentIntentId) {
      await stripe.paymentIntents.update(paymentIntentId, {
        receipt_email: clean,
      });
    }
  }

  /**
   * Retrieve a still-editable one-time credit top-up PaymentIntent that belongs
   * to `customerId`. Guards ownership and shape so a caller can only ever touch
   * its OWN live top-up, and only while it can still be changed (before it is
   * confirmed / succeeds).
   */
  private async getEditableTopupIntent(
    customerId: string,
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const piCustomer =
      typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? null);
    if (piCustomer !== customerId || pi.metadata?.type !== "credit_topup") {
      throw new BadRequestException("This payment can’t be updated.");
    }
    if (
      pi.status !== "requires_payment_method" &&
      pi.status !== "requires_confirmation"
    ) {
      throw new BadRequestException("This payment can no longer be changed.");
    }
    return pi;
  }

  /**
   * Toggle whether the card used on a live one-time top-up is saved for future
   * one-click recharges, by updating the PaymentIntent's `setup_future_usage` in
   * place. The `client_secret` is unchanged, so the mounted Stripe Elements form
   * (and the entered card details) survive — unlike recreating the intent.
   */
  async setCreditSavePreference(
    customerId: string,
    paymentIntentId: string,
    savePaymentMethod: boolean,
  ): Promise<void> {
    await this.getEditableTopupIntent(customerId, paymentIntentId);
    await stripe.paymentIntents.update(paymentIntentId, {
      // Empty string clears `setup_future_usage`, so unchecking stops the save.
      setup_future_usage: savePaymentMethod ? "off_session" : "",
    });
  }

  /**
   * Validate a customer-facing promotion code and apply it to a live one-time
   * credit top-up: the CHARGE (`amount`) is reduced by the coupon's discount
   * while the credited face amount — carried in `metadata.amount` / `amountCents`
   * and read by the webhook — is left untouched, so the user pays less for the
   * same credit. A blank `code` clears any applied discount and restores the
   * full charge. Throws on an unknown / inactive / inapplicable code.
   */
  async applyCreditCoupon(
    customerId: string,
    paymentIntentId: string,
    rawCode: string,
  ): Promise<{
    code: string;
    label: string;
    discountCents: number;
    discountUsd: number;
    chargeCents: number;
    chargeUsd: number;
    faceCents: number;
    faceUsd: number;
    percentOff: number | null;
  }> {
    const pi = await this.getEditableTopupIntent(customerId, paymentIntentId);

    // Face value (what the user is buying) is fixed at creation — always price
    // the discount off it, never off the possibly-already-discounted amount.
    const faceCents = Number(pi.metadata?.amountCents) || pi.amount;
    const code = rawCode.trim();

    // Blank code → remove any discount and restore the full charge.
    if (!code) {
      await stripe.paymentIntents.update(paymentIntentId, {
        amount: faceCents,
        metadata: {
          couponCode: "",
          couponId: "",
          promotionCodeId: "",
          discountCents: "",
          chargeCents: "",
        },
      });
      return {
        code: "",
        label: "",
        discountCents: 0,
        discountUsd: 0,
        chargeCents: faceCents,
        chargeUsd: faceCents / 100,
        faceCents,
        faceUsd: faceCents / 100,
        percentOff: null,
      };
    }

    const promo = (
      await stripe.promotionCodes.list({
        code,
        active: true,
        limit: 1,
        expand: ["data.promotion.coupon"],
      })
    ).data[0];
    // Stripe v19 nests the coupon under `promotion.coupon` (and it may come back
    // as an id unless expanded — hence the expand above + object guard).
    const rawCoupon = promo?.promotion?.coupon;
    const coupon =
      rawCoupon && typeof rawCoupon !== "string" ? rawCoupon : null;
    if (!promo || !coupon?.valid) {
      throw new BadRequestException("That code isn’t valid.");
    }
    // Promotion codes can be locked to a single customer.
    const promoCustomer =
      typeof promo.customer === "string"
        ? promo.customer
        : (promo.customer?.id ?? null);
    if (promoCustomer && promoCustomer !== customerId) {
      throw new BadRequestException("That code isn’t valid for this account.");
    }
    // Respect a merchant-configured minimum spend on the promotion code.
    const minAmount = promo.restrictions?.minimum_amount;
    if (minAmount && faceCents < minAmount) {
      throw new BadRequestException(
        `This code needs a minimum of $${(minAmount / 100).toFixed(2)}.`,
      );
    }

    let discountCents = 0;
    if (coupon.percent_off) {
      discountCents = Math.round((faceCents * coupon.percent_off) / 100);
    } else if (coupon.amount_off) {
      if (coupon.currency && coupon.currency !== "usd") {
        throw new BadRequestException("That code can’t be used here.");
      }
      discountCents = coupon.amount_off;
    }

    // Stripe won't confirm a card charge below $0.50, so clamp and reflect the
    // real (clamped) discount back to the caller.
    const MIN_CHARGE_CENTS = 50;
    const chargeCents = Math.max(faceCents - discountCents, MIN_CHARGE_CENTS);
    discountCents = faceCents - chargeCents;

    await stripe.paymentIntents.update(paymentIntentId, {
      amount: chargeCents,
      metadata: {
        // Keep `amount` / `amountCents` (face) intact → webhook credits face.
        couponCode: code,
        couponId: coupon.id,
        promotionCodeId: promo.id,
        discountCents: String(discountCents),
        chargeCents: String(chargeCents),
      },
    });

    return {
      code,
      label: coupon.name ?? code,
      discountCents,
      discountUsd: discountCents / 100,
      chargeCents,
      chargeUsd: chargeCents / 100,
      faceCents,
      faceUsd: faceCents / 100,
      percentOff: coupon.percent_off ?? null,
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
   * Creates a monthly credit-funding SUBSCRIPTION in `default_incomplete` mode
   * for a CUSTOM Elements form. Returns the first invoice's confirmation client
   * secret; the frontend confirms it with the card the user enters (no
   * redirect, no Stripe-hosted UI). The card is saved as the subscription
   * default so future cycles charge automatically. Crediting + activation happen
   * from `invoice.payment_succeeded` (fn `creditSubscription`), idempotent per
   * invoice — this call never moves balance.
   */
  async createMonthlyCreditSubscriptionIntent(
    userId: string,
    customerId: string,
    amountUsd: number,
    organizationId?: string | null,
    invoiceEmail?: string | null,
  ): Promise<{
    clientSecret: string;
    subscriptionId: string;
    amountUsd: number;
    amountCents: number;
    billingEmail: string | null;
  }> {
    const amountCents = Math.round(amountUsd * 100);
    const email = invoiceEmail?.trim() || undefined;
    // Subscription invoices are delivered to the customer's email — set it so
    // recurring receipts go where the user asked.
    if (email) {
      await stripe.customers.update(customerId, { email });
    }

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

    // Subscription item `price_data` requires a product id (unlike Checkout
    // `line_items`, which accept inline `product_data`). Mint the product first;
    // `updateMonthlyCreditSubscriptionAmount` reuses / reactivates it on edits.
    const product = await stripe.products.create({
      name: "Ringee Monthly Credit Fund",
      description: `$${amountUsd} in credits added to your account every month`,
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency: "usd",
            product: product.id,
            unit_amount: amountCents,
            recurring: { interval: "month" },
          },
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      metadata,
      expand: ["latest_invoice.confirmation_secret"],
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const clientSecret = invoice?.confirmation_secret?.client_secret ?? null;
    if (!clientSecret) {
      throw new Error(
        "Subscription created but no confirmation secret was returned.",
      );
    }

    return {
      clientSecret,
      subscriptionId: subscription.id,
      amountUsd,
      amountCents,
      billingEmail: email ?? null,
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
    const productId = await this.ensureActiveProduct(
      currentProductId,
      amountUsd,
    );

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
   * Creates a SetupIntent to save / replace a card via a CUSTOM Elements form,
   * WITHOUT charging it. Used by "change payment method" for monthly funding and
   * auto-reload. The confirmed `setup_intent.succeeded` webhook
   * (`fn:"updateSavedPaymentMethod"`) then promotes the saved card to the
   * customer / subscription default.
   */
  async createCardSetupIntent(
    userId: string,
    customerId: string,
    organizationId?: string | null,
    subscriptionId?: string | null,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    const metadata: Record<string, string> = {
      userId,
      organizationId: organizationId ?? "",
      subscriptionId: subscriptionId ?? "",
      type: "card_setup",
      service: "ringee",
      fn: "updateSavedPaymentMethod",
    };

    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata,
    });

    return {
      clientSecret: si.client_secret!,
      setupIntentId: si.id,
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
