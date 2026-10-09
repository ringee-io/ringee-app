/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { UserRepository } from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
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
const anaAsAdmin: ContactListActor = {
  userId: "ana",
  organizationId: "org-1",
  isOrgAdmin: true,
};
const bea: ContactListActor = {
  userId: "bea",
  organizationId: "org-1",
  isOrgAdmin: true,
};
const member: ContactListActor = {
  userId: "carl",
  organizationId: "org-1",
  isOrgAdmin: false,
};

function workspaceOf(ctx: OwnershipContext): string {
  return ctx.organizationId
    ? `org:${ctx.organizationId}`
    : `user:${ctx.userId}`;
}

interface ListStub {
  id: string;
  /** `user:<id>` or `org:<id>`. */
  workspace: string;
  createdBy: string;
  assignedTo: string | null;
  contactCount: number;
}

/** A list `who` made for themselves in their workspace, with people in it. */
function listOf(id: string, who: ContactListActor, contactCount = 3): ListStub {
  return {
    id,
    workspace: workspaceOf(who),
    createdBy: who.userId,
    assignedTo: who.userId,
    contactCount,
  };
}

/**
 * In-memory stand-ins for the user rows, the lists (in creation order) and
 * the balances, with a ledger whose keys are unique like `CreditGrant`'s.
 */
