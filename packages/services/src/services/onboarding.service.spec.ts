/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { UserRepository } from "@ringee/database";
import type { ContactListActor, ContactListService } from "./contact-lists";
import type { CreditService } from "./credit.service";
import {
  FIRST_LIST_REWARD_USD,
  ONBOARDING_REWARD_SOURCE,
  OnboardingService,
} from "./onboarding.service";

const ana: ContactListActor = {
  userId: "ana",
  organizationId: null,
  isOrgAdmin: false,
};
const orgAdmin: ContactListActor = {
  userId: "ana",
  organizationId: "org-1",
  isOrgAdmin: true,
};
const orgMember: ContactListActor = {
  userId: "ana",
  organizationId: "org-1",
  isOrgAdmin: false,
};

interface ListStub {
  id: string;
  createdBy: string;
  assignedTo: string | null;
  contactCount: number;
}

/** In-memory stand-ins for the user row, the lists and the balance. */
function build(options: {
  balance?: number;
  steps?: string[];
  lists?: ListStub[];
  /** What the ledger answers: false once the key was already spent. */
  grantGranted?: boolean;
}) {
  const steps = [...(options.steps ?? [])];
  let balance = options.balance ?? 0;
  let balanceReads = 0;
  const grants: Array<{
    ctx: unknown;
    amount: number;
    ref: { idempotencyKey: string; source: string; metadata?: unknown };
  }> = [];
  const lists = new Map((options.lists ?? []).map((l) => [l.id, l]));

  const users = {
    getOnboardingStatus: async () => ({
      completedSteps: [...steps],
      dismissedAt: null,
    }),
    completeOnboardingStep: async (_id: string, step: string) => {
      if (!steps.includes(step)) steps.push(step);
    },
  } as unknown as UserRepository;

  const contactLists = {
    get: async (_actor: ContactListActor, listId: string) => {
      const list = lists.get(listId);
      if (!list) throw new NotFoundException("List not found");
      return {
        id: list.id,
        contactCount: list.contactCount,
        createdBy: { id: list.createdBy },
        assignedTo: list.assignedTo ? { id: list.assignedTo } : null,
      };
    },
  } as unknown as ContactListService;

  const credits = {
    getBalance: async () => {
      balanceReads++;
      return balance;
    },
    grantCreditsOnce: async (
      ctx: unknown,
      amount: number,
      ref: { idempotencyKey: string; source: string },
    ) => {
      grants.push({ ctx, amount, ref });
      const granted = options.grantGranted ?? true;
      if (granted) balance += amount;
      return { balance, granted };
    },
  } as unknown as CreditService;

  return {
    service: new OnboardingService(users, contactLists, credits),
    steps,
    grants,
    balanceReads: () => balanceReads,
  };
}

const ownList: ListStub = {
  id: "list-1",
  createdBy: "ana",
  assignedTo: "ana",
  contactCount: 3,
};

describe("OnboardingService — setup guide", () => {
  it("counts only the guide's own steps", async () => {
    const { service } = build({ steps: ["first_list", "first_call"] });

    const status = await service.getStatus("ana");

    assert.deepEqual(status.completedSteps, ["first_call"]);
    assert.equal(status.progress, 20);
    assert.equal(status.isComplete, false);
  });

  it("does not let the generic endpoint mark the first list", async () => {
    const { service, steps } = build({});

    await assert.rejects(
      service.completeStep("ana", "first_list" as never),
      NotFoundException,
    );
    assert.deepEqual(steps, []);
  });
});

