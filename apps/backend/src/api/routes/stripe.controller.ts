import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  RawBodyRequest,
} from "@nestjs/common";
import { Response, Request } from "express";
import Stripe from "stripe";
import { createOwnershipContext, CurrentUser, Public, StripeService } from "@ringee/platform";
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
} from "@ringee/platform";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  customerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

@Controller("stripe")
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly creditService: CreditService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly userService: UserService,
    private readonly organizationService: OrganizationService,
    private readonly subscriptionService: SubscriptionService,
  ) { }

  private async getOrCreateCustomer(user: CurrentUserData): Promise<string> {
    // If user is in an organization context, use/create organization customer
    if (user.activeOrgId) {
      const org = await this.organizationService.getOrganizationById(user.activeOrgId);

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

    // Otherwise use/create user customer
    if (user.customerId) {
      return user.customerId;
    }

    const { id } = await this.stripeService.createCustomer(
      user.id,
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "User",
    );

    await this.userService.patchCustomerId(user.id, id);
    return id;
  }

  @Post("checkout/credit")
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

  @Post("checkout/phone")
  async createPhoneCheckout(
    @Body()
    body: CreatePhoneCheckoutDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const customerId = await this.getOrCreateCustomer(user);

    return this.stripeService.createPhoneNumberSubscriptionSession(
      customerId,
      body.numberId,
      body.costInformation.monthlyCost,
      0,
      user.id,
      user.activeOrgId, // Pass organizationId
      body.frontendOrigin, // Pass frontendOrigin
    );
  }

  @Post("checkout/credit-subscription")
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
  async createOrganizationCheckout(
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
            (fn === "createOneTimePaymentSession" || fn === "autoReloadSetup") &&
            session.mode === "payment" &&
            userId &&
            amountUsd > 0
          ) {
            const ctx = createOwnershipContext({
              id: userId,
              activeOrgId: organizationId,
            });
            await this.creditService.addCredits(ctx, amountUsd);
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

            await this.numberPurchasedService.buyNumber(ctx, numberId, {
              currency: "USD",
              monthlyCost: monthlyPriceUsd,
              upfrontCost: upfrontCostUsd,
            });
          } else if (metadata.type === "organization" && userId) {
            // Organization subscription
            console.log(`🏢 Organization subscription created for user ${userId}`);
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
            typeof sub === "string" ? sub : sub?.id ?? null;

          if (subscriptionId) {
            // Check if this is a monthly credit fund subscription
            const settings =
              await this.creditService.findSettingsByStripeSubscription(
                subscriptionId,
              );
            if (settings && settings.monthlyFundEnabled && settings.monthlyFundAmount) {
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
                console.log(
                  `📅 Monthly credit fund charged: $${settings.monthlyFundAmount} for user ${settings.userId}`,
                );
              }
            }
          }
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data
            .object as Stripe.PaymentIntent;
          const metadata = paymentIntent.metadata || {};

          if (metadata.fn === "autoReloadCharge" && metadata.userId) {
            const amountUsd = paymentIntent.amount / 100;
            const ctx = createOwnershipContext({
              id: metadata.userId,
              activeOrgId: metadata.organizationId || null,
            });
            await this.creditService.addCredits(ctx, amountUsd);
            console.log(
              `🔄 Auto-reload credited: $${amountUsd} for user ${metadata.userId}`,
            );
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
