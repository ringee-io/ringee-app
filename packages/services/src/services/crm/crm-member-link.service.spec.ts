/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CrmError } from "@ringee/platform";
import { CrmMemberLinkService } from "./crm-member-link.service";

type AnyRecord = Record<string, unknown>;

const ORG = "org-1";
const ctx = { userId: "admin-1", organizationId: ORG };

const orgConnection = {
  id: "conn-1",
  provider: "hubspot",
  scope: "organization",
  userId: "admin-1",
  organizationId: ORG,
} as never;

const crmUsers = [
  { externalId: "owner-ana", email: "Ana@Acme.com", name: "Ana Pérez" },
  { externalId: "owner-luis", email: "luis@acme.com", name: "Luis Gómez" },
  { externalId: "owner-eva", email: "eva@acme.com", name: "Eva Díaz" },
];

function user(id: string, firstName: string, emails: AnyRecord[]) {
  return {
    id,
    firstName,
    lastName: null,
    imageUrl: null,
    profileImageUrl: null,
    emails,
  };
}

const members = [
  // Matched by e-mail, whatever its case.
  user("u-ana", "Ana", [
    { email: "ana@acme.com", isPrimary: true, status: "verified" },
  ]),
  // An address nobody verified is not proof of who they are.
  user("u-luis", "Luis", [
    { email: "luis.personal@gmail.com", isPrimary: true, status: "verified" },
    { email: "luis@acme.com", isPrimary: false, status: "unverified" },
  ]),
  user("u-eva", "Eva", [
    { email: "eva@acme.com", isPrimary: true, status: "verified" },
  ]),
  user("u-max", "Max", [
    { email: "max@acme.com", isPrimary: true, status: "verified" },
  ]),
];

function harness(
  opts: {
    connection?: unknown;
    links?: AnyRecord[];
    supportsOwners?: boolean;
    listMembers?: () => Promise<unknown[]>;
    cached?: unknown;
  } = {},
) {
  const connection = opts.connection ?? orgConnection;
  let links = [...(opts.links ?? [])];
  const calls = { listMembers: 0, upserts: [] as AnyRecord[] };
  const cache = new Map<string, unknown>();
  if (opts.cached) cache.set("crm-members-conn-1", opts.cached);

  const connections = {
    findById: async (id: string) =>
      id === (connection as AnyRecord).id ? connection : null,
    assertAccess: async (c: AnyRecord, conn: AnyRecord) => {
      if (conn.organizationId !== c.organizationId) {
        throw new NotFoundException("connection not found");
      }
    },
    listMembers: async () => {
      calls.listMembers += 1;
      return opts.listMembers ? opts.listMembers() : crmUsers;
    },
  };
  const registry = {
    tryGet: () => ({
      capabilities: { supportsOwnerAssignment: opts.supportsOwners ?? true },
    }),
  };
  const linkRepo = {
    listByConnection: async () => links,
    find: async (connectionId: string, userId: string) =>
      links.find(
        (l) => l.connectionId === connectionId && l.userId === userId,
      ) ?? null,
    upsert: async (input: AnyRecord) => {
      calls.upserts.push(input);
      links = [...links.filter((l) => l.userId !== input.userId), input];
      return input;
    },
    remove: async (_connectionId: string, userId: string) => {
      links = links.filter((l) => l.userId !== userId);
    },
  };
  const organizations = {
    findMembersWithEmails: async () => members,
    isMember: async (userId: string, organizationId: string) =>
      organizationId === ORG && members.some((m) => m.id === userId),
  };
  const users = {
    findById: async (id: string) => members.find((m) => m.id === id) ?? null,
  };
  const redis = {
    get: async (key: string) => cache.get(key),
    set: async (key: string, value: unknown) => {
      cache.set(key, value);
    },
  };

  const service = new CrmMemberLinkService(
    connections as never,
    registry as never,
    linkRepo as never,
    organizations as never,
    users as never,
    redis as never,
  );
  return { service, calls, cache };
}

