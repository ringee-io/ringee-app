import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StripeService } from "@ringee/platform";
import { StripeController } from "../../../../apps/backend/src/api/routes/stripe.controller";

describe("monthly funding webhook replay and subscription changes", () => {
  for (const [subtotal, currentAmount, expected] of [
    [10000, 10, 100],
    [1000, 100, 10],
  ]) {
    it(`credits invoice ${subtotal} cents once when the subscription now costs $${currentAmount}`, async () => {
      const credited: number[] = [];
      const keys = new Set<string>();
      const notifications: number[] = [];
      const invoice = {
        id: "invoice-1",
        currency: "usd",
        subtotal,
        billing_reason: "subscription_cycle",
        parent: {
          subscription_details: {
            subscription: "subscription-1",
            metadata: {
              fn: "creditSubscription",
              userId: "user-1",
              organizationId: "org-1",
            },
          },
        },
      };
      const controller: StripeController = Object.assign(
        Object.create(StripeController.prototype),
        {
          stripeService: {
            validateWebhook: () => ({
              type: "invoice.payment_succeeded",
              data: { object: invoice },
            }),
            getMonthlyCreditInvoiceFunding:
              StripeService.prototype.getMonthlyCreditInvoiceFunding,
            getSubscriptionMetadata: async () => ({
              metadata: {
                // Later subscription edits cannot change this invoice's
                // classification or funding owner either.
                fn: "changed-after-finalization",
                userId: "different-user",
                organizationId: "different-org",
                amountUsd: String(currentAmount),
              },
            }),
          },
          creditService: {
            updateMonthlyFundSettings: async () => undefined,
            creditTopupOnce: async (
              ctx: unknown,
              amount: number,
              ref: { paymentIntentId: string },
            ) => {
              assert.deepEqual(ctx, {
                userId: "user-1",
                organizationId: "org-1",
              });
              if (keys.has(ref.paymentIntentId)) return false;
              keys.add(ref.paymentIntentId);
              credited.push(amount);
              return true;
            },
          },
          triggerLoop: {
            creditsAdded: async (_user: string, amount: number) => {
              notifications.push(amount);
            },
          },
        },
      );
      const response = { send: () => undefined };
      await controller.handleWebhook(
        { rawBody: Buffer.alloc(0) } as never,
        response as never,
        "test",
      );
      await controller.handleWebhook(
        { rawBody: Buffer.alloc(0) } as never,
        response as never,
        "test",
      );
      assert.deepEqual(credited, [expected]);
      assert.deepEqual(notifications, [expected]);
      assert.deepEqual([...keys], ["invoice:invoice-1"]);
    });
  }
});
