import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  FollowUpActivationRepository,
  MeetingReminderPolicyRepository,
  PrismaClient,
  ProductAnalyticsRepository,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { FOLLOW_UP_ONBOARDING_VERSION } from "./follow-up-activation";

/**
 * Stage 4B/4C persistence on real PostgreSQL, built from the real migration
 * SQL by `test/prepare-follow-up-database.mjs`: the activation row's
 * compare-and-set, its disjoint workspace keys, durable opt-outs, the outbox's
 * idempotent recording and claims, and the reminder policy's explicit
 * inclusion. Opt-in like the other follow-up suites.
 */
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
describe(
  "Stage 4B/4C persistence — disposable PostgreSQL",
  { skip: !url, timeout: 5 * 60_000 },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const activations = new FollowUpActivationRepository(db);
    const outbox = new ProductAnalyticsRepository(db);
    const policies = new MeetingReminderPolicyRepository(db);
    const owner = randomUUID();
    const organizationId = randomUUID();
    const personal: OwnershipContext = { userId: owner, organizationId: null };
    const org: OwnershipContext = { userId: owner, organizationId };
    const version = FOLLOW_UP_ONBOARDING_VERSION;

    before(async () => {
      await prisma.user.create({ data: { id: owner, canCall: true } });
      await prisma.organization.create({
        data: { id: organizationId, clerkId: organizationId, name: "Team" },
      });
    });

    after(async () => {
      await prisma.productAnalyticsEvent.deleteMany({});
      await prisma.followUpActivation.deleteMany({ where: { userId: owner } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: owner } });
      await prisma.$disconnect();
    });

    it("keeps one row per workspace, personal and organization apart", async () => {
      const mine = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "America/New_York" },
        expectedRevision: null,
      });
      const team = await activations.saveConfiguration(org, {
        version,
        configuration: { timeZone: "Europe/Madrid" },
        expectedRevision: null,
      });
      assert.ok(mine.ok && team.ok);
      assert.equal(mine.row.workspaceKey, `personal:${owner}`);
      assert.equal(team.row.workspaceKey, `organization:${organizationId}`);
      // A second "new" row for the same workspace is a stale write.
      const again = await activations.saveConfiguration(personal, {
        version,
        configuration: {},
        expectedRevision: null,
      });
      assert.equal(again.ok, false);
    });

    it("refuses a save from a stale revision and bumps on success", async () => {
      const current = await activations.findForWorkspace(personal, version);
      const stale = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "UTC" },
        expectedRevision: (current!.revision ?? 1) + 5,
      });
      assert.equal(stale.ok, false);
      const saved = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "UTC" },
        expectedRevision: current!.revision,
      });
      assert.ok(saved.ok);
      assert.equal(saved.row.revision, current!.revision + 1);
    });

    it("adopts once per revision and keeps the adopter", async () => {
      const current = await activations.findForWorkspace(personal, version);
      const adoptedAt = new Date();
      const adopted = await activations.markAdopted(personal, {
        version,
        expectedRevision: current!.revision,
        configuration: { timeZone: "UTC" },
        scope: { requestKey: "k-1", scheduling: true, reminders: true },
        optOuts: {},
        adoptedAt,
      });
      assert.ok(adopted.ok);
      assert.equal(adopted.row.status, "adopted");
      assert.equal(adopted.row.adoptedByUserId, owner);
      const replay = await activations.markAdopted(personal, {
        version,
        expectedRevision: current!.revision,
        configuration: {},
        scope: { requestKey: "k-2" },
        optOuts: {},
        adoptedAt: new Date(),
      });
      assert.equal(replay.ok, false);
    });

    it("records a removed trigger as a durable opt-out, even with no row yet", async () => {
      const otherOwner = randomUUID();
      await prisma.user.create({ data: { id: otherOwner, canCall: true } });
      const ctx = { userId: otherOwner, organizationId: null };
      const row = await activations.recordOptOut(ctx, {
        version,
        capability: "reminders",
        reason: "trigger_removed",
        at: new Date(),
        emptyConfiguration: {},
      });
      assert.equal(
        (row.optOuts as Record<string, { reason: string }>).reminders.reason,
        "trigger_removed",
      );
      assert.equal(row.status, "configured");
      await prisma.followUpActivation.deleteMany({
        where: { userId: otherOwner },
      });
      await prisma.user.delete({ where: { id: otherOwner } });
    });

    it("records a fact once by its key and claims it under a lease", async () => {
      const row = {
        eventKey: `signup_completed:${owner}`,
        event: "signup_completed",
        distinctId: owner,
        occurredAt: new Date(Date.now() - 60_000),
        properties: { schema_version: 1 },
        workspaceKey: `personal:${owner}`,
      };
      assert.equal(await outbox.recordMany([row]), 1);
      assert.equal(await outbox.recordMany([row]), 0);
      const now = new Date();
      const token = randomUUID();
      const claimed = await outbox.claimDue({
        token,
        now,
        leaseUntil: new Date(now.getTime() + 60_000),
        take: 10,
      });
      assert.equal(claimed.length, 1);
      // A second worker finds nothing while the lease holds.
      const second = await outbox.claimDue({
        token: randomUUID(),
        now,
        leaseUntil: new Date(now.getTime() + 60_000),
        take: 10,
      });
      assert.equal(second.length, 0);
      assert.equal(
        await outbox.markSent([claimed[0]!.id], token, new Date()),
        1,
      );
    });

    it("keeps an existing policy's coverage and adds explicit inclusions", async () => {
      const calendarId = randomUUID();
      const agentId = randomUUID();
      await prisma.calendar.create({
        data: {
          id: calendarId,
          userId: owner,
          organizationId: null,
          name: "Mine",
          timezone: "UTC",
        } as never,
      });
      await prisma.aiVoiceAgent.create({
        data: {
          id: agentId,
          userId: owner,
          organizationId: null,
          name: "Sofia",
          type: "reminders_notifications",
        } as never,
      });
      const adoptedAt = new Date();
      const created = await policies.upsertForCalendar(personal, {
        agentId,
        calendarId,
        offsetsMinutes: [240],
        coverage: { coversMeetingsFrom: adoptedAt },
      });
      assert.equal(created.coversMeetingsFrom?.getTime(), adoptedAt.getTime());
      // Editing the offset is not a new scope decision.
      const edited = await policies.upsertForCalendar(personal, {
        agentId,
        calendarId,
        offsetsMinutes: [120],
        coverage: { coversMeetingsFrom: null },
      });
      assert.equal(edited.coversMeetingsFrom?.getTime(), adoptedAt.getTime());
      const meetingId = randomUUID();
      const included = await policies.includeMeetings(personal, created.id, [
        meetingId,
      ]);
      assert.deepEqual(included?.includedMeetingIds, [meetingId]);
      const widened = await policies.coverAllMeetings(personal, created.id);
      assert.equal(widened?.coversMeetingsFrom, null);
      await prisma.meetingReminderPolicy.deleteMany({
        where: { id: created.id },
      });
      await prisma.aiVoiceAgent.deleteMany({ where: { id: agentId } });
      await prisma.calendar.deleteMany({ where: { id: calendarId } });
    });
  },
);