describe("CrmMemberLinkService.list", () => {
  it("links each member to the CRM user with their e-mail, or to nobody", async () => {
    const { service } = harness({
      links: [
        // Eva was linked to Luis's HubSpot seat by hand.
        {
          connectionId: "conn-1",
          userId: "u-eva",
          externalMemberId: "owner-luis",
          externalMemberEmail: "luis@acme.com",
          externalMemberName: "Luis Gómez",
        },
        // Max was linked to nobody by hand.
        {
          connectionId: "conn-1",
          userId: "u-max",
          externalMemberId: null,
          externalMemberEmail: null,
          externalMemberName: null,
        },
      ],
    });

    const view = await service.list(ctx, "conn-1");

    assert.equal(view.ownerAssignment, true);
    assert.equal(view.crmMembersLoaded, true);
    assert.equal(view.crmMembers.length, 3);
    const byUser = Object.fromEntries(view.members.map((m) => [m.userId, m]));
    assert.deepEqual(
      [byUser["u-ana"].source, byUser["u-ana"].crmMember?.externalId],
      ["email", "owner-ana"],
    );
    assert.deepEqual(
      [byUser["u-luis"].source, byUser["u-luis"].crmMember],
      ["email", null],
    );
    assert.deepEqual(
      [byUser["u-eva"].source, byUser["u-eva"].crmMember?.externalId],
      ["manual", "owner-luis"],
    );
    assert.deepEqual(
      [byUser["u-max"].source, byUser["u-max"].crmMember],
      ["manual", null],
    );
    assert.equal(byUser["u-ana"].email, "ana@acme.com");
  });

  it("flags a manual link to a CRM user the CRM no longer lists", async () => {
    const { service } = harness({
      links: [
        {
          connectionId: "conn-1",
          userId: "u-max",
          externalMemberId: "owner-gone",
          externalMemberEmail: "gone@acme.com",
          externalMemberName: "Gone",
        },
      ],
    });

    const view = await service.list(ctx, "conn-1");
    const max = view.members.find((m) => m.userId === "u-max");

    assert.equal(max?.stale, true);
    // What it was linked to is still shown.
    assert.equal(max?.crmMember?.email, "gone@acme.com");
  });

  it("still lists the members when the CRM cannot be read", async () => {
    const { service } = harness({
      listMembers: async () => {
        throw new CrmError("TRANSIENT", true, "down");
      },
    });

    const view = await service.list(ctx, "conn-1");

    assert.equal(view.crmMembersLoaded, false);
    assert.equal(view.members.length, members.length);
  });

  it("only lists the CRM's users for an adapter that does not assign owners", async () => {
    const { service } = harness({ supportsOwners: false });

    const view = await service.list(ctx, "conn-1");

    assert.equal(view.ownerAssignment, false);
    assert.equal(view.crmMembers.length, 3);
    assert.deepEqual(view.members, []);
  });

  it("does not show another workspace's connection", async () => {
    const { service } = harness();
    await assert.rejects(
      service.list({ userId: "x", organizationId: "org-2" }, "conn-1"),
      NotFoundException,
    );
  });
});

