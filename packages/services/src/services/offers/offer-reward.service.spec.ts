/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Offer, OfferParticipation } from "@ringee/database";
import { OfferEligibilityEngine } from "./offer-eligibility.engine";
import { OfferRewardCalculator } from "./offer-reward.calculator";
import { OfferRewardService } from "./offer-reward.service";

/**
 * A stand-in for the credit ledger with the same guarantee the database gives:
 * a key can only be spent once, whatever the caller does.
 */
function fakeCredits() {
  const spentKeys = new Set<string>();
  const grants: Array<{
    owner: { userId: string; organizationId: string | null };
    amount: number;
    key: string;
    metadata: unknown;
  }> = [];

  return {
    grants,
    async grantCreditsOnce(
      owner: { userId: string; organizationId?: string | null },
      amount: number,
      ref: {
        idempotencyKey: string;
        source: string;
        metadata?: Record<string, unknown> | null;
      },
    ) {
      if (spentKeys.has(ref.idempotencyKey)) {
        return { balance: 0, granted: false };
      }
      spentKeys.add(ref.idempotencyKey);
      grants.push({
        owner: {
          userId: owner.userId,
          organizationId: owner.organizationId ?? null,
        },
        amount,
        key: ref.idempotencyKey,
        metadata: ref.metadata,
      });
      return { balance: amount, granted: true };
    },
  };
}

function fakeParticipations(initial: OfferParticipation) {
  let row = { ...initial };
  return {
    get current() {
      return row;
    },
    async markRewarded(params: {
      id: string;
      rewardAmount: number;
      rewardCurrency: string;
    }) {
      row = {
        ...row,
        status: "REWARDED",
        rewardAmount: params.rewardAmount,
        rewardCurrency: params.rewardCurrency,
        rewardedAt: row.rewardedAt ?? new Date(),
        completedAt: row.completedAt ?? new Date(),
      } as OfferParticipation;
      return row;
    },
    async transition() {
      return row;
    },
  };
}

function offerWith(rewardConfig: unknown): Offer {
  return {
    id: "offer-1",
    slug: "customer-review",
    rewardConfig,
  } as unknown as Offer;
}

function participation(
  overrides: Partial<OfferParticipation> = {},
): OfferParticipation {
  return {
    id: "participation-1",
    offerId: "offer-1",
    userId: "user-1",
    organizationId: null,
    status: "APPROVED",
    rewardedAt: null,
    completedAt: null,
    ...overrides,
  } as OfferParticipation;
}

function makeService(
  credits: ReturnType<typeof fakeCredits>,
  participations: unknown,
) {
  const calculator = new OfferRewardCalculator(new OfferEligibilityEngine());
  return new OfferRewardService(
    credits as never,
    participations as never,
    calculator,
  );
}

describe("OfferRewardService — duplicate protection", () => {
  it("issues exactly one credit when the same approval runs twice", async () => {
    const credits = fakeCredits();
    const row = participation();
    const participations = fakeParticipations(row);
    const service = makeService(credits, participations);
    const offer = offerWith({
      personal: {
        type: "CREDIT",
        amount: 10,
        currency: "USD",
        destination: "PERSONAL_WORKSPACE",
      },
    });

    const first = await service.execute({ offer, participation: row });
    const second = await service.execute({
      offer,
      participation: participations.current,
    });

    assert.equal(first.granted, true);
    assert.equal(second.granted, false);
    assert.equal(credits.grants.length, 1);
    assert.equal(credits.grants[0].amount, 10);
    // Both attempts still converge on REWARDED, so a lost race self-heals.
    assert.equal(second.participation.status, "REWARDED");
  });

  it("issues exactly one credit when two approvals race", async () => {
    const credits = fakeCredits();
    const row = participation();
    const service = makeService(credits, fakeParticipations(row));
    const offer = offerWith({
      type: "CREDIT",
      amount: 10,
      destination: "PERSONAL_WORKSPACE",
    });

    const [a, b] = await Promise.all([
      service.execute({ offer, participation: row }),
      service.execute({ offer, participation: row }),
    ]);

    assert.equal(credits.grants.length, 1);
    assert.equal([a.granted, b.granted].filter(Boolean).length, 1);
  });

  it("keys the ledger on the participation", async () => {
    const credits = fakeCredits();
    const row = participation();
    const service = makeService(credits, fakeParticipations(row));

    await service.execute({
      offer: offerWith({ type: "CREDIT", amount: 10 }),
      participation: row,
    });

    assert.equal(credits.grants[0].key, "offer_reward:participation-1");
    assert.deepEqual(credits.grants[0].metadata, {
      offerId: "offer-1",
      offerSlug: "customer-review",
      participationId: "participation-1",
    });
  });
});

describe("OfferRewardService — destination", () => {
  it("pays the organization wallet for an organization claim", async () => {
    const credits = fakeCredits();
    const row = participation({ organizationId: "org-1" });
    const service = makeService(credits, fakeParticipations(row));

    await service.execute({
      offer: offerWith({
        organization: {
          type: "CREDIT",
          amount: 5,
          destination: "ORGANIZATION",
        },
      }),
      participation: row,
    });

    assert.deepEqual(credits.grants[0].owner, {
      userId: "user-1",
      organizationId: "org-1",
    });
    assert.equal(credits.grants[0].amount, 5);
  });

  it("pays the member's own wallet when the offer says so, even inside an org", async () => {
    const credits = fakeCredits();
    const row = participation({ organizationId: "org-1" });
    const service = makeService(credits, fakeParticipations(row));

    await service.execute({
      offer: offerWith({
        organization: {
          type: "CREDIT",
          amount: 5,
          destination: "PERSONAL_WORKSPACE",
        },
      }),
      participation: row,
    });

    assert.deepEqual(credits.grants[0].owner, {
      userId: "user-1",
      organizationId: null,
    });
  });

  it("refuses to pay an organization that the claim does not have", async () => {
    const credits = fakeCredits();
    const row = participation({ organizationId: null });
    const service = makeService(credits, fakeParticipations(row));

    await assert.rejects(
      service.execute({
        offer: offerWith({
          type: "CREDIT",
          amount: 5,
          destination: "ORGANIZATION",
        }),
        participation: row,
      }),
      /no organization/i,
    );
    assert.equal(credits.grants.length, 0);
  });

  it("completes a rewardless offer without touching credits", async () => {
    const credits = fakeCredits();
    const row = participation();
    const service = makeService(credits, fakeParticipations(row));

    const result = await service.execute({
      offer: offerWith({ type: "NONE" }),
      participation: row,
    });

    assert.equal(result.granted, false);
    assert.equal(result.amount, 0);
    assert.equal(credits.grants.length, 0);
  });
});
