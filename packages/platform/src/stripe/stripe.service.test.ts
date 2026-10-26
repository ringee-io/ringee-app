import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StripeService } from "./stripe.service";

const checkoutCreate = vi.hoisted(() =>
  vi.fn<(params: Stripe.Checkout.SessionCreateParams) => Promise<unknown>>(),
);

vi.mock("@ringee/configuration", () => ({ apiConfiguration: {} }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: checkoutCreate } };
  },
}));

beforeEach(() => {
  checkoutCreate.mockReset();
  checkoutCreate.mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.com/test",
  });
});

describe("USD-only Stripe Checkout", () => {
  const origin = "https://app.example.com";
  const cases = [
    {
      name: "one-time credit recharge",
      create: (service: StripeService) =>
        service.createOneTimePaymentSession(
          "user_test",
          "cus_test",
          25,
          "Credits",
          "org_test",
          origin,
        ),
      amounts: [2500],
    },
    {
      name: "phone number with activation fee",
      create: (service: StripeService) =>
        service.createPhoneNumberSubscriptionSession(
          "cus_test",
          "+12025550123",
          5,
          2,
          "user_test",
          "org_test",
          origin,
        ),
      amounts: [500, 200],
    },
    {
      name: "monthly Organization plan",
      create: (service: StripeService) =>
        service.createOrganizationSubscriptionSession(
          "cus_test",
          "user_test",
          "month",
          origin,
        ),
      amounts: [2000],
    },
    {
      name: "annual Organization plan",
      create: (service: StripeService) =>
        service.createOrganizationSubscriptionSession(
          "cus_test",
          "user_test",
          "year",
          origin,
        ),
      amounts: [20000],
    },
    {
      name: "monthly credit funding",
      create: (service: StripeService) =>
        service.createMonthlyCreditSubscriptionSession(
          "cus_test",
          "user_test",
          50,
          "org_test",
          origin,
        ),
      amounts: [5000],
    },
    {
      name: "initial auto-reload payment",
      create: (service: StripeService) =>
        service.createAutoReloadSetupSession(
          "cus_test",
          "user_test",
          25,
          "org_test",
          origin,
        ),
      amounts: [2500],
    },
  ];

  it.each(cases)(
    "$name disables local currency conversion and preserves USD amounts",
    async ({ create, amounts }) => {
      await create(new StripeService());

      expect(checkoutCreate).toHaveBeenCalledOnce();
      const [params] = checkoutCreate.mock.calls[0];
      expect(params.currency).toBe("usd");
      expect(params.adaptive_pricing).toEqual({ enabled: false });
      expect(
        params.line_items?.map((item) => item.price_data?.currency),
      ).toEqual(amounts.map(() => "usd"));
      expect(
        params.line_items?.map((item) => item.price_data?.unit_amount),
      ).toEqual(amounts);
    },
  );
});
