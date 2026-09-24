import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { InboundDestinationType } from "@ringee/database";
import { RingGroupService } from "./ring-group.service";

const ADMIN = { userId: "user-a", organizationId: "org-1" };

type Row = Record<string, any>;

function setup() {
  const added: Array<[string, string]> = [];
  const removed: Array<[string, string]> = [];
  const routesDeleted: Row[] = [];
  const state = {
    members: new Set(["user-a", "user-b"]),
    group: {
      id: "group-1",
      name: "Sales",
      strategy: "simultaneous",
      ringSeconds: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
      organizationId: "org-1",
      userId: "user-a",
      members: [{ userId: "user-a" }, { userId: "user-b" }],
    } as Row | null,
  };
  const service = new RingGroupService(
    {
      listByOwner: async () => (state.group ? [state.group] : []),
      findOwnedById: async (_ctx: Row, id: string) =>
        state.group?.id === id ? state.group : null,
      create: async () => state.group,
      update: async () => state.group,
      softDelete: async () => {
        state.group = null;
        return true;
      },
      addMember: async (groupId: string, userId: string) => {
        added.push([groupId, userId]);
        state.group!.members.push({ userId });
      },
      removeMember: async (groupId: string, userId: string) => {
        removed.push([groupId, userId]);
        state.group!.members = state.group!.members.filter(
          (member: Row) => member.userId !== userId,
        );
        return true;
      },
    } as never,
    {
      deleteByDestination: async (_ctx: Row, type: string, id: string) => {
        routesDeleted.push({ type, id });
        return 2;
      },
    } as never,
    {
      isMember: async (userId: string, orgId: string) =>
        orgId === "org-1" && state.members.has(userId),
    } as never,
    {
      getCachedUserById: async (id: string) => ({
        id,
        firstName: id === "user-a" ? "Edison" : "Pedro",
      }),
    } as never,
  );
  return { service, state, added, removed, routesDeleted };
}

describe("RingGroupService", () => {
  it("lists a group with its members and whether each is still in the workspace", async () => {
    const s = setup();
    s.state.members.delete("user-b");
    const [group] = await s.service.list(ADMIN);
    assert.deepEqual(
      group.members.map((member) => [member.userId, member.inWorkspace]),
      [
        ["user-a", true],
        ["user-b", false],
      ],
    );
  });

  it("only adds members of the same workspace", async () => {
    const s = setup();
    await assert.rejects(
      s.service.addMember(ADMIN, "group-1", "user-z"),
      ForbiddenException,
    );
    assert.deepEqual(s.added, []);
    await s.service.addMember(ADMIN, "group-1", "user-b");
    assert.deepEqual(s.added, [["group-1", "user-b"]]);
  });

  it("hides a group in another workspace behind a not-found", async () => {
    const s = setup();
    s.state.group = null;
    for (const call of [
      () => s.service.get(ADMIN, "group-1"),
      () => s.service.rename(ADMIN, "group-1", { name: "Support" }),
      () => s.service.addMember(ADMIN, "group-1", "user-b"),
      () => s.service.removeMember(ADMIN, "group-1", "user-b"),
      () => s.service.remove(ADMIN, "group-1"),
    ])
      await assert.rejects(call(), NotFoundException);
  });

  it("resets the routes that pointed at a group it deletes", async () => {
    const s = setup();
    const result = await s.service.remove(ADMIN, "group-1");
    assert.deepEqual(result, { deleted: true, routesReset: 2 });
    // Otherwise every call to those numbers would be refused for a group
    // that no longer exists.
    assert.deepEqual(s.routesDeleted, [
      { type: InboundDestinationType.ring_group, id: "group-1" },
    ]);
  });
});
