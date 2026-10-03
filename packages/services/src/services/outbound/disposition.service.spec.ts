/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CallOutcome, DispositionCategory } from "@ringee/database";
import { buildOwnershipFilter, type OwnershipContext } from "@ringee/platform";
import {
  DispositionService,
  canonicalOutcomeOf,
  dispositionBelongsToCampaign,
  dispositionCodeFrom,
} from "./disposition.service";

type Row = Record<string, any>;

const ORG_ADMIN: OwnershipContext = {
  userId: "user-a",
  organizationId: "org-1",
};
const OTHER_ORG: OwnershipContext = {
  userId: "user-z",
  organizationId: "org-2",
};
/** The same person as ORG_ADMIN, in their personal workspace. */
const PERSONAL: OwnershipContext = { userId: "user-a", organizationId: null };

/**
 * An in-memory stand-in for `DispositionRepository` that applies the same
 * scoping rule the Prisma queries do: a workspace row has no campaign, and
 * `buildOwnershipFilter` decides whose it is.
 */
function fakeRepository() {
  const rows: Row[] = [];
  const links: {
    campaignId: string;
    dispositionId: string;
    sortOrder: number;
  }[] = [];
  const campaigns = new Map<string, Row>();
  const used = new Set<string>();
  let seq = 0;

  const inWorkspace = (row: Row, ctx: OwnershipContext) => {
    if (row.campaignId) return false;
    const filter = buildOwnershipFilter(ctx);
    return Object.entries(filter).every(([key, value]) => row[key] === value);
  };
  const byPosition = (a: Row, b: Row) => a.sortOrder - b.sortOrder;
  const anotherActive = (ctx: OwnershipContext, id: string) =>
    rows.some((r) => r.id !== id && r.isActive && inWorkspace(r, ctx));
  const key = (label: string) => label.trim().toLowerCase();

  const repo = {
    seedCalls: 0,
    listForWorkspace: async (
      ctx: OwnershipContext,
      opts: { activeOnly?: boolean } = {},
    ) =>
      rows
        .filter((r) => inWorkspace(r, ctx) && (!opts.activeOnly || r.isActive))
        .sort(byPosition),
    findForWorkspace: async (ctx: OwnershipContext, id: string) =>
      rows.find((r) => r.id === id && inWorkspace(r, ctx)) ?? null,
    findManyForWorkspace: async (ctx: OwnershipContext, ids: string[]) =>
      rows.filter((r) => ids.includes(r.id) && inWorkspace(r, ctx)),
    seedWorkspaceIfEmpty: async (ctx: OwnershipContext, seeds: Row[]) => {
      if (rows.some((r) => inWorkspace(r, ctx))) return false;
      repo.seedCalls += 1;
      for (const seed of seeds) {
        rows.push({
          id: `seed-${++seq}`,
          campaignId: null,
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          description: null,
          ...seed,
        });
      }
      return true;
    },
    createForWorkspace: async (
      ctx: OwnershipContext,
      data: Row,
      codeBase: string,
    ) => {
      const siblings = rows.filter((r) => inWorkspace(r, ctx));
      if (siblings.some((r) => key(r.label) === key(data.label))) {
        return { conflict: "name" as const };
      }
      const codes = new Set(siblings.map((r) => r.code));
      let code = codeBase;
      for (let n = 2; codes.has(code); n += 1) code = `${codeBase}_${n}`;
      const row = {
        id: `disp-${++seq}`,
        campaignId: null,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        isSystem: false,
        ...data,
        code,
        sortOrder: siblings.length,
      };
      rows.push(row);
      return row;
    },
    updateForWorkspace: async (
      ctx: OwnershipContext,
      id: string,
      data: Row,
    ) => {
      const row = rows.find((r) => r.id === id && inWorkspace(r, ctx));
      if (!row) return null;
      if (
        data.label !== undefined &&
        rows.some(
          (r) =>
            r.id !== id &&
            inWorkspace(r, ctx) &&
            key(r.label) === key(data.label),
        )
      ) {
        return { conflict: "name" as const };
      }
      if (data.isActive === false && !anotherActive(ctx, id)) {
        return { conflict: "last_active" as const };
      }
      Object.assign(row, data);
      return row;
    },
    reorderWorkspace: async (ctx: OwnershipContext, ids: string[]) => {
      ids.forEach((id, index) => {
        const row = rows.find((r) => r.id === id && inWorkspace(r, ctx));
        if (row) row.sortOrder = index;
      });
    },
    deleteForWorkspace: async (ctx: OwnershipContext, id: string) => {
      const index = rows.findIndex((r) => r.id === id && inWorkspace(r, ctx));
      if (index < 0) return false;
      if (rows[index].isActive && !anotherActive(ctx, id)) {
        return { conflict: "last_active" as const };
      }
      rows.splice(index, 1);
      return true;
    },
    isInUse: async (id: string) => used.has(id),
    usage: async (ids: string[]) => ({
      inUse: new Set(ids.filter((id) => used.has(id))),
      campaignCounts: new Map(
        ids.map((id) => [
          id,
          links.filter((link) => link.dispositionId === id).length,
        ]),
      ),
    }),
    findCampaignSources: async (campaignId: string) => {
      const campaign = campaigns.get(campaignId);
      if (!campaign) return null;
      return {
        owner: {
          userId: campaign.userId,
          organizationId: campaign.organizationId,
        },
        picked: links
          .filter((link) => link.campaignId === campaignId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((link) => rows.find((r) => r.id === link.dispositionId)!),
        legacy: rows
          .filter((r) => r.campaignId === campaignId && r.isActive)
          .sort(byPosition),
      };
    },
    findActiveForCampaign: async (
      campaignId: string,
      owner: OwnershipContext,
      pick: { id?: string; code?: string },
    ) =>
      rows.find(
        (r) =>
          r.isActive &&
          (pick.id ? r.id === pick.id : r.code === pick.code) &&
          (r.campaignId === campaignId || inWorkspace(r, owner)),
      ) ?? null,
    replaceCampaignSet: async (campaignId: string, ids: string[]) => {
      for (let i = links.length - 1; i >= 0; i -= 1) {
        if (links[i].campaignId === campaignId) links.splice(i, 1);
      }
      ids.forEach((dispositionId, sortOrder) =>
        links.push({ campaignId, dispositionId, sortOrder }),
      );
      for (const row of rows) {
        if (row.campaignId === campaignId) row.isActive = false;
      }
    },
    createForCampaign: async (data: Row) => {
      const row = { id: `legacy-${++seq}`, isActive: true, ...data };
      rows.push(row);
      return row;
    },
    updateForCampaign: async (campaignId: string, id: string, data: Row) => {
      const row = rows.find((r) => r.id === id && r.campaignId === campaignId);
      if (!row) return null;
      Object.assign(row, data);
      return row;
    },
  };

  return { repo, rows, links, campaigns, used };
}

/** `CampaignService.getCampaignById`, reduced to the organization check it makes. */
function fakeCampaigns(campaigns: Map<string, Row>) {
  return {
    getCampaignById: async (
      ctx: OwnershipContext,
      id: string,
      options?: { requireMembershipForUserId?: string },
    ) => {
      const campaign = campaigns.get(id);
      if (!campaign) throw new NotFoundException("Campaign not found");
      if (campaign.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Access denied");
      }
      if (
        options?.requireMembershipForUserId &&
        !campaign.members?.includes(options.requireMembershipForUserId)
      ) {
        throw new ForbiddenException("You don't have access to this campaign");
      }
      return campaign;
    },
  };
}

function setup() {
  const fake = fakeRepository();
  const service = new DispositionService(
    fake.repo as never,
    fakeCampaigns(fake.campaigns) as never,
  );
  fake.campaigns.set("campaign-1", {
    id: "campaign-1",
    userId: "user-a",
    organizationId: "org-1",
    members: ["user-b"],
  });
  return { service, ...fake };
}

describe("DispositionService — the workspace's defaults", () => {
  it("creates the defaults on first read, once, with the outcome as their code", async () => {
    const { service, repo } = setup();
    const first = await service.list(ORG_ADMIN);
    await service.list(ORG_ADMIN);

    assert.equal(repo.seedCalls, 1);
    assert.equal(first.length, 10);
    for (const d of first) {
      assert.equal(d.code, d.canonicalOutcome);
      assert.equal(d.isDefault, true);
      assert.equal(d.isActive, true);
    }
    assert.deepEqual(first.map((d) => d.label).slice(0, 3), [
      "Meeting Booked",
      "Sale",
      "Interested",
    ]);
  });

  it("drives the campaign dialer exactly as the seeded campaign dispositions did", async () => {
    const { service } = setup();
    const byOutcome = new Map(
      (await service.list(ORG_ADMIN)).map((d) => [d.canonicalOutcome, d]),
    );
    const meeting = byOutcome.get(CallOutcome.meeting_booked)!;
    assert.equal(meeting.triggersCompletion, true);
    assert.equal(meeting.category, DispositionCategory.positive);
    assert.equal(byOutcome.get(CallOutcome.wrong_number)!.triggersDnc, true);
    assert.equal(byOutcome.get(CallOutcome.no_answer)!.triggersRetry, true);
    assert.equal(byOutcome.get(CallOutcome.interested)!.triggersCallback, true);
    const notInterested = byOutcome.get(CallOutcome.not_interested)!;
    assert.equal(notInterested.triggersRetry, false);
    assert.equal(notInterested.triggersCompletion, false);
  });

  it("offers only the defaults, or every active one when none is a default", async () => {
    const { service } = setup();
    const all = await service.list(ORG_ADMIN);
    for (const d of all.slice(1)) {
      await service.update(ORG_ADMIN, d.id, { isDefault: false });
    }
    assert.deepEqual(
      (await service.listDefaults(ORG_ADMIN)).map((d) => d.id),
      [all[0].id],
    );

    await service.update(ORG_ADMIN, all[0].id, { isDefault: false });
    assert.equal((await service.listDefaults(ORG_ADMIN)).length, 10);
  });
});

describe("DispositionService — create and update", () => {
  it("creates a disposition whose meaning comes from what it maps to", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "  Demo   booked ",
      canonicalOutcome: "meeting_booked",
      color: "#22C55E",
      description: "A demo is on the calendar",
    });

    assert.equal(demo.label, "Demo booked");
    assert.equal(demo.code, "demo_booked");
    assert.equal(demo.canonicalOutcome, CallOutcome.meeting_booked);
    assert.equal(demo.triggersCompletion, true);
    assert.equal(demo.category, DispositionCategory.positive);
    assert.equal(demo.isDefault, true);
    assert.equal(demo.isActive, true);
  });

  it("creates the defaults before the first custom disposition", async () => {
    const { service } = setup();
    await service.create(ORG_ADMIN, {
      name: "Wrong person",
      canonicalOutcome: "not_interested",
    });
    assert.equal((await service.list(ORG_ADMIN)).length, 11);
  });

  it("refuses an empty name, an unknown outcome and a duplicate name", async () => {
    const { service } = setup();
    await assert.rejects(
      service.create(ORG_ADMIN, { name: "   ", canonicalOutcome: "sale" }),
      BadRequestException,
    );
    await assert.rejects(
      service.create(ORG_ADMIN, { name: "Hot", canonicalOutcome: "converted" }),
      BadRequestException,
    );
    await assert.rejects(
      service.create(ORG_ADMIN, {
        name: "interested",
        canonicalOutcome: "interested",
      }),
      ConflictException,
    );
  });

  it("takes a free code when the name's code is already taken", async () => {
    const { service } = setup();
    const defaults = await service.list(ORG_ADMIN);
    const interested = defaults.find((d) => d.code === "interested")!;
    await service.update(ORG_ADMIN, interested.id, { name: "Warm lead" });

    const again = await service.create(ORG_ADMIN, {
      name: "Interested",
      canonicalOutcome: "interested",
    });
    assert.equal(again.code, "interested_2");
  });

  it("renames, recolors and remaps a disposition nothing has recorded", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    const updated = await service.update(ORG_ADMIN, demo.id, {
      name: "Closed won",
      canonicalOutcome: "sale",
      color: null,
    });
    assert.equal(updated.label, "Closed won");
    assert.equal(updated.code, "demo_booked", "the code survives a rename");
    assert.equal(updated.canonicalOutcome, CallOutcome.sale);
    assert.equal(updated.color, null);
  });

  it("refuses to change what a recorded disposition means", async () => {
    const { service, used } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    used.add(demo.id);

    await assert.rejects(
      service.update(ORG_ADMIN, demo.id, { canonicalOutcome: "sale" }),
      ConflictException,
    );
    // Renaming it is still fine — calls keep the name they were recorded with.
    const renamed = await service.update(ORG_ADMIN, demo.id, {
      name: "Demo scheduled",
      canonicalOutcome: "meeting_booked",
    });
    assert.equal(renamed.label, "Demo scheduled");
  });

  it("keeps at least one active disposition in the workspace", async () => {
    const { service } = setup();
    const all = await service.list(ORG_ADMIN);
    for (const d of all.slice(1)) {
      await service.update(ORG_ADMIN, d.id, { isActive: false });
    }
    await assert.rejects(
      service.update(ORG_ADMIN, all[0].id, { isActive: false }),
      ConflictException,
    );
    await assert.rejects(
      service.remove(ORG_ADMIN, all[0].id),
      ConflictException,
    );
  });

  it("reorders only with the complete list of the workspace's dispositions", async () => {
    const { service } = setup();
    const ids = (await service.list(ORG_ADMIN)).map((d) => d.id);
    const reversed = [...ids].reverse();

    const result = await service.reorder(ORG_ADMIN, reversed);
    assert.deepEqual(
      result.map((d) => d.id),
      reversed,
    );
    await assert.rejects(
      service.reorder(ORG_ADMIN, reversed.slice(1)),
      BadRequestException,
    );
    await assert.rejects(
      service.reorder(ORG_ADMIN, [...reversed.slice(1), reversed[1]]),
      BadRequestException,
    );
  });
});

