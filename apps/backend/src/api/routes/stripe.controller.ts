import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  RawBodyRequest,
} from "@nestjs/common";
import { Response, Request } from "express";
import type Stripe from "stripe";
import {
  createOwnershipContext,
  CurrentUser,
  OrgAdminOnly,
  Public,
  StripeService,
} from "@ringee/platform";
import {
  NumberPurchasedService,
  CreditService,
  UserService,
  OrganizationService,
  SubscriptionService,
  BillingNotificationService,
} from "@ringee/services";
import type { FailedSubscriptionKind } from "@ringee/services";
import { apiConfiguration } from "@ringee/configuration";
import {
  CreateCreditCheckoutDto,
  CreatePhoneCheckoutDto,
  CreateMonthlyCreditSubscriptionDto,
  CreateAutoReloadSetupDto,
  CreateOrganizationCheckoutDto,
  CreateCardSetupDto,
  UpdateBillingEmailDto,
  ApplyCreditCouponDto,
  UpdateSavePreferenceDto,
} from "@ringee/platform";
import { TriggerLoopEventPublisher } from "../../triggerloop/services/triggerloop-event-publisher.service";
import { StripeAbuseProtectionService } from "./stripe-abuse-protection.service";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  customerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emails?: Array<{ email: string; isPrimary?: boolean }>;
}

// Server-authoritative bounds for a single credit top-up (USD). NEVER trust the
// client to enforce these — the amount is re-validated here before a Checkout
// Session is created.
// Stripe's technical floor for USD charges. The commercial minimum is stored
// per user (default $5) and can be changed from the backoffice.
const MIN_TOPUP_USD = 0.5;
const MAX_TOPUP_USD = 2000;

