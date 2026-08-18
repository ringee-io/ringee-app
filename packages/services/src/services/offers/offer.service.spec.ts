/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Offer, OfferParticipation } from "@ringee/database";
import { OfferService } from "./offer.service";
import { OfferActionService } from "./offer-action.service";
import { OfferEligibilityEngine } from "./offer-eligibility.engine";
import { OfferPresenter } from "./offer.presenter";
import { OfferRewardCalculator } from "./offer-reward.calculator";
import { isOfferLive, offerWindowFailure } from "./offer-window";
import type { OfferEligibilityContext } from "./offer.types";

const NOW = new Date("2026-08-18T12:00:00Z");

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1",
    slug: "offer-1",
    name: "Offer",
    internalName: null,
    title: "An offer",
    description: null,
    status: "ACTIVE",
    placement: "TOP_BANNER",
    priority: 50,
    audienceType: "BOTH",
    eligibilityConfig: {},
    actionConfig: { type: "CTA_ONLY" },
    rewardConfig: { type: "CREDIT", amount: 10 },
    displayConfig: {},
    frequencyConfig: {},
    startsAt: null,
    endsAt: null,
    maxClaims: null,
    maxClaimsPerUser: 1,
    requiresApproval: false,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    ...overrides,
  } as Offer;
}

const context: OfferEligibilityContext = {
  user: {
    id: "user-1",
    totalCalls: 1000,
    createdAt: new Date("2026-01-01"),
    daysSinceSignup: 200,
    role: null,
  },
  organization: null,
  workspace: { type: "personal", balance: 0 },
  members: [],
  now: NOW,
};

/**
 * Wires a real OfferService onto in-memory doubles. The engine, calculator,
 * presenter and action validator are the real implementations — only the
 * database layer is faked.
 */
function makeService(params: {
  offers: Offer[];
  participations?: OfferParticipation[];
  dismissals?: Array<{ offerId: string; dismissedAt: Date }>;
}) {
  const participations = params.participations ?? [];
  const dismissals = params.dismissals ?? [];

  const offerRepo = {
    async findRenderable({ audienceTypes }: { audienceTypes: string[] }) {
      // Mirrors the SQL filter: audience + live window, ordered by priority.
      return params.offers
        .filter(
          (offer) =>
            audienceTypes.includes(offer.audienceType) &&
            isOfferLive(offer, NOW),
        )
        .sort((a, b) => b.priority - a.priority);
    },
    async findByIdOrSlug(idOrSlug: string) {
      return (
        params.offers.find(
          (offer) => offer.id === idOrSlug || offer.slug === idOrSlug,
        ) ?? null
      );
    },
  };

  const participationRepo = {
    async findForUserAcrossOffers() {
      return participations;
    },
    async findForUser(offerId: string) {
      return participations.filter((p) => p.offerId === offerId);
    },
    async countClaimsByOffer(ids: string[]) {
      const counts = new Map<string, number>();
      for (const id of ids) {
        counts.set(
          id,
          participations.filter(
            (p) => p.offerId === id && p.status !== "REJECTED",
          ).length,
        );
      }
      return counts;
    },
    async userIdsWithClaim() {
      return new Set<string>();
    },
  };

  const dismissalRepo = {
    async findForUser() {
      return dismissals;
    },
  };

  const contextBuilder = {
    async build() {
      return context;
    },
  };
  const eligibility = new OfferEligibilityEngine();
  const rewards = new OfferRewardCalculator(eligibility);

  return new OfferService(
    offerRepo as never,
    participationRepo as never,
    dismissalRepo as never,
    contextBuilder as never,
    eligibility,
    rewards,
    {
      async execute() {
        throw new Error("not used");
      },
    } as never,
    new OfferActionService(),
    new OfferPresenter(),
    { record() {}, recordMany() {} } as never,
  );
}

const user = { id: "user-1", activeOrgId: null, activeOrgRole: null };

describe("offer window", () => {
  it("hides a paused offer", () => {
    assert.equal(
      offerWindowFailure(makeOffer({ status: "PAUSED" }), NOW),
      "status",
    );
  });

  it("hides a draft, ended and archived offer", () => {
    for (const status of ["DRAFT", "ENDED", "ARCHIVED"] as const) {
      assert.equal(isOfferLive(makeOffer({ status }), NOW), false);
    }
  });

  it("hides an expired offer", () => {
    const offer = makeOffer({ endsAt: new Date("2026-08-18T11:59:59Z") });
    assert.equal(offerWindowFailure(offer, NOW), "ended");
  });

  it("hides an offer that has not started", () => {
    const offer = makeOffer({ startsAt: new Date("2026-08-19T00:00:00Z") });
    assert.equal(offerWindowFailure(offer, NOW), "not_started");
  });

  it("shows an offer inside its window", () => {
    const offer = makeOffer({
      startsAt: new Date("2026-08-01T00:00:00Z"),
      endsAt: new Date("2026-09-01T00:00:00Z"),
    });
    assert.equal(isOfferLive(offer, NOW), true);
  });
});