describe("DispositionService — delete", () => {
  it("deletes a disposition nothing recorded", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    assert.deepEqual(await service.remove(ORG_ADMIN, demo.id), {
      deleted: true,
    });
    assert.equal(
      (await service.list(ORG_ADMIN)).some((d) => d.id === demo.id),
      false,
    );
  });

  it("refuses to delete one a call recorded, and reports it as in use", async () => {
    const { service, used } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    used.add(demo.id);

    await assert.rejects(service.remove(ORG_ADMIN, demo.id), ConflictException);
    const listed = (await service.list(ORG_ADMIN)).find(
      (d) => d.id === demo.id,
    );
    assert.equal(listed?.inUse, true);
  });
});

describe("DispositionService — workspace isolation", () => {
  it("keeps an organization's dispositions out of its members' personal workspace", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });

    const personal = await service.list(PERSONAL);
    assert.equal(
      personal.some((d) => d.id === demo.id),
      false,
    );
    // The personal workspace gets its own defaults, not the organization's rows.
    assert.ok(personal.every((d) => d.organizationId === null));

    await assert.rejects(
      service.resolveSelectable(PERSONAL, demo.id),
      NotFoundException,
    );
    await assert.rejects(
      service.update(PERSONAL, demo.id, { name: "Mine now" }),
      NotFoundException,
    );
    await assert.rejects(service.remove(PERSONAL, demo.id), NotFoundException);
  });

  it("keeps personal dispositions out of the user's organization", async () => {
    const { service } = setup();
    const mine = await service.create(PERSONAL, {
      name: "Call me next week",
      canonicalOutcome: "callback_scheduled",
    });
    await assert.rejects(
      service.resolveSelectable(ORG_ADMIN, mine.id),
      NotFoundException,
    );
  });

  it("never touches another organization's dispositions", async () => {
    const { service } = setup();
    const theirs = await service.create(OTHER_ORG, {
      name: "Their disposition",
      canonicalOutcome: "sale",
    });
    await assert.rejects(
      service.update(ORG_ADMIN, theirs.id, { isActive: false }),
      NotFoundException,
    );
    await assert.rejects(
      service.reorder(ORG_ADMIN, [theirs.id]),
      BadRequestException,
    );
  });
});

