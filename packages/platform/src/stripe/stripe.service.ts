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
    const callbackUrl = frontendOrigin ? baseUrl + "/call?" : baseUrl + "/dashboard/overview?";
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

  async createPhoneNumberSubscriptionSession(
    customerId: string,
    phoneNumber: string,
    monthlyCostUsd: number,
    upfrontCostUsd: number = 0,
    userId: string,
    organizationId?: string | null,
    frontendOrigin?: string,
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
    const callbackUrl = baseUrl + "/buy-numbers";
    const cancelUrl = callbackUrl + "?tab=buy&payment=cancel";
    const successUrl =
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          userId,
          type: "organization",
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Ringee Organization Plan",
              description: "Monthly subscription to create and manage organizations",
            },
            unit_amount: 2000, // $20.00
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
