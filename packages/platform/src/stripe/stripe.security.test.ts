import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const { client } = vi.hoisted(() => ({
  client: {
    paymentIntents: { retrieve: vi.fn(), update: vi.fn() },
    promotionCodes: { list: vi.fn() },
  },
}));
vi.mock("stripe", () => ({
  default: class {
    constructor() {
      return client;
    }
  },
}));
vi.mock("@ringee/configuration", () => ({
  apiConfiguration: { STRIPE_SECRET_KEY: "test" },
}));
import { StripeService } from "./stripe.service";

const service = new StripeService();
const coupon = { id: "coupon-1", valid: true, percent_off: 50 };

beforeEach(() => {
  vi.clearAllMocks();
  client.paymentIntents.retrieve.mockResolvedValue({
    customer: "customer-1",
    status: "requires_payment_method",
    amount: 1000,
    metadata: { type: "credit_topup", amountCents: "1000" },
  });
});

describe("coupon restrictions on direct PaymentIntents", () => {
  for (const restriction of [
    { restrictions: { first_time_transaction: true } },
    { max_redemptions: 1 },
    { promotion: { coupon: { ...coupon, max_redemptions: 1 } } },
    {
      promotion: {
        coupon: { ...coupon, applies_to: { products: ["product-1"] } },
      },
    },
  ]) {
    it(`never discounts either pending payment with ${JSON.stringify(restriction)}`, async () => {
      client.promotionCodes.list.mockResolvedValue({
        data: [{ id: "promo-1", promotion: { coupon }, ...restriction }],
      });
      await expect(
        service.applyCreditCoupon("customer-1", "pi-1", "FIRST"),
      ).rejects.toThrow("Stripe Checkout");
      await expect(
        service.applyCreditCoupon("customer-1", "pi-2", "FIRST"),
      ).rejects.toThrow("Stripe Checkout");
      expect(client.paymentIntents.update).not.toHaveBeenCalled();
    });
  }
  it("preserves unlimited discounts and the purchased face value", async () => {
    client.promotionCodes.list.mockResolvedValue({
      data: [{ id: "promo-1", promotion: { coupon } }],
    });
    const result = await service.applyCreditCoupon(
      "customer-1",
      "pi-1",
      "HALF",
    );
    expect(result.chargeCents).toBe(500);
    expect(result.faceCents).toBe(1000);
    expect(client.paymentIntents.update).toHaveBeenCalledWith(
      "pi-1",
      expect.objectContaining({ amount: 500 }),
    );
  });
  it("can clear an old restricted discount before payment", async () => {
    const result = await service.applyCreditCoupon("customer-1", "pi-1", "");
    expect(result.chargeCents).toBe(1000);
  });
});

describe("monthly invoice funding", () => {
  const invoice = (subtotal: number, amountUsd: string) =>
    ({
      currency: "usd",
      subtotal,
      parent: {
        subscription_details: {
          metadata: {
            fn: "creditSubscription",
            userId: "user-1",
            organizationId: "org-1",
            amountUsd,
          },
        },
      },
    }) as unknown as Stripe.Invoice;

  it("credits the invoice face value after either an increase or decrease", () => {
    expect(
      service.getMonthlyCreditInvoiceFunding(invoice(10000, "10")),
    ).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      amountUsd: 100,
    });
    expect(
      service.getMonthlyCreditInvoiceFunding(invoice(1000, "100")).amountUsd,
    ).toBe(10);
  });
  it("refuses to invent an owner or amount from missing evidence", () => {
    expect(() =>
      service.getMonthlyCreditInvoiceFunding({
        subtotal: 10000,
      } as Stripe.Invoice),
    ).toThrow();
    expect(() =>
      service.getMonthlyCreditInvoiceFunding(invoice(NaN, "100")),
    ).toThrow();
  });
});
