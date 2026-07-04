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
import Stripe from "stripe";
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
} from "@ringee/services";
import { apiConfiguration } from "@ringee/configuration";
import {
  CreateCreditCheckoutDto,
  CreatePhoneCheckoutDto,
  CreateMonthlyCreditSubscriptionDto,
  CreateAutoReloadSetupDto,
  CreateOrganizationCheckoutDto,
} from "@ringee/platform";
import { TriggerLoopEventPublisher } from "../../triggerloop/services/triggerloop-event-publisher.service";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  customerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

// Server-authoritative bounds for a single credit top-up (USD). NEVER trust the
// client to enforce these — the amount is re-validated here before a Checkout
// Session is created.
const MIN_TOPUP_USD = 5;
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
    private readonly triggerLoop: TriggerLoopEventPublisher,
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
        undefined, // Org email?
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
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const amount = this.normalizeTopupAmount(body.amount);
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
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    console.log("user", user);

    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createOneTimePaymentSession(
      user.id,
      customerId,
      body.amount,
      body.description ||
        "Add more credits to your Ringee account to keep making calls, and using advanced features without interruption.",
      user.activeOrgId, // Pass organizationId
      body.frontendOrigin, // Pass frontendOrigin
    );
  }

  /**
   * Embedded Checkout for a one-time credit top-up. Returns a `clientSecret`
   * the dashboard mounts inline (no redirect, no new page). The amount is
   * validated server-side; presets and custom amounts both flow through here.
   * Credits are added ONLY by the confirmed webhook — this endpoint never
   * touches the balance.
   */
  @Post("checkout/credit/embedded")
  @OrgAdminOnly()
  async createEmbeddedCreditCheckout(
    @Body() body: CreateCreditCheckoutDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const amount = this.normalizeTopupAmount(body.amount);
    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createEmbeddedCreditTopupSession(
      user.id,
      customerId,
      amount,
      body.description ||
        "Add more credits to your Ringee account to keep making calls and using advanced features without interruption.",
      user.activeOrgId,
      body.frontendOrigin,
      body.savePaymentMethod ?? false,
    );
  }

  /**
   * Status of an embedded credit checkout session. The frontend polls this
   * after `onComplete` to confirm the payment before showing a success state —
   * it never trusts the client-side completion callback on its own.
   */
  @Get("checkout/credit/session/:sessionId")
  @OrgAdminOnly()
  async getCreditCheckoutStatus(@Param("sessionId") sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException("sessionId is required");
    }
    return this.stripeService.getCreditCheckoutStatus(sessionId);
  }

  /**
   * Clamp-free validation for a top-up amount. Rounds to whole cents and
   * enforces the server-authoritative [MIN, MAX] bounds so a tampered client
   * cannot request an out-of-range charge.
   */
  private normalizeTopupAmount(raw: unknown): number {
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
    return amount;
  }

  @Post("checkout/phone")
  @OrgAdminOnly()
  async createPhoneCheckout(
    @Body()
    body: CreatePhoneCheckoutDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

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
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createMonthlyCreditSubscriptionSession(
      customerId,
      user.id,
      body.amount,
      user.activeOrgId,
      body.frontendOrigin,
    );
  }

  @Post("checkout/auto-reload-setup")
  @OrgAdminOnly()
  async createAutoReloadSetup(
    @Body() body: CreateAutoReloadSetupDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

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
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

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
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("✅ Webhook signature verification successful: " + event.type);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const amountUsd = session.amount_total
            ? session.amount_total / 100
            : 0;
          const userId = session.metadata?.userId;
          const organizationId = session.metadata?.organizationId || null;
          const fn = session.metadata?.fn;

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
            // Save the subscription ID for recurring credit charges
            const subscriptionId =
              typeof session.subscription === "string"
                ? session.subscription
                : (session.subscription as any)?.id;

            if (subscriptionId) {
              const ctx = createOwnershipContext({
                id: userId,
                activeOrgId: organizationId,
              });
              const subAmountUsd = Number(
                session.metadata?.amountUsd || amountUsd,
              );
              await this.creditService.updateMonthlyFundSettings(ctx, {
                monthlyFundEnabled: true,
                monthlyFundAmount: subAmountUsd,
                stripeSubscriptionId: subscriptionId,
              });
              // Add credits for the first month
              if (subAmountUsd > 0) {
                await this.creditService.addCredits(ctx, subAmountUsd);
                await this.triggerLoop.creditsAdded(
                  userId,
                  subAmountUsd,
                  organizationId ?? undefined,
                );
              }
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

          if (subscriptionId) {
            // Check if this is a monthly credit fund subscription
            const settings =
              await this.creditService.findSettingsByStripeSubscription(
                subscriptionId,
              );
            if (
              settings &&
              settings.monthlyFundEnabled &&
              settings.monthlyFundAmount
            ) {
              // Skip if this is the first invoice (already credited in checkout.session.completed)
              const billingReason = (invoice as any).billing_reason;
              if (billingReason === "subscription_cycle") {
                const ctx = createOwnershipContext({
                  id: settings.userId!,
                  activeOrgId: settings.organizationId,
                });
                await this.creditService.addCredits(
                  ctx,
                  settings.monthlyFundAmount,
                );
                await this.triggerLoop.creditsAdded(
                  settings.userId!,
                  settings.monthlyFundAmount,
                  settings.organizationId ?? undefined,
                );
                console.log(
                  `📅 Monthly credit fund charged: $${settings.monthlyFundAmount} for user ${settings.userId}`,
                );
              }
            }
          }
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const metadata = paymentIntent.metadata || {};
          const userId = metadata.userId;

          // Saved-card one-click recharge and auto-reload are PaymentIntent-only
          // (no checkout session), so they are credited here — idempotently,
          // keyed on the payment-intent id, so a webhook replay can never
          // double-credit. The embedded-checkout PaymentIntent also fires this
          // event, but it is credited by `checkout.session.completed` and is
          // deliberately ignored here.
          const isSavedCardTopup =
            metadata.fn === "creditTopupSavedCard" ||
            (metadata.type === "credit_topup" &&
              metadata.rechargeMode === "saved_payment_method");
          const isAutoReload = metadata.fn === "autoReloadCharge";

          if ((isSavedCardTopup || isAutoReload) && userId) {
            const amountUsd = paymentIntent.amount / 100;
            const ctx = createOwnershipContext({
              id: userId,
              activeOrgId: metadata.organizationId || null,
            });

            const credited = await this.creditService.creditTopupOnce(
              ctx,
              amountUsd,
              {
                checkoutSessionId: null,
                paymentIntentId: paymentIntent.id,
                source: isAutoReload ? "auto_reload" : "saved_payment_method",
              },
            );

            if (credited) {
              await this.triggerLoop.creditsAdded(
                userId,
                amountUsd,
                metadata.organizationId || undefined,
              );
              console.log(
                `${isAutoReload ? "🔄 Auto-reload" : "⚡ Saved-card top-up"} credited: $${amountUsd} for user ${userId}`,
              );
            } else {
              console.log(
                `↩️ Duplicate ${isAutoReload ? "auto-reload" : "saved-card"} top-up webhook ignored for payment intent ${paymentIntent.id} (user ${userId})`,
              );
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const metadata = subscription.metadata || {};
          const numberId = metadata.phoneNumber;

          if (numberId) {
            console.log(`📴 Suscripción cancelada para ${numberId}`);
            await this.numberPurchasedService.release(numberId);
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