describe("DispositionService — recording one", () => {
  it("resolves the canonical outcome a disposition means", async () => {
    const { service } = setup();
    const closed = await service.create(ORG_ADMIN, {
      name: "Closed won",
      canonicalOutcome: "sale",
    });
    const { outcome, disposition } = await service.resolveSelectable(
      ORG_ADMIN,
      closed.id,
    );
    assert.equal(outcome, CallOutcome.sale);
    assert.equal(disposition.label, "Closed won");
  });

  it("refuses an inactive disposition", async () => {
    const { service } = setup();
    const old = await service.create(ORG_ADMIN, {
      name: "Old status",
      canonicalOutcome: "follow_up",
    });
    await service.update(ORG_ADMIN, old.id, { isActive: false });
    await assert.rejects(
      service.resolveSelectable(ORG_ADMIN, old.id),
      BadRequestException,
    );
  });

  it("reads a pre-workspace campaign disposition's outcome from its code", () => {
    assert.equal(
      canonicalOutcomeOf({ canonicalOutcome: null, code: "meeting_booked" }),
      CallOutcome.meeting_booked,
    );
    assert.equal(
      canonicalOutcomeOf({ canonicalOutcome: null, code: "busy" }),
      null,
    );
    assert.equal(
      canonicalOutcomeOf({ canonicalOutcome: CallOutcome.sale, code: "demo" }),
      CallOutcome.sale,
    );
  });

  it("turns a name into a stable code", () => {
    assert.equal(dispositionCodeFrom("Demo booked!"), "demo_booked");
    assert.equal(
      dispositionCodeFrom("Sí, interesado — llamar"),
      "si_interesado_llamar",
    );
    assert.equal(dispositionCodeFrom("¡¡¡"), "disposition");
  });
});