@Controller("stripe")
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly creditService: CreditService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly userService: UserService,
    private readonly organizationService: OrganizationService,
    private readonly subscriptionService: SubscriptionService,
    private readonly billingNotifications: BillingNotificationService,
    private readonly triggerLoop: TriggerLoopEventPublisher,
    private readonly stripeAbuse: StripeAbuseProtectionService,
  ) {}

  private async getOrCreateCustomer(user: CurrentUserData): Promise<string> {
    // If user is in an organization context, use/create organization customer
    if (user.activeOrgId) {
      const org = await this.organizationService.getOrganizationById(
        user.activeOrgId,
      );

      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      if (org.customerId) {
        return org.customerId;
      }

      const { id } = await this.stripeService.createCustomer(
        user.id, // We still link metadata to user ID for reference
        org.name,
        user.emails?.find((email) => email.isPrimary)?.email ??
          user.emails?.[0]?.email,
      );

      await this.organizationService.updateCustomerId(org.id, id);
      return id;
    }

    // Otherwise use/create the personal user customer.
    //
    // IMPORTANT: do NOT trust `user.customerId` from @CurrentUser(). That
    // object is hydrated from Clerk, and `ClerkUserRepository.mapToUser`
    // hardcodes `customerId: null` (Stripe ids live in our own DB, not Clerk).
    // Reading it here meant the id was always null, so every checkout created a
    // brand-new Stripe customer. Resolve the stored id from our database.
    const dbUser = await this.userService.getUserById(user.id);
    if (dbUser?.customerId) {
      return dbUser.customerId;
    }

    const { id } = await this.stripeService.createCustomer(
      user.id,
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "User",
      user.emails?.find((email) => email.isPrimary)?.email ??
        user.emails?.[0]?.email,
    );

    await this.userService.patchCustomerId(user.id, id);
    return id;
  }

  /**
   * Resolves the caller's existing Stripe customer id WITHOUT creating one.
   * Used by read-only endpoints (e.g. "do I have a saved card?") so merely
   * opening the recharge panel never provisions a Stripe customer. Returns null
   * when the org/user has no customer yet.
   */
  private async resolveExistingCustomerId(
    user: CurrentUserData,
  ): Promise<string | null> {
    if (user.activeOrgId) {
      const org = await this.organizationService.getOrganizationById(
        user.activeOrgId,
      );
      return org?.customerId ?? null;
    }

    const dbUser = await this.userService.getUserById(user.id);
    return dbUser?.customerId ?? null;
  }

  @Post("billing/portal")
  @OrgAdminOnly()
  async createBillingPortal(@CurrentUser() user: CurrentUserData) {
    const customerId = await this.getOrCreateCustomer(user);
    return this.stripeService.createBillingPortalSession(
      customerId,
      `${apiConfiguration.FRONTEND_URL.replace(/\/$/, "")}/dashboard/overview`,
    );
  }

  /**
   * Whether the caller has a reusable saved card, plus display-only fields for
   * the fast recharge UI. NEVER returns the payment-method id — the id is
   * resolved server-side at charge time so a client can only ever charge its
   * own saved card.
   */
  @Get("payment-method")
  @OrgAdminOnly()
  async getPaymentMethod(@CurrentUser() user: CurrentUserData) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const customerId = await this.resolveExistingCustomerId(user);
    if (!customerId) {
      return { hasSavedMethod: false };
    }

    const pm = await this.stripeService.getSavedPaymentMethod(customerId);
    return {
      hasSavedMethod: pm.hasSavedMethod,
      brand: pm.brand,
      last4: pm.last4,
      expMonth: pm.expMonth,
      expYear: pm.expYear,
    };
  }

  /**
   * One-click recharge against the caller's saved card. Re-validates the amount
   * and resolves the payment-method id server-side; the client only sends the
   * amount. Credits are added ONLY by the confirmed `payment_intent.succeeded`
   * webhook. Returns the intent status so the frontend can complete 3-D Secure
   * (`requires_action`) or fall back to embedded checkout (`failed`).
   */
  @Post("checkout/credit/saved")
  @OrgAdminOnly()
  async createSavedCardCheckout(
    @Body() body: CreateCreditCheckoutDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.stripeAbuse.assertIntentCreationAllowed(req, user.id);
    const amount = await this.normalizeTopupAmount(body.amount, user.id);
    const customerId = await this.getOrCreateCustomer(user);
    const pm = await this.stripeService.getSavedPaymentMethod(customerId);

    if (!pm.hasSavedMethod || !pm.paymentMethodId) {
      throw new BadRequestException("No saved payment method on file.");
    }

    return this.stripeService.createSavedCardTopupIntent({
      userId: user.id,
      customerId,
      paymentMethodId: pm.paymentMethodId,
      amountUsd: amount,
      organizationId: user.activeOrgId,
    });
  }

  /**
   * Server-authoritative status of a saved-card top-up PaymentIntent. The
   * frontend polls this after finishing 3-D Secure before showing success — it
   * never trusts the client-side result alone.
   */
  @Get("payment-intent/:paymentIntentId/status")
  @OrgAdminOnly()
  async getPaymentIntentStatus(
    @Param("paymentIntentId") paymentIntentId: string,
  ) {
    if (!paymentIntentId) {
      throw new BadRequestException("paymentIntentId is required");
    }
    return this.stripeService.getPaymentIntentStatus(paymentIntentId);
  }

  @Post("checkout/credit")
  @OrgAdminOnly()
  async createCreditCheckout(
    @Body() body: CreateCreditCheckoutDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.stripeAbuse.assertIntentCreationAllowed(req, user.id);
    const amount = await this.normalizeTopupAmount(body.amount, user.id);
    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createOneTimePaymentSession(
      user.id,
      customerId,
      amount,
      body.description ||
        "Add more credits to your Ringee account to keep making calls, and using advanced features without interruption.",
      user.activeOrgId, // Pass organizationId
      body.frontendOrigin, // Pass frontendOrigin
    );
  }

  /**
   * PaymentIntent for a one-time credit top-up, confirmed by the custom Stripe
   * Elements form inside the dashboard (no redirect, no Stripe-hosted UI).
   * Returns a `clientSecret` + `paymentIntentId`. The amount is validated
   * server-side; presets and custom amounts both flow through here. Credits are
   * added ONLY by the confirmed webhook — this endpoint never touches balance.
   */
  @Post("checkout/credit/intent")
  @OrgAdminOnly()
  async createCreditPaymentIntent(
    @Body() body: CreateCreditCheckoutDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const abuseIpHash = await this.stripeAbuse.assertIntentCreationAllowed(
      req,
      user.id,
    );
    const amount = await this.normalizeTopupAmount(body.amount, user.id);
    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createCreditTopupPaymentIntent(
      user.id,
      customerId,
      amount,
      body.description ||
        "Add more credits to your Ringee account to keep making calls and using advanced features without interruption.",
      user.activeOrgId,
      body.savePaymentMethod ?? false,
      body.invoiceEmail,
      abuseIpHash,
    );
  }

  /**
   * Update the billing email Stripe sends receipts / invoices to. Called by the
   * custom checkout right before confirming, when the user edited the email.
   * Updates the customer email and, if a live one-time intent id is given, its
   * `receipt_email`.
   */
  @Post("checkout/billing-email")
  @OrgAdminOnly()
  async updateBillingEmail(
    @Body() body: UpdateBillingEmailDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const customerId = await this.getOrCreateCustomer(user);
    await this.stripeService.updateBillingEmail(
      customerId,
      body.email,
      body.paymentIntentId,
    );
    return { ok: true };
  }

  /**
   * Apply (or clear, with a blank code) a promotion code on a live one-time
   * top-up. Reduces only the CHARGE — the credited face amount is preserved — so
   * the discount is a real saving. Returns the recomputed charge for the UI.
   */
  @Post("checkout/credit/apply-coupon")
  @OrgAdminOnly()
  async applyCreditCoupon(
    @Body() body: ApplyCreditCouponDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const customerId = await this.getOrCreateCustomer(user);
    return this.stripeService.applyCreditCoupon(
      customerId,
      body.paymentIntentId,
      body.code,
    );
  }

  /**
   * Toggle "save this card" on a live one-time top-up in place (updates the
   * PaymentIntent's `setup_future_usage`), so the entered card details survive —
   * unlike recreating the intent, which wiped the form.
   */
  @Post("checkout/credit/save-preference")
  @OrgAdminOnly()
  async updateSavePreference(
    @Body() body: UpdateSavePreferenceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const customerId = await this.getOrCreateCustomer(user);
    await this.stripeService.setCreditSavePreference(
      customerId,
      body.paymentIntentId,
      body.savePaymentMethod,
    );
    return { ok: true };
  }

  /**
   * Clamp-free validation for a top-up amount. Rounds to whole cents and
   * enforces the server-authoritative [MIN, MAX] bounds so a tampered client
   * cannot request an out-of-range charge.
   */
  private async normalizeTopupAmount(
    raw: unknown,
    userId: string,
  ): Promise<number> {
    const amount = Math.round(Number(raw) * 100) / 100;
    if (
      !Number.isFinite(amount) ||
      amount < MIN_TOPUP_USD ||
      amount > MAX_TOPUP_USD
    ) {
      throw new BadRequestException(
        `Amount must be between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}.`,
      );
    }
    await this.userService.assertMinimumCreditPurchase(userId, amount);
    return amount;
  }

  @Post("checkout/phone")
  @OrgAdminOnly()
  async createPhoneCheckout(
    @Body()
    body: CreatePhoneCheckoutDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.stripeAbuse.assertIntentCreationAllowed(req, user.id);
    await this.numberPurchasedService.assertCanPurchaseNumber(user.id);

    const customerId = await this.getOrCreateCustomer(user);

    // Resolve the price authoritatively from the provider. NEVER trust an
    // amount sent by the client (`body.costInformation`): it can be tampered
    // with to create the subscription at an arbitrary price. Anything the
    // client sends is ignored here.
    const cost = await this.numberPurchasedService.getAuthoritativeCost(
      body.numberId,
    );

    return this.stripeService.createPhoneNumberSubscriptionSession(
      customerId,
      body.numberId,
      cost.monthlyCost,
      0,
      user.id,
      user.activeOrgId, // Pass organizationId
      body.frontendOrigin, // Pass frontendOrigin
    );
  }

  @Post("checkout/credit-subscription")
  @OrgAdminOnly()
  async createCreditSubscription(
    @Body() body: CreateMonthlyCreditSubscriptionDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.stripeAbuse.assertIntentCreationAllowed(req, user.id);
    const amount = await this.normalizeTopupAmount(body.amount, user.id);
    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createMonthlyCreditSubscriptionSession(
      customerId,
      user.id,
      amount,
      user.activeOrgId,
      body.frontendOrigin,
    );
  }

  /**
   * Monthly credit-funding subscription for the custom Elements form (no
   * redirect). Creates a `default_incomplete` subscription and returns the first
   * invoice's confirmation `clientSecret` + `subscriptionId`. Credits are added
   * ONLY by the confirmed `invoice.payment_succeeded` webhook (idempotent per
   * invoice) — this endpoint never moves balance.
   */
  @Post("checkout/credit-subscription/intent")
  @OrgAdminOnly()
  async createCreditSubscriptionIntent(
    @Body() body: CreateMonthlyCreditSubscriptionDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const abuseIpHash = await this.stripeAbuse.assertIntentCreationAllowed(
      req,
      user.id,
    );
    const amount = await this.normalizeTopupAmount(body.amount, user.id);
    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createMonthlyCreditSubscriptionIntent(
      user.id,
      customerId,
      amount,
      user.activeOrgId,
      body.invoiceEmail,
      abuseIpHash,
    );
  }

  /**
   * SetupIntent to save/replace a card without charging it, for the custom
   * Elements form ("change payment method" for monthly funding + auto-reload).
   * If the caller has an active monthly subscription, the `setup_intent.succeeded`
   * webhook also promotes the new card to that subscription's default. Returns a
   * `clientSecret` + `setupIntentId` for the dashboard.
   */
  @Post("setup/payment-method/intent")
  @OrgAdminOnly()
  async createCardSetupIntent(
    @Body() _body: CreateCardSetupDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const abuseIpHash = await this.stripeAbuse.assertIntentCreationAllowed(
      req,
      user.id,
    );
    const customerId = await this.getOrCreateCustomer(user);
    const ctx = createOwnershipContext(user);
    const settings = await this.creditService.getAutoReloadSettings(ctx);
    const subscriptionId =
      settings?.monthlyFundEnabled && settings.stripeSubscriptionId
        ? settings.stripeSubscriptionId
        : null;

    return this.stripeService.createCardSetupIntent(
      user.id,
      customerId,
      user.activeOrgId,
      subscriptionId,
      abuseIpHash,
    );
  }

  @Post("checkout/auto-reload-setup")
  @OrgAdminOnly()
  async createAutoReloadSetup(
    @Body() body: CreateAutoReloadSetupDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.stripeAbuse.assertIntentCreationAllowed(req, user.id);
    const customerId = await this.getOrCreateCustomer(user);

    // Save auto-reload settings
    const ctx = createOwnershipContext(user);
    await this.creditService.updateAutoReloadSettings(ctx, {
      autoReloadEnabled: true,
      autoReloadThreshold: body.threshold,
      autoReloadAmount: body.reloadAmount,
    });

    return this.stripeService.createAutoReloadSetupSession(
      customerId,
      user.id,
      body.reloadAmount,
      user.activeOrgId,
      body.frontendOrigin,
    );
  }

  @Post("checkout/organization")
  @OrgAdminOnly()
  async createOrganizationCheckout(
    @Body() body: CreateOrganizationCheckoutDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.stripeAbuse.assertIntentCreationAllowed(req, user.id);

    // Use personal customer ID, not org
    const personalUser = { ...user, activeOrgId: null };
    const customerId = await this.getOrCreateCustomer(personalUser);

    return this.stripeService.createOrganizationSubscriptionSession(
      customerId,
      user.id,
      body.billingInterval ?? "month",
      body.frontendOrigin,
    );
  }

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers("stripe-signature") signature: string,
  ) {
    const endpointSecret = apiConfiguration.STRIPE_WEBHOOK_SECRET!;
    let event: Stripe.Event;

    try {
      event = this.stripeService.validateWebhook(
        req.rawBody!,
        signature,
        endpointSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("❌ Webhook signature verification failed:", message);
      return res.status(400).send(`Webhook Error: ${message}`);
    }

    console.log("✅ Webhook signature verification successful: " + event.type);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const organizationId = session.metadata?.organizationId || null;
          const fn = session.metadata?.fn;
          const sessionCustomerId =
            typeof session.customer === "string"
              ? session.customer
              : ((session.customer as Stripe.Customer | null)?.id ?? null);

          // "Change payment method" (mode:setup) — no charge. Promote the newly
          // saved card to the customer (and subscription) default, and clear a
          // failed auto-reload so it re-arms with the fresh card.
          if (
            session.mode === "setup" &&
            fn === "updateSavedPaymentMethod" &&
            userId &&
            sessionCustomerId
          ) {
            const pmId =
              await this.stripeService.getSetupSessionPaymentMethodId(
                session.id,
              );
            if (pmId) {
              await this.stripeService.setDefaultPaymentMethod(
                sessionCustomerId,
                pmId,
                session.metadata?.subscriptionId || undefined,
              );
              const ctx = createOwnershipContext({
                id: userId,
                activeOrgId: organizationId,
              });
              await this.creditService.resetAutoReloadStatusIfFailed(ctx);
              console.log(`💳 Saved payment method updated for user ${userId}`);
            }
            break;
          }

          const amountUsd = session.amount_total
            ? session.amount_total / 100
            : 0;

          if (
            (fn === "createOneTimePaymentSession" ||
              fn === "autoReloadSetup") &&
            session.mode === "payment" &&
            userId &&
            amountUsd > 0
          ) {
            const ctx = createOwnershipContext({
              id: userId,
              activeOrgId: organizationId,
            });

            // Idempotent credit: `creditTopupOnce` records the checkout session
            // in the CreditTopup ledger first and only moves balance when the
            // row is newly inserted. A replayed webhook returns `false`, so we
            // never double-credit and never re-fire the "credits added" event.
            const paymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : ((session.payment_intent as Stripe.PaymentIntent | null)
                    ?.id ?? null);

            const credited = await this.creditService.creditTopupOnce(
              ctx,
              amountUsd,
              { checkoutSessionId: session.id, paymentIntentId },
            );

            if (credited) {
              await this.triggerLoop.creditsAdded(
                userId,
                amountUsd,
                organizationId ?? undefined,
              );
            } else {
              console.log(
                `↩️ Duplicate credit top-up webhook ignored for session ${session.id} (user ${userId})`,
              );
            }
          } else if (
            fn === "creditSubscription" &&
            session.mode === "subscription" &&
            userId
          ) {
            // Activate the monthly fund ONLY — do NOT credit here. Every paid
            // cycle (including the first) is credited idempotently from
            // `invoice.payment_succeeded` via `creditTopupOnce`, so a webhook
            // replay can never double-credit and we never credit before the
            // invoice is actually paid.
            const subscriptionId =
              typeof session.subscription === "string"
                ? session.subscription
                : (session.subscription as Stripe.Subscription | null)?.id;

            if (subscriptionId) {
              const ctx = createOwnershipContext({
                id: userId,
                activeOrgId: organizationId,
              });
              const subAmountUsd = Number(
                session.metadata?.amountUsd || session.metadata?.amount || 0,
              );
              await this.creditService.updateMonthlyFundSettings(ctx, {
                monthlyFundEnabled: true,
                monthlyFundAmount: subAmountUsd || null,
                stripeSubscriptionId: subscriptionId,
              });
              console.log(
                `📅 Monthly credit fund activated for user ${userId}: $${subAmountUsd}/month`,
              );
            }
          } else {
            console.log(
              `❌ Could not add credits to user ${userId} +${amountUsd}`,
            );
          }

          break;
        }
        case "customer.subscription.created": {
          const subscription = event.data.object as Stripe.Subscription;
          const metadata = subscription.metadata || {};
          const userId = metadata.userId;
          const organizationId = metadata.organizationId || null;
          const numberId = metadata.phoneNumber;
          const upfrontCostUsd = Number(metadata.upfrontCostUsd);
          const monthlyPriceUsd = subscription.items.data[0]?.price.unit_amount
            ? subscription.items.data[0].price.unit_amount! / 100
            : 0;

          if (userId && numberId) {
            console.log(
              `☎️ New subscription: ${numberId} assigned to ${userId}${organizationId ? ` (org: ${organizationId})` : ""}`,
            );

            const ctx = createOwnershipContext({
              id: userId,
              activeOrgId: organizationId,
            });

            const purchased = await this.numberPurchasedService.buyNumber(
              ctx,
              numberId,
              {
                currency: "USD",
                monthlyCost: monthlyPriceUsd,
                upfrontCost: upfrontCostUsd,
              },
            );

            // Numbers awaiting document verification are persisted as `pending`
            // and are not yet usable, so don't announce them as assigned.
            if (purchased.status === "pending") {
              console.log(
                `🪪 ${purchased.phoneNumber} ordered but pending regulatory verification for ${userId}`,
              );
            } else {
              await this.triggerLoop.phoneNumberAssigned(
                userId,
                purchased.phoneNumber,
              );
            }
          } else if (metadata.type === "organization" && userId) {
            // Organization subscription
            console.log(
              `🏢 Organization subscription created for user ${userId}`,
            );
            await this.subscriptionService.createFromStripe(
              subscription.id,
              subscription.customer as string,
              userId,
              subscription.ended_at
                ? new Date(subscription.ended_at * 1000)
                : undefined,
            );
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const sub = invoice.parent?.subscription_details?.subscription;
          const subscriptionId =
            typeof sub === "string" ? sub : (sub?.id ?? null);
          const billingReason = (invoice as { billing_reason?: string })
            .billing_reason;

          // Credit BOTH the first paid cycle and every recurring cycle. Owner +
          // amount come from the SUBSCRIPTION metadata (not our settings row) so
          // crediting is resilient to webhook ordering. `creditTopupOnce`, keyed
          // on a per-invoice id, makes replays a no-op — one credit per invoice.
          if (
            subscriptionId &&
            (billingReason === "subscription_create" ||
              billingReason === "subscription_cycle")
          ) {
            const info =
              await this.stripeService.getSubscriptionMetadata(subscriptionId);

            if (
              info.metadata.fn === "creditSubscription" &&
              info.metadata.userId
            ) {
              const ctx = createOwnershipContext({
                id: info.metadata.userId,
                activeOrgId: info.metadata.organizationId || null,
              });
              const amountUsd = Number(
                info.metadata.amountUsd ||
                  info.metadata.amount ||
                  info.amountUsd ||
                  0,
              );

              // Keep the settings row in sync in case checkout.session.completed
              // hasn't landed yet (webhook ordering is not guaranteed).
              await this.creditService.updateMonthlyFundSettings(ctx, {
                monthlyFundEnabled: true,
                monthlyFundAmount: amountUsd || null,
                stripeSubscriptionId: subscriptionId,
              });

              if (amountUsd > 0) {
                const invoicePi = (
                  invoice as { payment_intent?: string | { id?: string } }
                ).payment_intent;
                const paymentIntentId =
                  (typeof invoicePi === "string"
                    ? invoicePi
                    : (invoicePi?.id ?? null)) ?? `invoice:${invoice.id}`;

                const credited = await this.creditService.creditTopupOnce(
                  ctx,
                  amountUsd,
                  {
                    checkoutSessionId: null,
                    paymentIntentId,
                    source: "monthly_credit_funding",
                  },
                );

                if (credited) {
                  await this.triggerLoop.creditsAdded(
                    info.metadata.userId,
                    amountUsd,
                    info.metadata.organizationId || undefined,
                  );
                  console.log(
                    `📅 Monthly credit fund charged: $${amountUsd} for user ${info.metadata.userId} (${billingReason})`,
                  );
                } else {
                  console.log(
                    `↩️ Duplicate monthly-fund invoice webhook ignored for ${invoice.id}`,
                  );
                }
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const sub = invoice.parent?.subscription_details?.subscription;
          const subscriptionId =
            typeof sub === "string" ? sub : (sub?.id ?? null);
          const billingReason = (invoice as { billing_reason?: string })
            .billing_reason;

          // Count only the interactive first-invoice confirmation. Normal
          // recurring declines are not card testing and must keep their regular
          // dunning/recovery behavior.
          if (subscriptionId && billingReason === "subscription_create") {
            const info =
              await this.stripeService.getSubscriptionMetadata(subscriptionId);
            if (
              info.metadata.fn === "creditSubscription" &&
              info.metadata.userId
            ) {
              const protection = await this.stripeAbuse.recordFailedCardAttempt(
                {
                  eventId: event.id,
                  userId: info.metadata.userId,
                  ipHash: info.metadata.abuseIpHash,
                },
              );
              if (protection.shouldCancelIntent) {
                await this.stripeService.cancelSubscriptionImmediately(
                  subscriptionId,
                );
              }
            }
          } else if (subscriptionId) {
            // A renewal was declined (`subscription_cycle`, or an amount change
            // mid-cycle). Stripe will retry on its dunning schedule and then
            // cancel, so warn the owner now — while a new card can still save
            // the number / funding / plan. The first invoice is excluded: the
            // user is on the checkout screen and sees the decline there.
            const info =
              await this.stripeService.getSubscriptionMetadata(subscriptionId);
            const metadata = info.metadata;

            const kind: FailedSubscriptionKind =
              metadata.fn === "creditSubscription"
                ? "credit_funding"
                : metadata.phoneNumber
                  ? "phone_number"
                  : metadata.type === "organization"
                    ? "organization"
                    : "unknown";

            await this.billingNotifications.notifySubscriptionPaymentFailed({
              userId: metadata.userId || null,
              invoiceId: invoice.id ?? `sub:${subscriptionId}`,
              kind,
              phoneNumber: metadata.phoneNumber || null,
              amountDue:
                invoice.amount_due != null ? invoice.amount_due / 100 : null,
              currency: invoice.currency ?? "usd",
              attemptCount: invoice.attempt_count ?? 1,
              nextAttemptAt: invoice.next_payment_attempt
                ? new Date(invoice.next_payment_attempt * 1000)
                : null,
              hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
              billingEmail: invoice.customer_email ?? null,
            });

            console.log(
              `❌ Subscription renewal declined for user ${metadata.userId ?? "unknown"} (${kind}, invoice ${invoice.id}, attempt ${invoice.attempt_count ?? 1})`,
            );
          }
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const metadata = paymentIntent.metadata || {};
          const userId = metadata.userId;

          // Every one-time top-up is PaymentIntent-only (no checkout session) and
          // credited here — idempotently, keyed on the payment-intent id, so a
          // webhook replay can never double-credit. Three kinds land here: the
          // custom Elements checkout, the saved-card one-click recharge, and the
          // off-session auto-reload charge.
          const isCustomTopup =
            metadata.fn === "creditTopupCustomCard" ||
            (metadata.type === "credit_topup" &&
              metadata.rechargeMode === "custom_checkout");
          const isSavedCardTopup =
            metadata.fn === "creditTopupSavedCard" ||
            (metadata.type === "credit_topup" &&
              metadata.rechargeMode === "saved_payment_method");
          const isAutoReload = metadata.fn === "autoReloadCharge";

          if ((isCustomTopup || isSavedCardTopup || isAutoReload) && userId) {
            // Credit the FACE amount purchased, not the charged amount: a
            // discount coupon lowers `paymentIntent.amount` but the credited
            // value lives in `metadata.amount`. Fall back to the charge for
            // legacy intents / other kinds that carry no face metadata.
            const chargedUsd = paymentIntent.amount / 100;
            const faceUsd = Number(metadata.amount);
            const amountUsd =
              isCustomTopup && Number.isFinite(faceUsd) && faceUsd > 0
                ? faceUsd
                : chargedUsd;
            const ctx = createOwnershipContext({
              id: userId,
              activeOrgId: metadata.organizationId || null,
            });

            const source = isAutoReload
              ? "auto_reload"
              : isCustomTopup
                ? "custom_checkout"
                : "saved_payment_method";

            const credited = await this.creditService.creditTopupOnce(
              ctx,
              amountUsd,
              {
                checkoutSessionId: null,
                paymentIntentId: paymentIntent.id,
                source,
              },
            );

            if (credited) {
              // Auto-reload re-arms ONLY after the balance is topped up, so a
              // concurrent consume can never re-charge before the credit lands.
              if (isAutoReload) {
                await this.creditService.reArmAutoReload(ctx, paymentIntent.id);
              }
              await this.triggerLoop.creditsAdded(
                userId,
                amountUsd,
                metadata.organizationId || undefined,
              );
              console.log(
                `${
                  isAutoReload
                    ? "🔄 Auto-reload"
                    : isCustomTopup
                      ? "💳 Credit top-up"
                      : "⚡ Saved-card top-up"
                } credited: $${amountUsd} for user ${userId}`,
              );
            } else {
              console.log(
                `↩️ Duplicate top-up webhook ignored for payment intent ${paymentIntent.id} (user ${userId})`,
              );
            }
          }
          break;
        }

        case "setup_intent.succeeded": {
          // Custom "change payment method" flow (SetupIntent, no charge). Promote
          // the newly saved card to the customer (and subscription) default, and
          // clear a failed auto-reload so it re-arms with the fresh card. Mirrors
          // the old embedded `checkout.session.completed` (mode:setup) branch.
          const setupIntent = event.data.object as Stripe.SetupIntent;
          const metadata = setupIntent.metadata || {};
          const userId = metadata.userId;
          const customerId =
            typeof setupIntent.customer === "string"
              ? setupIntent.customer
              : ((setupIntent.customer as Stripe.Customer | null)?.id ?? null);
          const pmId =
            typeof setupIntent.payment_method === "string"
              ? setupIntent.payment_method
              : ((setupIntent.payment_method as Stripe.PaymentMethod | null)
                  ?.id ?? null);

          if (
            metadata.fn === "updateSavedPaymentMethod" &&
            userId &&
            customerId &&
            pmId
          ) {
            await this.stripeService.setDefaultPaymentMethod(
              customerId,
              pmId,
              metadata.subscriptionId || undefined,
            );
            const ctx = createOwnershipContext({
              id: userId,
              activeOrgId: metadata.organizationId || null,
            });
            await this.creditService.resetAutoReloadStatusIfFailed(ctx);
            console.log(`💳 Saved payment method updated for user ${userId}`);
          }
          break;
        }

        case "setup_intent.setup_failed": {
          const setupIntent = event.data.object as Stripe.SetupIntent;
          const metadata = setupIntent.metadata || {};
          if (metadata.fn === "updateSavedPaymentMethod" && metadata.userId) {
            const protection = await this.stripeAbuse.recordFailedCardAttempt({
              eventId: event.id,
              userId: metadata.userId,
              ipHash: metadata.abuseIpHash,
            });
            if (protection.shouldCancelIntent) {
              await this.stripeService.cancelSetupIntentIfPending(
                setupIntent.id,
              );
            }
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const metadata = paymentIntent.metadata || {};

          // Interactive top-up failures are card-testing signals. Count signed
          // webhook events (not client claims), block the account/IP at the
          // configured threshold, and cancel this still-reusable client secret.
          if (
            (metadata.fn === "creditTopupCustomCard" ||
              (metadata.type === "credit_topup" &&
                metadata.rechargeMode === "custom_checkout")) &&
            metadata.userId
          ) {
            const protection = await this.stripeAbuse.recordFailedCardAttempt({
              eventId: event.id,
              userId: metadata.userId,
              ipHash: metadata.abuseIpHash,
            });
            if (protection.shouldCancelIntent) {
              await this.stripeService.cancelPaymentIntentIfPending(
                paymentIntent.id,
              );
            }
          }

          // Async off-session failures (auto-reload declines) surface here.
          // Move the reload to a stopped state so it won't keep retrying, and
          // the drawer shows "Payment failed" / "Requires new payment method".
          if (metadata.fn === "autoReloadCharge" && metadata.userId) {
            const ctx = createOwnershipContext({
              id: metadata.userId,
              activeOrgId: metadata.organizationId || null,
            });
            const code = paymentIntent.last_payment_error?.code;
            const requiresNewMethod =
              code === "authentication_required" ||
              code === "payment_method_unactivated" ||
              code === "expired_card";
            await this.creditService.markAutoReloadFailed(
              ctx,
              requiresNewMethod,
            );
            console.log(
              `❌ Auto-reload payment failed for user ${metadata.userId} (${code ?? "unknown"})`,
            );
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const metadata = subscription.metadata || {};
          // Set at checkout by `createPhoneNumberSubscriptionSession`: the
          // E.164 number, not a NumberPurchased id.
          const phoneNumber = metadata.phoneNumber;

          if (phoneNumber) {
            console.log(`📴 Subscription cancelled for ${phoneNumber}`);
            await this.numberPurchasedService.retireCancelledNumber(
              phoneNumber,
            );
          }

          // Handle credit subscription cancellation
          if (metadata.fn === "creditSubscription") {
            const settings =
              await this.creditService.findSettingsByStripeSubscription(
                subscription.id,
              );
            if (settings) {
              const ctx = createOwnershipContext({
                id: settings.userId!,
                activeOrgId: settings.organizationId,
              });
              await this.creditService.updateMonthlyFundSettings(ctx, {
                monthlyFundEnabled: false,
                monthlyFundAmount: 0,
                stripeSubscriptionId: "",
              });
              console.log(
                `📴 Monthly credit fund cancelled for user ${settings.userId}`,
              );
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event type ${event.type}`);
      }
    } catch (err) {
      console.error("⚠️ Error handling Stripe webhook event:", err);
    }

    return res.send({ received: true });
  }
}
