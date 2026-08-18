/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Offer } from "@ringee/database";
import { OfferEligibilityEngine } from "./offer-eligibility.engine";
import { OfferRewardCalculator } from "./offer-reward.calculator";
import { OfferPresenter } from "./offer.presenter";
import type {
  OfferContextMember,
  OfferEligibilityContext,
} from "./offer.types";

/**
 * The review offer is expressed here exactly as it is seeded — as data. If any
 * of these assertions ever needs an offer-specific branch in the engine, the
 * design has gone wrong.
 */
const REVIEW_ELIGIBILITY = {
  personal: {
    all: [{ field: "user.totalCalls", operator: "gte", value: 300 }],
  },
  organization: {
    workspace: {
      all: [{ field: "organization.totalCalls", operator: "gte", value: 300 }],
    },
    member: {
      all: [{ field: "user.totalCalls", operator: "gte", value: 50 }],
    },
  },
};

const REVIEW_REWARD = {
  personal: {
    type: "CREDIT",
    amount: 10,
    currency: "USD",
    destination: "PERSONAL_WORKSPACE",
  },
  organization: {
    type: "CREDIT",
    amount: 5,
    currency: "USD",
    destination: "ORGANIZATION",
  },
};

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1",
    slug: "customer-review",
    name: "Customer review reward",
    internalName: null,
    title: "Earn Ringee credits",
    description: null,
    status: "ACTIVE",
    placement: "TOP_BANNER",
    priority: 100,
    audienceType: "BOTH",
    eligibilityConfig: REVIEW_ELIGIBILITY,
    actionConfig: { type: "EXTERNAL_URL_SUBMISSION" },
    rewardConfig: REVIEW_REWARD,
    displayConfig: {},
    frequencyConfig: {},
    startsAt: null,
    endsAt: null,
    maxClaims: null,
    maxClaimsPerUser: 1,
    requiresApproval: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    ...overrides,
  } as Offer;
}

function personalContext(totalCalls: number): OfferEligibilityContext {
  return {
    user: {
      id: "user-1",
      totalCalls,
      createdAt: new Date("2026-01-01"),
      daysSinceSignup: 200,
      role: null,
    },
    organization: null,
    workspace: { type: "personal", balance: 0 },
    members: [],
    now: new Date("2026-08-18"),
  };
}

function orgContext(
  organizationTotalCalls: number,
  members: OfferContextMember[],
  callerId = members[0]?.userId ?? "user-1",
): OfferEligibilityContext {
  const self = members.find((m) => m.userId === callerId);
  return {
    user: {
      id: callerId,
      totalCalls: self?.totalCalls ?? 0,
      createdAt: new Date("2026-01-01"),
      daysSinceSignup: 200,
      role: self?.role ?? "org:member",
    },
    organization: {
      id: "org-1",
      totalCalls: organizationTotalCalls,
      memberCount: members.length,
      createdAt: new Date("2026-01-01"),
      daysSinceCreated: 200,
    },
    workspace: { type: "organization", balance: 0 },
    members,
    now: new Date("2026-08-18"),
  };
}

const members = (...calls: Array<[string, number]>): OfferContextMember[] =>
  calls.map(([userId, totalCalls]) => ({
    userId,
    totalCalls,
    role: "org:member",
  }));

describe("OfferEligibilityEngine — personal workspace", () => {
  const engine = new OfferEligibilityEngine();

  it("withholds the offer one call below the threshold", () => {
    const result = engine.evaluate(makeOffer(), personalContext(299));
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "user.totalCalls gte 300");
  });

  it("unlocks the offer exactly at the threshold", () => {
    assert.equal(
      engine.evaluate(makeOffer(), personalContext(300)).eligible,
      true,
    );
  });

  it("does not show an organization-only offer to a freelancer", () => {
    const offer = makeOffer({ audienceType: "ORGANIZATION" });
    assert.equal(engine.evaluate(offer, personalContext(1000)).eligible, false);
  });
});

describe("OfferEligibilityEngine — organization workspace", () => {
  const engine = new OfferEligibilityEngine();

  it("withholds the offer from everyone when the team is below the org threshold", () => {
    const context = orgContext(299, members(["a", 120], ["b", 83]));
    assert.equal(engine.evaluate(makeOffer(), context).eligible, false);
    assert.deepEqual(
      engine
        .eligibleMembers(makeOffer(), context)
        .map((m) => m.userId)
        .sort(),
      ["a", "b"],
    );
    // The member rule passes for both, but the workspace gate does not, so the
    // reward calculator must still yield nothing.
    assert.equal(engine.workspaceQualifies(makeOffer(), context), false);
  });

  it("withholds the offer from a member below the member threshold", () => {
    const context = orgContext(300, members(["a", 49]), "a");
    assert.equal(engine.evaluate(makeOffer(), context).eligible, false);
  });

  it("unlocks the offer for a member exactly at the member threshold", () => {
    const context = orgContext(300, members(["a", 50]), "a");
    assert.equal(engine.evaluate(makeOffer(), context).eligible, true);
  });

  it("counts only the members who pass the member rule", () => {
    const context = orgContext(
      1300,
      members(["a", 120], ["b", 83], ["c", 52], ["d", 40], ["e", 10]),
    );
    assert.deepEqual(
      engine.eligibleMembers(makeOffer(), context).map((m) => m.userId),
      ["a", "b", "c"],
    );
  });
});