describe("DispositionService — a campaign's dispositions", () => {
  it("uses the workspace's default set when the campaign picked none", async () => {
    const { service } = setup();
    const defaults = await service.listDefaults(ORG_ADMIN);
    const set = await service.getCampaignSet(ORG_ADMIN, "campaign-1");

    assert.equal(set.mode, "workspace");
    assert.deepEqual(
      set.dispositions.map((d) => d.id),
      defaults.map((d) => d.id),
    );
  });

  it("shows the picked dispositions in the campaign's order", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    const wrong = await service.create(ORG_ADMIN, {
      name: "Wrong person",
      canonicalOutcome: "not_interested",
      isDefault: false,
    });

    const set = await service.setCampaignSet(ORG_ADMIN, "campaign-1", [
      wrong.id,
      demo.id,
    ]);
    assert.equal(set.mode, "campaign");
    assert.deepEqual(
      set.dispositions.map((d) => d.label),
      ["Wrong person", "Demo booked"],
    );
    assert.deepEqual(
      (await service.listByCampaign("campaign-1")).map((d) => d.id),
      [wrong.id, demo.id],
    );
  });

  it("falls back to the defaults when every picked disposition was deactivated", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    await service.setCampaignSet(ORG_ADMIN, "campaign-1", [demo.id]);
    await service.update(ORG_ADMIN, demo.id, { isActive: false });

    const set = await service.getCampaignSet(ORG_ADMIN, "campaign-1");
    assert.equal(set.mode, "workspace");
    assert.ok(set.dispositions.length > 0);
  });

  it("refuses another workspace's, an inactive or a repeated disposition", async () => {
    const { service } = setup();
    const theirs = await service.create(OTHER_ORG, {
      name: "Theirs",
      canonicalOutcome: "sale",
    });
    await assert.rejects(
      service.setCampaignSet(ORG_ADMIN, "campaign-1", [theirs.id]),
      NotFoundException,
    );

    const old = await service.create(ORG_ADMIN, {
      name: "Old",
      canonicalOutcome: "sale",
    });
    await service.update(ORG_ADMIN, old.id, { isActive: false });
    await assert.rejects(
      service.setCampaignSet(ORG_ADMIN, "campaign-1", [old.id]),
      BadRequestException,
    );

    const [first] = await service.listDefaults(ORG_ADMIN);
    await assert.rejects(
      service.setCampaignSet(ORG_ADMIN, "campaign-1", [first.id, first.id]),
      BadRequestException,
    );
  });

  it("refuses another organization's campaign", async () => {
    const { service } = setup();
    await assert.rejects(
      service.getCampaignSet(OTHER_ORG, "campaign-1"),
      ForbiddenException,
    );
    await assert.rejects(
      service.setCampaignSet(OTHER_ORG, "campaign-1", []),
      ForbiddenException,
    );
  });

  it("keeps an existing campaign on its own dispositions until one is picked for it", async () => {
    const { service, rows } = setup();
    rows.push(
      {
        id: "legacy-busy",
        campaignId: "campaign-1",
        code: "busy",
        label: "Busy",
        canonicalOutcome: null,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: "legacy-sale",
        campaignId: "campaign-1",
        code: "sale",
        label: "Sale",
        canonicalOutcome: null,
        isActive: true,
        sortOrder: 0,
      },
    );

    const before = await service.getCampaignSet(ORG_ADMIN, "campaign-1");
    assert.equal(before.mode, "legacy");
    assert.deepEqual(
      before.dispositions.map((d) => [d.code, d.canonicalOutcome]),
      [
        ["sale", CallOutcome.sale],
        ["busy", null],
      ],
    );

    // Switching it to the workspace's defaults retires its own.
    const after = await service.setCampaignSet(ORG_ADMIN, "campaign-1", []);
    assert.equal(after.mode, "workspace");
    assert.equal(rows.find((r) => r.id === "legacy-busy")!.isActive, false);
  });

  it("lets a member read only the campaigns they are assigned to", async () => {
    const { service } = setup();
    const member: OwnershipContext = {
      userId: "user-c",
      organizationId: "org-1",
    };
    await assert.rejects(
      service.getCampaignSet(member, "campaign-1", {
        requireMembershipForUserId: "user-c",
      }),
      ForbiddenException,
    );
    const assigned: OwnershipContext = {
      userId: "user-b",
      organizationId: "org-1",
    };
    const set = await service.getCampaignSet(assigned, "campaign-1", {
      requireMembershipForUserId: "user-b",
    });
    assert.ok(set.dispositions.length > 0);
  });

  it("resolves an agent's pick within the campaign, by id or by code", async () => {
    const { service } = setup();
    const demo = await service.create(ORG_ADMIN, {
      name: "Demo booked",
      canonicalOutcome: "meeting_booked",
    });
    await service.setCampaignSet(ORG_ADMIN, "campaign-1", [demo.id]);

    assert.equal(
      (await service.resolveForCampaign("campaign-1", { code: "demo_booked" }))
        ?.id,
      demo.id,
    );
    // Picked from a set an admin changed mid-call: still the workspace's, still active.
    const [meeting] = await service.listDefaults(ORG_ADMIN);
    assert.equal(
      (await service.resolveForCampaign("campaign-1", { id: meeting.id }))?.id,
      meeting.id,
    );

    const theirs = await service.create(OTHER_ORG, {
      name: "Theirs",
      canonicalOutcome: "sale",
    });
    assert.equal(
      await service.resolveForCampaign("campaign-1", { id: theirs.id }),
      null,
    );
  });

  it("tells whether a campaign may record a disposition", () => {
    const workspace = { userId: "user-a", organizationId: "org-1" };
    assert.equal(
      dispositionBelongsToCampaign(
        { campaignId: null, organizationId: "org-1", userId: "user-x" },
        "campaign-1",
        workspace,
      ),
      true,
    );
    assert.equal(
      dispositionBelongsToCampaign(
        { campaignId: null, organizationId: "org-2", userId: "user-a" },
        "campaign-1",
        workspace,
      ),
      false,
    );
    assert.equal(
      dispositionBelongsToCampaign(
        { campaignId: "campaign-2", organizationId: null, userId: null },
        "campaign-1",
        workspace,
      ),
      false,
    );
  });
});

