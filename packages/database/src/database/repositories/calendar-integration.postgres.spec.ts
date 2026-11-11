/// <reference types="node" />
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { CalendarProvider, PrismaClient } from "@prisma/client";
import type { OwnershipContext } from "@ringee/platform";
import { CalendarIntegrationRepository } from "./calendar-integration.repository";

// Explicit opt-in: never inherit a developer's application DATABASE_URL.
const url = process.env.RINGEE_AUTOMATION_TEST_DATABASE_URL;

/**
 * CAL-004 against PostgreSQL: two freelancers, one of them also a member of
 * an organization. Each workspace lists, finds and reconnects only its own
 * calendar accounts.
 */
describe("Calendar accounts are isolated per workspace", { skip: !url }, () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const repo = new CalendarIntegrationRepository(prisma as never);
  const ana = randomUUID();
  const bruno = randomUUID();
  const colleague = randomUUID();
  const organizationId = randomUUID();
  const anaPersonal: OwnershipContext = { userId: ana, organizationId: null };
  const anaInOrganization: OwnershipContext = { userId: ana, organizationId };
  const colleagueInOrganization: OwnershipContext = {
    userId: colleague,
    organizationId,
  };
  const brunoPersonal: OwnershipContext = {
    userId: bruno,
    organizationId: null,
  };
  const ids: Record<string, string> = {};

  const list = async (ctx: OwnershipContext) =>
    (await repo.listForWorkspace(ctx)).map((row) => row.id);
  const found = async (ctx: OwnershipContext, id: string) =>
    (await repo.findByIdForOwner(ctx, id))?.id ?? null;

  before(async () => {
    for (const id of [ana, bruno, colleague]) {
      await prisma.user.create({ data: { id } });
    }
    await prisma.organization.create({
      data: {
        id: organizationId,
        clerkId: `calendar-isolation-test-${organizationId}`,
        name: "Calendar isolation tests",
      },
    });
    // The same Google account, connected in both of Ana's workspaces.
    ids.anaPersonal = (
      await repo.connectAccount(anaPersonal, CalendarProvider.google, {
        accessToken: "ana-personal",
        email: "ana@example.com",
      })
    ).id;
    ids.anaOrganization = (
      await repo.connectAccount(anaInOrganization, CalendarProvider.google, {
        accessToken: "ana-organization",
        email: "ana@example.com",
      })
    ).id;
    ids.brunoPersonal = (
      await repo.connectAccount(brunoPersonal, CalendarProvider.google, {
        accessToken: "bruno-personal",
        email: "bruno@example.com",
      })
    ).id;
  });

  after(async () => {
    const users = [ana, bruno, colleague];
    await prisma.calendarIntegration.deleteMany({
      where: { userId: { in: users } },
    });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it("connects the same account separately in each workspace", () => {
    assert.notEqual(ids.anaPersonal, ids.anaOrganization);
  });

  it("lists only the workspace's own accounts", async () => {
    assert.deepEqual(await list(anaPersonal), [ids.anaPersonal]);
    assert.deepEqual(await list(anaInOrganization), [ids.anaOrganization]);
    // An organization's accounts are the organization's, whoever connected them.
    assert.deepEqual(await list(colleagueInOrganization), [
      ids.anaOrganization,
    ]);
    assert.deepEqual(await list(brunoPersonal), [ids.brunoPersonal]);
  });

  it("finds an id only in its own workspace", async () => {
    assert.equal(await found(anaPersonal, ids.anaPersonal!), ids.anaPersonal);
    assert.equal(await found(anaPersonal, ids.anaOrganization!), null);
    assert.equal(await found(anaInOrganization, ids.anaPersonal!), null);
    assert.equal(
      await found(colleagueInOrganization, ids.anaOrganization!),
      ids.anaOrganization,
    );
    assert.equal(await found(brunoPersonal, ids.anaPersonal!), null);
    assert.equal(await found(anaPersonal, ids.brunoPersonal!), null);
  });

  it("refreshes the workspace's own row on reconnect and leaves the other alone", async () => {
    const again = await repo.connectAccount(
      anaPersonal,
      CalendarProvider.google,
      { accessToken: "ana-personal-2", email: "ana@example.com" },
    );
    assert.equal(again.id, ids.anaPersonal);
    const other = await prisma.calendarIntegration.findUniqueOrThrow({
      where: { id: ids.anaOrganization! },
    });
    assert.equal(other.accessToken, "ana-organization");
  });

  it("refreshes the organization's row when another member reconnects the same account", async () => {
    const again = await repo.connectAccount(
      colleagueInOrganization,
      CalendarProvider.google,
      { accessToken: "colleague-organization", email: "ana@example.com" },
    );
    assert.equal(again.id, ids.anaOrganization);
    assert.equal(again.accessToken, "colleague-organization");
    assert.deepEqual(await list(anaInOrganization), [ids.anaOrganization]);
    const personal = await prisma.calendarIntegration.findUniqueOrThrow({
      where: { id: ids.anaPersonal! },
    });
    assert.equal(personal.accessToken, "ana-personal-2");
  });

  it("keeps two members' accounts without an email apart", async () => {
    const connect = (ctx: OwnershipContext, accessToken: string) =>
      repo.connectAccount(ctx, CalendarProvider.google, { accessToken });
    const anas = await connect(anaInOrganization, "ana-unnamed");
    const colleagues = await connect(
      colleagueInOrganization,
      "colleague-unnamed",
    );
    assert.notEqual(colleagues.id, anas.id);
    const anasAgain = await connect(anaInOrganization, "ana-unnamed-2");
    assert.equal(anasAgain.id, anas.id);
    const untouched = await prisma.calendarIntegration.findUniqueOrThrow({
      where: { id: colleagues.id },
    });
    assert.equal(untouched.accessToken, "colleague-unnamed");
  });
});