describe("CrmMemberLinkService.link / unlink", () => {
  it("links a member to a CRM user the CRM has, keeping a snapshot of it", async () => {
    const { service, calls } = harness();

    const entry = await service.link(ctx, "conn-1", "u-luis", "owner-luis");

    assert.equal(entry.source, "manual");
    assert.equal(entry.crmMember?.externalId, "owner-luis");
    assert.deepEqual(calls.upserts, [
      {
        connectionId: "conn-1",
        userId: "u-luis",
        provider: "hubspot",
        externalMemberId: "owner-luis",
        externalMemberEmail: "luis@acme.com",
        externalMemberName: "Luis Gómez",
      },
    ]);
  });

  it("links a member to nobody without asking the CRM", async () => {
    const { service, calls } = harness();

    const entry = await service.link(ctx, "conn-1", "u-ana", null);

    assert.deepEqual([entry.source, entry.crmMember], ["manual", null]);
    assert.equal(calls.listMembers, 0);
    assert.equal(calls.upserts[0].externalMemberId, null);
  });

  it("refuses a CRM user the CRM does not have", async () => {
    const { service, calls } = harness();
    await assert.rejects(
      service.link(ctx, "conn-1", "u-ana", "owner-unknown"),
      BadRequestException,
    );
    assert.equal(calls.upserts.length, 0);
  });

  it("refuses someone who is not a member of the connection's workspace", async () => {
    const { service, calls } = harness();
    await assert.rejects(
      service.link(ctx, "conn-1", "u-outsider", "owner-ana"),
      NotFoundException,
    );
    assert.equal(calls.upserts.length, 0);
  });

  it("only links the owner of a personal connection", async () => {
    const { service } = harness({
      connection: {
        id: "conn-1",
        provider: "hubspot",
        scope: "personal",
        userId: "u-ana",
        organizationId: null,
      },
    });
    const personal = { userId: "u-ana", organizationId: null };

    const entry = await service.link(personal, "conn-1", "u-ana", "owner-ana");
    assert.equal(entry.crmMember?.externalId, "owner-ana");
    await assert.rejects(
      service.link(personal, "conn-1", "u-eva", "owner-eva"),
      NotFoundException,
    );
  });

  it("says so when the CRM cannot be read to check the user", async () => {
    const { service } = harness({
      listMembers: async () => {
        throw new CrmError("TRANSIENT", true, "down");
      },
    });
    await assert.rejects(
      service.link(ctx, "conn-1", "u-ana", "owner-ana"),
      ServiceUnavailableException,
    );
  });

  it("puts a member back on the e-mail match", async () => {
    const { service } = harness({
      links: [
        {
          connectionId: "conn-1",
          userId: "u-ana",
          externalMemberId: null,
          externalMemberEmail: null,
          externalMemberName: null,
        },
      ],
    });

    const entry = await service.unlink(ctx, "conn-1", "u-ana");

    assert.deepEqual(
      [entry.source, entry.crmMember?.externalId],
      ["email", "owner-ana"],
    );
    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-ana"),
      "owner-ana",
    );
  });

  it("refuses links for an adapter that does not assign owners", async () => {
    const { service } = harness({ supportsOwners: false });
    await assert.rejects(
      service.link(ctx, "conn-1", "u-ana", "owner-ana"),
      BadRequestException,
    );
  });
});

describe("CrmMemberLinkService.resolveCrmMemberId", () => {
  it("prefers the admin's choice, nobody included", async () => {
    const { service } = harness({
      links: [
        {
          connectionId: "conn-1",
          userId: "u-ana",
          externalMemberId: "owner-eva",
        },
        { connectionId: "conn-1", userId: "u-eva", externalMemberId: null },
      ],
    });

    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-ana"),
      "owner-eva",
    );
    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-eva"),
      null,
    );
  });

  it("matches by e-mail from the cached CRM users, without asking the CRM", async () => {
    const { service, calls } = harness({ cached: crmUsers });

    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-ana"),
      "owner-ana",
    );
    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-luis"),
      null,
    );
    assert.equal(calls.listMembers, 0);
  });

  it("reads the CRM users once and caches them", async () => {
    const { service, calls, cache } = harness();

    await service.resolveCrmMemberId(orgConnection, "u-ana");
    await service.resolveCrmMemberId(orgConnection, "u-eva");

    assert.equal(calls.listMembers, 1);
    assert.ok(cache.has("crm-members-conn-1"));
  });

  it("gives no owner rather than failing when the CRM cannot be read", async () => {
    const { service } = harness({
      listMembers: async () => {
        throw new CrmError("RATE_LIMITED", true, "slow down");
      },
    });
    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-ana"),
      null,
    );
  });

  it("gives no owner on an adapter that does not assign owners", async () => {
    const { service, calls } = harness({ supportsOwners: false });
    assert.equal(
      await service.resolveCrmMemberId(orgConnection, "u-ana"),
      null,
    );
    assert.equal(calls.listMembers, 0);
  });
});