describe("OfferService.listAvailable", () => {
  it("returns nothing when every offer is paused or expired", async () => {
    const service = makeService({
      offers: [
        makeOffer({ id: "a", slug: "a", status: "PAUSED" }),
        makeOffer({
          id: "b",
          slug: "b",
          endsAt: new Date("2026-08-01T00:00:00Z"),
        }),
        makeOffer({
          id: "c",
          slug: "c",
          startsAt: new Date("2026-12-01T00:00:00Z"),
        }),
      ],
    });
    assert.deepEqual(await service.listAvailable(user as never), []);
  });

  it("orders competing banners by priority", async () => {
    const service = makeService({
      offers: [
        makeOffer({ id: "low", slug: "low", priority: 10 }),
        makeOffer({ id: "high", slug: "high", priority: 100 }),
        makeOffer({ id: "mid", slug: "mid", priority: 50 }),
      ],
    });

    const offers = await service.listAvailable(user as never);
    assert.deepEqual(
      offers.map((o) => o.slug),
      ["high", "mid", "low"],
    );

    // TOP_BANNER shows one slot today; the list is already ordered for it.
    const top = await service.listAvailable(user as never, { limit: 1 });
    assert.deepEqual(
      top.map((o) => o.slug),
      ["high"],
    );
  });

  it("withholds an offer whose eligibility rules do not pass", async () => {
    const service = makeService({
      offers: [
        makeOffer({
          eligibilityConfig: {
            personal: {
              all: [{ field: "user.totalCalls", operator: "gte", value: 5000 }],
            },
          },
        }),
      ],
    });
    assert.deepEqual(await service.listAvailable(user as never), []);
  });

  it("does not show an organization-only offer in a personal workspace", async () => {
    const service = makeService({
      offers: [makeOffer({ audienceType: "ORGANIZATION" })],
    });
    assert.deepEqual(await service.listAvailable(user as never), []);
  });

  it("hides a dismissed offer until its snooze expires", async () => {
    const offer = makeOffer({
      frequencyConfig: { dismissible: true, showAgainAfterHours: 168 },
    });

    const snoozed = makeService({
      offers: [offer],
      dismissals: [
        { offerId: offer.id, dismissedAt: new Date("2026-08-17T12:00:00Z") },
      ],
    });
    assert.deepEqual(await snoozed.listAvailable(user as never), []);

    const expired = makeService({
      offers: [offer],
      dismissals: [
        { offerId: offer.id, dismissedAt: new Date("2026-08-01T12:00:00Z") },
      ],
    });
    assert.equal((await expired.listAvailable(user as never)).length, 1);
  });

  it("keeps a dismissal permanent when the offer sets no snooze window", async () => {
    const offer = makeOffer({ frequencyConfig: { dismissible: true } });
    const service = makeService({
      offers: [offer],
      dismissals: [
        { offerId: offer.id, dismissedAt: new Date("2020-01-01T00:00:00Z") },
      ],
    });
    assert.deepEqual(await service.listAvailable(user as never), []);
  });

  it("hides an offer the user has already been rewarded for", async () => {
    const offer = makeOffer();
    const service = makeService({
      offers: [offer],
      participations: [
        {
          id: "p1",
          offerId: offer.id,
          userId: "user-1",
          organizationId: null,
          claimIndex: 0,
          status: "REWARDED",
        } as OfferParticipation,
      ],
    });
    assert.deepEqual(await service.listAvailable(user as never), []);
  });

  it("keeps showing an offer while the claim is awaiting review", async () => {
    const offer = makeOffer({ requiresApproval: true });
    const service = makeService({
      offers: [offer],
      participations: [
        {
          id: "p1",
          offerId: offer.id,
          userId: "user-1",
          organizationId: null,
          claimIndex: 0,
          status: "PENDING_APPROVAL",
          submittedAt: NOW,
          rewardedAt: null,
          rejectionReason: null,
        } as OfferParticipation,
      ],
    });

    const [presented] = await service.listAvailable(user as never);
    assert.equal(presented.participation?.status, "PENDING_APPROVAL");
  });

  it("stops showing an offer that hit its global claim cap", async () => {
    const offer = makeOffer({ maxClaims: 1 });
    const service = makeService({
      offers: [offer],
      participations: [
        {
          id: "p1",
          offerId: offer.id,
          userId: "someone-else",
          organizationId: null,
          claimIndex: 0,
          status: "REWARDED",
        } as OfferParticipation,
      ],
    });
    assert.deepEqual(await service.listAvailable(user as never), []);
  });
});

describe("OfferService direct actions", () => {
  it("refuses to submit to a paused offer", async () => {
    const service = makeService({
      offers: [makeOffer({ status: "PAUSED" })],
    });
    await assert.rejects(
      service.submit(user as never, "offer-1", {}),
      /not available/i,
    );
  });

  it("refuses to submit to an expired offer", async () => {
    const service = makeService({
      offers: [makeOffer({ endsAt: new Date("2026-01-01T00:00:00Z") })],
    });
    await assert.rejects(
      service.submit(user as never, "offer-1", {}),
      /has ended/i,
    );
  });

  it("refuses to submit when the user is not eligible", async () => {
    const service = makeService({
      offers: [
        makeOffer({
          eligibilityConfig: {
            personal: {
              all: [{ field: "user.totalCalls", operator: "gte", value: 5000 }],
            },
          },
        }),
      ],
    });
    await assert.rejects(
      service.submit(user as never, "offer-1", {}),
      /not eligible/i,
    );
  });
});