function build(
  options: {
    balances?: Record<string, number>;
    steps?: Record<string, string[]>;
    lists?: ListStub[];
  } = {},
) {
  const steps = new Map(
    Object.entries(options.steps ?? {}).map(([u, s]) => [u, [...s]]),
  );
  const balances = new Map(Object.entries(options.balances ?? {}));
  const lists = [...(options.lists ?? [])];
  const ledger = new Set<string>();
  const grants: Array<{
    workspace: string;
    amount: number;
    ref: { idempotencyKey: string; source: string };
  }> = [];
  let balanceReads = 0;

  const users = {
    getOnboardingStatus: async (userId: string) => ({
      completedSteps: [...(steps.get(userId) ?? [])],
      dismissedAt: null,
    }),
    completeOnboardingStep: async (userId: string, step: string) => {
      const mine = steps.get(userId) ?? [];
      if (!mine.includes(step)) mine.push(step);
      steps.set(userId, mine);
    },
  } as unknown as UserRepository;

  const contactLists = {
    firstListInWorkspace: async (ctx: OwnershipContext) =>
      lists.find((l) => l.workspace === workspaceOf(ctx))?.id ?? null,
    get: async (_actor: ContactListActor, listId: string) => {
      const list = lists.find((l) => l.id === listId);
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
    getBalance: async (ctx: OwnershipContext) => {
      balanceReads++;
      return balances.get(workspaceOf(ctx)) ?? 0;
    },
    grantCreditsOnce: async (
      ctx: OwnershipContext,
      amount: number,
      ref: { idempotencyKey: string; source: string },
    ) => {
      const workspace = workspaceOf(ctx);
      const balance = balances.get(workspace) ?? 0;
      if (ledger.has(ref.idempotencyKey)) return { balance, granted: false };
      ledger.add(ref.idempotencyKey);
      grants.push({ workspace, amount, ref });
      balances.set(workspace, balance + amount);
      return { balance: balance + amount, granted: true };
    },
  } as unknown as CreditService;

  return {
    service: new OnboardingService(users, contactLists, credits),
    lists,
    grants,
    balances,
    stepsOf: (userId: string) => steps.get(userId) ?? [],
    balanceReads: () => balanceReads,
  };
}

describe("OnboardingService — setup guide", () => {
  it("counts only the guide's own steps", async () => {
    const { service } = build({
      steps: {
        ana: [
          "first_list",
          "first_list:org-1",
          "request_free_call",
          "first_call",
        ],
      },
    });

    const status = await service.getStatus("ana");

    assert.deepEqual(status.completedSteps, ["first_call"]);
    assert.equal(status.totalSteps, 4);
    assert.equal(status.progress, 25);
    assert.equal(status.isComplete, false);
  });

  it("does not let the generic endpoint mark the first list", async () => {
    const { service, stepsOf } = build();

    await assert.rejects(
      service.completeStep("ana", "first_list" as never),
      NotFoundException,
    );
    assert.deepEqual(stepsOf("ana"), []);
  });
});

describe("OnboardingService — first list gift (BILL-022)", () => {
  it("offers $1 to an empty workspace with no list yet", async () => {
    const { service } = build();

    assert.deepEqual(await service.getFirstList(ana), {
      completed: false,
      reward: FIRST_LIST_REWARD_USD,
    });
  });

  it("offers nothing to a workspace that has credit", async () => {
    const { service } = build({ balances: { "user:ana": 4.2 } });

    assert.equal((await service.getFirstList(ana)).reward, 0);
  });

  it("offers nothing once the workspace has a list", async () => {
    const { service } = build({ lists: [listOf("made-earlier", ana)] });

    assert.equal((await service.getFirstList(ana)).reward, 0);
  });

  it("offers nothing once it is done here", async () => {
    const { service } = build({ steps: { ana: ["first_list"] } });

    assert.deepEqual(await service.getFirstList(ana), {
      completed: true,
      reward: 0,
    });
  });

  it("grants $1 for the workspace's first list, into an empty balance", async () => {
    const { service, grants, stepsOf } = build({
      lists: [listOf("list-1", ana)],
    });

    const result = await service.completeFirstList(ana, "list-1");

    assert.deepEqual(result, {
      completed: true,
      rewardGranted: FIRST_LIST_REWARD_USD,
    });
    assert.equal(grants.length, 1);
    assert.equal(grants[0]!.amount, 1);
    assert.equal(grants[0]!.workspace, "user:ana");
    assert.equal(
      grants[0]!.ref.idempotencyKey,
      "onboarding:first-list:user:ana",
    );
    assert.equal(grants[0]!.ref.source, ONBOARDING_REWARD_SOURCE);
    assert.deepEqual(stepsOf("ana"), ["first_list"]);
  });

  it("never pays another list, even back at $0", async () => {
    const { service, lists, grants, balances } = build({
      lists: [listOf("list-1", ana)],
    });

    await service.completeFirstList(ana, "list-1");
    balances.set("user:ana", 0); // the $1 got spent
    lists.push(listOf("list-2", ana));
    const later = await service.completeFirstList(ana, "list-2");

    assert.equal(later.rewardGranted, 0);
    assert.equal(grants.length, 1);
  });

  it("gives nothing for a list that is not the workspace's first", async () => {
    const { service, grants, stepsOf } = build({
      lists: [listOf("made-on-the-lists-page", ana), listOf("list-2", ana)],
    });

    const result = await service.completeFirstList(ana, "list-2");

    assert.equal(result.rewardGranted, 0);
    assert.equal(grants.length, 0);
    // The window closes all the same: no later list can claim it.
    assert.deepEqual(stepsOf("ana"), ["first_list"]);
  });

  it("only the first time: no gift then means no gift later", async () => {
    const { service, lists, grants, balances } = build({
      balances: { "user:ana": 7 },
      lists: [listOf("list-1", ana)],
    });

    const first = await service.completeFirstList(ana, "list-1");
    balances.set("user:ana", 0);
    lists.splice(0, 1, listOf("list-2", ana)); // the first list is deleted
    const later = await service.completeFirstList(ana, "list-2");

    assert.equal(first.rewardGranted, 0);
    assert.equal(later.rewardGranted, 0);
    assert.equal(grants.length, 0);
  });

  it("gives nothing to a balance in debt", async () => {
    const { service, grants } = build({
      balances: { "user:ana": -0.3 },
      lists: [listOf("list-1", ana)],
    });

    const result = await service.completeFirstList(ana, "list-1");

    assert.equal(result.rewardGranted, 0);
    assert.equal(grants.length, 0);
  });

  it("treats float dust as an empty balance", async () => {
    const { service, grants } = build({
      balances: { "user:ana": 0.0000001 },
      lists: [listOf("list-1", ana)],
    });

    await service.completeFirstList(ana, "list-1");

    assert.equal(grants.length, 1);
  });

  it("pays an organization once, whichever admin finishes first", async () => {
    const { service, lists, grants, stepsOf } = build({
      lists: [listOf("org-list-1", bea)],
    });

    const first = await service.completeFirstList(bea, "org-list-1");
    lists.push(listOf("org-list-2", anaAsAdmin));
    const second = await service.completeFirstList(anaAsAdmin, "org-list-2");

    assert.equal(first.rewardGranted, 1);
    assert.equal(second.rewardGranted, 0);
    assert.equal(grants.length, 1);
    assert.equal(grants[0]!.workspace, "org:org-1");
    assert.equal(
      grants[0]!.ref.idempotencyKey,
      "onboarding:first-list:org:org-1",
    );
    assert.deepEqual(stepsOf("bea"), ["first_list:org-1"]);
  });

  it("pays the organization even when its admin was paid personally", async () => {
    const { service, lists, grants } = build({
      lists: [listOf("personal-1", ana)],
    });

    await service.completeFirstList(ana, "personal-1");
    lists.push(listOf("org-list-1", anaAsAdmin));
    const org = await service.completeFirstList(anaAsAdmin, "org-list-1");

    assert.equal(org.rewardGranted, 1);
    assert.deepEqual(
      grants.map((g) => g.workspace),
      ["user:ana", "org:org-1"],
    );
  });

  it("never pays a member, nor tells them the organization's balance", async () => {
    const { service, grants, stepsOf, balanceReads } = build({
      lists: [listOf("org-list-1", member)],
    });

    assert.equal((await service.getFirstList(member)).reward, 0);
    const result = await service.completeFirstList(member, "org-list-1");

    assert.equal(result.rewardGranted, 0);
    assert.equal(grants.length, 0);
    assert.equal(balanceReads(), 0);
    assert.deepEqual(stepsOf("carl"), ["first_list:org-1"]);
  });

  it("refuses a list somebody else created or works", async () => {
    const { service, grants, stepsOf } = build({
      lists: [
        { ...listOf("from-admin", ana), createdBy: "admin" },
        { ...listOf("for-bruno", ana), assignedTo: "bruno" },
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
    assert.deepEqual(stepsOf("ana"), []);
  });

  it("refuses an empty list", async () => {
    const { service, grants } = build({ lists: [listOf("list-1", ana, 0)] });

    await assert.rejects(
      service.completeFirstList(ana, "list-1"),
      BadRequestException,
    );
    assert.equal(grants.length, 0);
  });

  it("answers 404 for a list the user cannot see", async () => {
    const { service, grants } = build();

    await assert.rejects(
      service.completeFirstList(ana, "somebody-elses"),
      NotFoundException,
    );
    assert.equal(grants.length, 0);
  });
});