describe("DispositionService — pre-workspace campaign endpoints", () => {
  it("edits only the fields a campaign disposition may change", async () => {
    const { service, rows } = setup();
    rows.push({
      id: "legacy-1",
      campaignId: "campaign-1",
      code: "busy",
      label: "Busy",
      isActive: true,
      sortOrder: 0,
    });
    const updated = await service.updateForCampaign(
      ORG_ADMIN,
      "campaign-1",
      "legacy-1",
      { label: "Line busy", campaignId: "campaign-2", isSystem: true } as never,
    );
    assert.equal(updated.label, "Line busy");
    assert.equal(updated.campaignId, "campaign-1");
    assert.equal((updated as Row).isSystem, undefined);
  });

  it("reads another campaign's disposition as missing", async () => {
    const { service, rows, campaigns } = setup();
    campaigns.set("campaign-2", {
      id: "campaign-2",
      userId: "user-a",
      organizationId: "org-1",
    });
    rows.push({
      id: "legacy-other",
      campaignId: "campaign-2",
      code: "busy",
      label: "Busy",
      isActive: true,
    });
    await assert.rejects(
      service.deactivateForCampaign(ORG_ADMIN, "campaign-1", "legacy-other"),
      NotFoundException,
    );
    await assert.rejects(
      service.deactivateForCampaign(OTHER_ORG, "campaign-2", "legacy-other"),
      ForbiddenException,
    );
  });
});