describe("OnboardingService — first list (BILL-022)", () => {
  it("offers the gift while the balance is empty", async () => {
    const { service } = build({ balance: 0 });

    assert.deepEqual(await service.getFirstList(ana), {
      completed: false,
      reward: FIRST_LIST_REWARD_USD,
    });
  });

  it("offers nothing to a workspace that has credit", async () => {
    const { service } = build({ balance: 4.2 });

    assert.deepEqual(await service.getFirstList(ana), {
      completed: false,
      reward: 0,
    });
  });

  it("offers nothing once it is done", async () => {
    const { service } = build({ balance: 0, steps: ["first_list"] });

    assert.deepEqual(await service.getFirstList(ana), {
      completed: true,
      reward: 0,
    });
  });

  it("grants $1 once, keyed on the user, into an empty balance", async () => {
    const { service, steps, grants } = build({
      balance: 0,
      lists: [ownList],
    });

    const result = await service.completeFirstList(ana, "list-1");

    assert.deepEqual(result, {
      completed: true,
      rewardGranted: FIRST_LIST_REWARD_USD,
    });
    assert.equal(grants.length, 1);
    assert.equal(grants[0]!.amount, 1);
    assert.equal(grants[0]!.ref.idempotencyKey, "onboarding:first-list:ana");
    assert.equal(grants[0]!.ref.source, ONBOARDING_REWARD_SOURCE);
    assert.deepEqual(steps, ["first_list"]);
  });

  it("never grants twice", async () => {
    const { service, grants } = build({ balance: 0, lists: [ownList] });

    await service.completeFirstList(ana, "list-1");
    const again = await service.completeFirstList(ana, "list-1");

    assert.equal(again.rewardGranted, 0);
    assert.equal(grants.length, 1);
  });

  it("completes without a gift when there is credit", async () => {
    const { service, steps, grants } = build({
      balance: 12,
      lists: [ownList],
    });

    const result = await service.completeFirstList(ana, "list-1");

    assert.equal(result.rewardGranted, 0);
    assert.equal(grants.length, 0);
    assert.deepEqual(steps, ["first_list"]);
  });

  it("gives nothing to a balance in debt", async () => {
    const { service, grants } = build({ balance: -0.3, lists: [ownList] });

    const result = await service.completeFirstList(ana, "list-1");

    assert.equal(result.rewardGranted, 0);
    assert.equal(grants.length, 0);
  });

  it("treats float dust as an empty balance", async () => {
    const { service, grants } = build({
      balance: 0.0000001,
      lists: [ownList],
    });

    await service.completeFirstList(ana, "list-1");

    assert.equal(grants.length, 1);
  });

  it("reports no gift when the ledger already had it", async () => {
    const { service, steps } = build({
      balance: 0,
      lists: [ownList],
      grantGranted: false,
    });

    const result = await service.completeFirstList(ana, "list-1");

    assert.equal(result.rewardGranted, 0);
    assert.deepEqual(steps, ["first_list"]);
  });

  it("refuses a list somebody else created or works", async () => {
    const { service, steps, grants } = build({
      balance: 0,
      lists: [
        { ...ownList, id: "from-admin", createdBy: "admin" },
        { ...ownList, id: "for-bruno", assignedTo: "bruno" },
      ],
    });

    await assert.rejects(
      service.completeFirstList(ana, "from-admin"),
      BadRequestException,
    );
    await assert.rejects(
      service.completeFirstList(ana, "for-bruno"),
      BadRequestException,
    );
    assert.equal(grants.length, 0);
    assert.deepEqual(steps, []);
  });

  it("refuses an empty list", async () => {
    const { service, grants } = build({
      balance: 0,
      lists: [{ ...ownList, contactCount: 0 }],
    });

    await assert.rejects(
      service.completeFirstList(ana, "list-1"),
      BadRequestException,
    );
    assert.equal(grants.length, 0);
  });

  it("pays an org admin into the organization's empty balance", async () => {
    const { service, grants } = build({ balance: 0, lists: [ownList] });

    assert.equal((await service.getFirstList(orgAdmin)).reward, 1);
    const result = await service.completeFirstList(orgAdmin, "list-1");

    assert.equal(result.rewardGranted, 1);
    assert.deepEqual(grants[0]!.ctx, orgAdmin);
  });

  it("gives an org member nothing, without reading the balance", async () => {
    const { service, steps, grants, balanceReads } = build({
      balance: 0,
      lists: [ownList],
    });

    assert.equal((await service.getFirstList(orgMember)).reward, 0);
    const result = await service.completeFirstList(orgMember, "list-1");

    assert.equal(result.rewardGranted, 0);
    assert.equal(grants.length, 0);
    assert.equal(balanceReads(), 0);
    assert.deepEqual(steps, ["first_list"]);
  });

  it("answers 404 for a list the user cannot see", async () => {
    const { service, grants } = build({ balance: 0 });

    await assert.rejects(
      service.completeFirstList(ana, "somebody-elses"),
      NotFoundException,
    );
    assert.equal(grants.length, 0);
  });
});
