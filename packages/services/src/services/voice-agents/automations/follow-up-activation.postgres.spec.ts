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
    // An adoption attempt reserved within the last two minutes holds the row.
    const holdWindow = () => new Date(Date.now() - 120_000);

    before(async () => {
      await prisma.user.create({ data: { id: owner, canCall: true } });
      await prisma.organization.create({
        data: { id: organizationId, clerkId: organizationId, name: "Team" },
      });
    });

    after(async () => {
      await prisma.productAnalyticsEvent.deleteMany({});
      await prisma.followUpActivation.deleteMany({
        where: { OR: [{ userId: owner }, { organizationId }] },
      });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: owner } });
      await prisma.$disconnect();
    });

    it("keeps one row per workspace, personal and organization apart", async () => {
      const mine = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "America/New_York" },
        expectedRevision: null,
        attemptStaleBefore: holdWindow(),
      });
      const team = await activations.saveConfiguration(org, {
        version,
        configuration: { timeZone: "Europe/Madrid" },
        expectedRevision: null,
        attemptStaleBefore: holdWindow(),
      });
      assert.ok(mine.ok && team.ok);
      assert.equal(mine.row.workspaceKey, `personal:${owner}`);
      assert.equal(mine.row.userId, owner);
      assert.equal(team.row.workspaceKey, `organization:${organizationId}`);
      // The organization owns its row: no member's account does.
      assert.equal(team.row.userId, null);
      assert.equal(team.row.configuredByUserId, owner);
      // A second "new" row for the same workspace is a stale write.
      const again = await activations.saveConfiguration(personal, {
        version,
        configuration: {},
        expectedRevision: null,
        attemptStaleBefore: holdWindow(),
      });
      assert.equal(again.ok, false);
    });

    it("refuses an organization row that names an owner user", async () => {
      await assert.rejects(
        prisma.followUpActivation.create({
          data: {
            userId: owner,
            organizationId,
            workspaceKey: `organization:${organizationId}`,
            version: "followup-check",
            configuration: {},
            configuredByUserId: owner,
          },
        }),
      );
    });

    it("keeps an organization's activation when the member who saved it is deleted", async () => {
      const member = randomUUID();
      await prisma.user.create({ data: { id: member, canCall: true } });
      const current = await activations.findForWorkspace(org, version);
      const saved = await activations.saveConfiguration(
        { userId: member, organizationId },
        {
          version,
          configuration: { timeZone: "UTC" },
          expectedRevision: current!.revision,
          attemptStaleBefore: holdWindow(),
        },
      );
      assert.ok(saved.ok);
      assert.equal(saved.row.configuredByUserId, member);
      await prisma.user.delete({ where: { id: member } });
      const kept = await activations.findForWorkspace(org, version);
      assert.equal(kept?.id, saved.row.id);
    });

    it("refuses a save from a stale revision and bumps on success", async () => {
      const current = await activations.findForWorkspace(personal, version);
      const stale = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "UTC" },
        expectedRevision: (current!.revision ?? 1) + 5,
        attemptStaleBefore: holdWindow(),
      });
      assert.equal(stale.ok, false);
      const saved = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "UTC" },
        expectedRevision: current!.revision,
        attemptStaleBefore: holdWindow(),
      });
      assert.ok(saved.ok);
      assert.equal(saved.row.revision, current!.revision + 1);
    });

    it("reserves the revision of one adoption: stale and concurrent writes wait", async () => {
      const current = await activations.findForWorkspace(personal, version);
      const reserved = await activations.reserveAdoption(personal, {
        version,
        requestKey: "k-reserve",
        expectedRevision: current!.revision,
        configuration: { timeZone: "UTC" },
        at: new Date(),
        attemptStaleBefore: holdWindow(),
      });
      assert.ok(reserved.ok);
      assert.equal(reserved.row.revision, current!.revision + 1);
      // A window that read before the reservation is stale…
      const stale = await activations.saveConfiguration(personal, {
        version,
        configuration: {},
        expectedRevision: current!.revision,
        attemptStaleBefore: holdWindow(),
      });
      assert.equal(stale.ok, false);
      // …and one that read after it waits for the adoption, like another
      // request trying to adopt.
      const waiting = await activations.saveConfiguration(personal, {
        version,
        configuration: {},
        expectedRevision: reserved.row.revision,
        attemptStaleBefore: holdWindow(),
      });
      assert.equal(!waiting.ok && waiting.reason, "adoption_in_progress");
      const other = await activations.reserveAdoption(personal, {
        version,
        requestKey: "k-other",
        expectedRevision: reserved.row.revision,
        at: new Date(),
        attemptStaleBefore: holdWindow(),
      });
      assert.equal(!other.ok && other.reason, "adoption_in_progress");
      // A failed attempt holds nothing, and keeps the revision.
      assert.equal(
        await activations.markAdoptionFailed(personal, {
          version,
          requestKey: "k-reserve",
        }),
        true,
      );
      const saved = await activations.saveConfiguration(personal, {
        version,
        configuration: { timeZone: "UTC" },
        expectedRevision: reserved.row.revision,
        attemptStaleBefore: holdWindow(),
      });
      assert.ok(saved.ok);
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
      // A personal row is its owner's, and goes with them.
      await prisma.user.delete({ where: { id: otherOwner } });
      assert.equal(await activations.findForWorkspace(ctx, version), null);
    });

    it("switches a saved capability off with its opt-out, until a later save", async () => {
      const current = await activations.findForWorkspace(personal, version);
      const saved = await activations.saveConfiguration(personal, {
        version,
        configuration: {
          ...(current!.configuration as Record<string, unknown>),
          capabilities: { scheduling: true, reminders: true },
        },
        expectedRevision: current!.revision,
        attemptStaleBefore: holdWindow(),
      });
      assert.ok(saved.ok);
      const optedOut = await activations.recordOptOut(personal, {
        version,
        capability: "reminders",
        reason: "trigger_removed",
        at: new Date(),
        emptyConfiguration: {},
      });
      assert.deepEqual(
        (optedOut.configuration as { capabilities?: unknown }).capabilities,
        { scheduling: true, reminders: false },
      );
      assert.equal(optedOut.revision, saved.row.revision + 1);
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
      const contactId = randomUUID();
      const meetingId = randomUUID();
      await prisma.contact.create({
        data: {
          id: contactId,
          userId: owner,
          organizationId: null,
          phoneNumber: "+13055550111",
        } as never,
      });
      await prisma.meeting.create({
        data: {
          id: meetingId,
          userId: owner,
          organizationId: null,
          contactId,
          calendarId,
          scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60_000),
        } as never,
      });
      const included = await policies.includeMeetings(personal, created.id, [
        { id: meetingId, scheduleVersion: 1 },
      ]);
      assert.ok(included.ok);
      assert.deepEqual(included.policy?.includedMeetingIds, [meetingId]);
      // Moved after the version the person reviewed: refused, and what was
      // already included stays covered.
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { scheduleVersion: 2 },
      });
      const moved = await policies.includeMeetings(personal, created.id, [
        { id: meetingId, scheduleVersion: 1 },
      ]);
      assert.deepEqual(moved, { ok: false, reason: "meeting_changed" });
      const kept = await policies.findByIdForOwner(personal, created.id);
      assert.deepEqual(kept?.includedMeetingIds, [meetingId]);
      const widened = await policies.coverAllMeetings(personal, created.id);
      assert.equal(widened?.coversMeetingsFrom, null);
      await prisma.meetingReminderPolicy.deleteMany({
        where: { id: created.id },
      });
      await prisma.meeting.deleteMany({ where: { id: meetingId } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.aiVoiceAgent.deleteMany({ where: { id: agentId } });
      await prisma.calendar.deleteMany({ where: { id: calendarId } });
    });
  },
);