describe("OfferRewardCalculator — potential rewards", () => {
  const engine = new OfferEligibilityEngine();
  const calculator = new OfferRewardCalculator(engine);

  it("multiplies the per-member amount by the eligible members", () => {
    const context = orgContext(
      1300,
      members(["a", 120], ["b", 83], ["c", 52], ["d", 40]),
    );
    const reward = calculator.compute({
      offer: makeOffer(),
      context,
      claimedUserIds: new Set(),
    });

    assert.equal(reward.amount, 5);
    assert.equal(reward.eligibleParticipants, 3);
    assert.equal(reward.potentialAmount, 15);
  });

  it("drops members who already claimed out of the remaining potential", () => {
    const context = orgContext(
      1300,
      members(["a", 120], ["b", 83], ["c", 52], ["d", 61]),
    );

    const before = calculator.compute({
      offer: makeOffer(),
      context,
      claimedUserIds: new Set(),
    });
    assert.equal(before.eligibleParticipants, 4);
    assert.equal(before.potentialAmount, 20);

    const after = calculator.compute({
      offer: makeOffer(),
      context,
      claimedUserIds: new Set(["a"]),
    });
    assert.equal(after.eligibleParticipants, 4);
    assert.equal(after.remainingParticipants, 3);
    assert.equal(after.potentialAmount, 15);
  });

  it("offers nothing when the team is below the organization threshold", () => {
    const context = orgContext(299, members(["a", 120], ["b", 83]));
    const reward = calculator.compute({
      offer: makeOffer(),
      context,
      claimedUserIds: new Set(),
    });
    assert.equal(reward.potentialAmount, 0);
    assert.equal(reward.eligibleParticipants, 0);
  });

  it("pays the personal amount to the personal wallet", () => {
    const reward = calculator.compute({
      offer: makeOffer(),
      context: personalContext(300),
      claimedUserIds: new Set(),
    });
    assert.equal(reward.amount, 10);
    assert.equal(reward.potentialAmount, 10);
    assert.equal(reward.destination, "PERSONAL_WORKSPACE");
  });

  it("stops advertising a personal reward once it has been claimed", () => {
    const reward = calculator.compute({
      offer: makeOffer(),
      context: personalContext(300),
      claimedUserIds: new Set(["user-1"]),
    });
    assert.equal(reward.potentialAmount, 0);
    assert.equal(reward.remainingParticipants, 0);
  });
});

describe("OfferPresenter", () => {
  const engine = new OfferEligibilityEngine();
  const calculator = new OfferRewardCalculator(engine);
  const presenter = new OfferPresenter();

  const displayConfig = {
    personal: {
      title: "Earn ${{rewardAmount}} in Ringee credits",
      ctaLabel: "Claim ${{rewardAmount}}",
    },
    organization: {
      title: "Earn up to ${{potentialReward}} in Ringee credits",
      description:
        "{{remainingParticipants}} team members are currently eligible.",
      ctaLabel: "View offer",
    },
  };

  it("renders the organization copy with real numbers", () => {
    const offer = makeOffer({ displayConfig });
    const context = orgContext(
      1300,
      members(["a", 120], ["b", 83], ["c", 52], ["d", 40]),
    );
    const reward = calculator.compute({
      offer,
      context,
      claimedUserIds: new Set(),
    });

    const presented = presenter.present({
      offer,
      context,
      reward,
      participation: null,
    });

    assert.equal(presented.title, "Earn up to $15 in Ringee credits");
    assert.equal(
      presented.description,
      "3 team members are currently eligible.",
    );
    assert.equal(presented.cta.label, "View offer");
  });

  it("renders the personal copy", () => {
    const offer = makeOffer({ displayConfig });
    const context = personalContext(300);
    const reward = calculator.compute({
      offer,
      context,
      claimedUserIds: new Set(),
    });

    const presented = presenter.present({
      offer,
      context,
      reward,
      participation: null,
    });

    assert.equal(presented.title, "Earn $10 in Ringee credits");
    assert.equal(presented.cta.label, "Claim $10");
  });

  it("never leaks an unknown token into the rendered copy", () => {
    const offer = makeOffer({
      displayConfig: { title: "Hello {{nope}} world" },
    });
    const context = personalContext(300);
    const presented = presenter.present({
      offer,
      context,
      reward: calculator.compute({
        offer,
        context,
        claimedUserIds: new Set(),
      }),
      participation: null,
    });
    assert.equal(presented.title, "Hello  world");
  });
});
