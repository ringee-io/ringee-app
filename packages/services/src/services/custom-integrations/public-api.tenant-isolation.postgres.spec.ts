import {
  FOLLOW_UP_SUITE_TIMEOUT_MS,
  isolateFollowUpWorkerFixtures,
} from "../../../test/postgres-worker-fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import {
  AiVoiceAgentCallRepository,
  AiVoiceAgentRepository,
  CallRepository,
  ContactRepository,
  CustomIntegrationDeliveryRepository,
  CustomIntegrationRepository,
  PrismaClient,
  TagRepository,
  UserRepository,
} from "@ringee/database";
import { generateCustomIntegrationApiKey } from "@ringee/platform";
import type { OwnershipContext } from "@ringee/platform";
import { ContactService } from "../contact.service";
import { CustomIntegrationAuthService } from "./custom-integration-auth.service";
import { CustomIntegrationOutboundService } from "./custom-integration-outbound.service";

/**
 * The public API's workspace isolation on real PostgreSQL (HOOK-007).
 *
 * Two organizations each own an integration key, an AI voice agent, contacts, a
 * call and an agent call; one person also has a personal workspace. Every read
 * and write the public routes make is then attempted with the other
 * workspace's key or ids. The answer to each must be what an id that never
 * existed would get, and the other side's rows must be untouched afterwards.
 *
 * Opt in with a disposable database (the same variable the follow-up suites
 * use); without it the suite is skipped.
 */
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;

describe(
  "public API workspace isolation on PostgreSQL (HOOK-007)",
  { skip: !url, timeout: FOLLOW_UP_SUITE_TIMEOUT_MS },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const integrations = new CustomIntegrationRepository(db);
    const auth = new CustomIntegrationAuthService(integrations);
    const callsRepo = new CallRepository(db);
    const agentCalls = new AiVoiceAgentCallRepository(db);
    const agentsRepo = new AiVoiceAgentRepository(db);
    const contacts = new ContactService(
      new ContactRepository(db),
      new TagRepository(db),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const outbound = new CustomIntegrationOutboundService(
      integrations,
      new CustomIntegrationDeliveryRepository(db),
      agentCalls,
      new UserRepository(db, {} as never),
      agentsRepo,
      callsRepo,
    );

    interface Side {
      ctx: OwnershipContext;
      userId: string;
      organizationId: string;
      key: string;
      integrationId: string;
      phone: string;
      contactId: string;
      callId: string;
      agentId: string;
      agentCallId: string;
      tagId: string;
    }
    const a = {} as Side;
    const b = {} as Side;
    let releaseFixture: (() => Promise<void>) | undefined;
    const phone = () =>
      `+1202${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, "0")}`;

    async function seed(side: Side, name: string) {
      side.userId = randomUUID();
      side.organizationId = randomUUID();
      side.ctx = { userId: side.userId, organizationId: side.organizationId };
      side.phone = phone();
      await prisma.user.create({
        data: { id: side.userId, canCall: true, firstName: name },
      });
      await prisma.organization.create({
        data: {
          id: side.organizationId,
          clerkId: side.organizationId,
          name,
        },
      });
      const key = generateCustomIntegrationApiKey();
      side.key = key.plaintext;
      side.integrationId = (
        await integrations.create(side.ctx, {
          name: `${name} integration`,
          apiKeyPrefix: key.prefix,
          apiKeyHash: key.hash,
          webhookSigningSecretCt: "ciphertext",
        })
      ).id;
      side.contactId = (
        await prisma.contact.create({
          data: { ...side.ctx, name, phoneNumber: side.phone },
        })
      ).id;
      side.tagId = (
        await prisma.tag.create({ data: { ...side.ctx, name: `${name}-tag` } })
      ).id;
      side.callId = (
        await prisma.call.create({
          data: {
            ...side.ctx,
            contactId: side.contactId,
            source: "ai_voice_agent",
            fromNumber: "+12025550100",
            toNumber: side.phone,
            direction: "outbound",
            status: "completed",
            answeredAt: new Date(),
            endedAt: new Date(),
          },
        })
      ).id;
      side.agentId = (
        await prisma.aiVoiceAgent.create({
          data: {
            ...side.ctx,
            name: `${name} agent`,
            type: "reminders_notifications",
            status: "active",
            providerAssistantId: `fixture-${randomUUID()}`,
            providerTexmlAppId: `app-${randomUUID()}`,
            toolSecretHash: "fixture",
          },
        })
      ).id;
      side.agentCallId = (
        await prisma.aiVoiceAgentCall.create({
          data: {
            ...side.ctx,
            agentId: side.agentId,
            callId: side.callId,
            toNumber: side.phone,
            fromNumber: "+12025550100",
            status: "completed",
          },
        })
      ).id;
    }

    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
      releaseFixture = await isolateFollowUpWorkerFixtures(prisma);
      await seed(a, "Alpha");
      await seed(b, "Beta");
    });

    after(async () => {
      try {
        const users = { in: [a.userId, b.userId] };
        await prisma.aiVoiceAgentCall.deleteMany({ where: { userId: users } });
        await prisma.call.deleteMany({ where: { userId: users } });
        await prisma.aiVoiceAgent.deleteMany({ where: { userId: users } });
        await prisma.contactTag.deleteMany({
          where: { contact: { userId: users } },
        });
        await prisma.contact.deleteMany({ where: { userId: users } });
        await prisma.tag.deleteMany({ where: { userId: users } });
        await prisma.customIntegration.deleteMany({
          where: { userId: users },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: [a.organizationId, b.organizationId] } },
        });
        await prisma.user.deleteMany({ where: { id: users } });
      } finally {
        await releaseFixture?.();
        await prisma.$disconnect();
      }
    });

    it("resolves each key to its own workspace only", async () => {
      assert.deepEqual((await auth.resolveApiKey(a.key)).ctx, a.ctx);
      assert.deepEqual((await auth.resolveApiKey(b.key)).ctx, b.ctx);
      await assert.rejects(
        auth.resolveApiKey(`${a.key.slice(0, -4)}0000`),
        UnauthorizedException,
      );
      await assert.rejects(
        auth.resolveApiKey(undefined),
        UnauthorizedException,
      );
    });

    it("answers another workspace's contact as not found, on every route", async () => {
      await assert.rejects(
        contacts.getContactById(a.ctx, b.contactId),
        NotFoundException,
      );
      await assert.rejects(
        contacts.updateContact(a.ctx, b.contactId, { firstName: "Mallory" }),
        NotFoundException,
      );
      await assert.rejects(
        contacts.deleteConfirmed(a.ctx, b.contactId, b.phone),
        NotFoundException,
      );
      const untouched = await prisma.contact.findUniqueOrThrow({
        where: { id: b.contactId },
      });
      assert.equal(untouched.deletedAt, null);
      assert.equal(untouched.firstName, null);
    });

    it("lists, searches and filters only the caller's own contacts", async () => {
      const mine = await contacts.listContacts(
        a.ctx,
        undefined,
        undefined,
        1,
        100,
      );
      assert.ok(mine.data.some((c) => c.id === a.contactId));
      assert.ok(mine.data.every((c) => c.id !== b.contactId));
      const byTheirNumber = await contacts.listContacts(
        a.ctx,
        b.phone,
        undefined,
        1,
        100,
      );
      assert.equal(byTheirNumber.data.length, 0);
    });

    it("upserts a number the other workspace holds as a new contact of its own", async () => {
      const { contact, created } = await contacts.upsertContact(a.ctx, {
        phoneNumber: b.phone,
        firstName: "Shared",
      });
      assert.equal(created, true);
      assert.notEqual(contact.id, b.contactId);
      const theirs = await prisma.contact.findUniqueOrThrow({
        where: { id: b.contactId },
      });
      assert.equal(theirs.firstName, null);
    });

    it("never links a tag from another workspace", async () => {
      await assert.rejects(
        contacts.updateContact(a.ctx, a.contactId, { tagIds: [b.tagId] }),
        BadRequestException,
      );
      await assert.rejects(
        contacts.upsertContact(a.ctx, {
          phoneNumber: phone(),
          tagIds: [b.tagId],
        }),
        BadRequestException,
      );
      assert.equal(
        await prisma.contactTag.count({ where: { tagId: b.tagId } }),
        0,
        "the other workspace's tag was not attached to anything",
      );
    });

    it("answers another workspace's call, by either id, as nothing", async () => {
      assert.equal(await outbound.getCallDetail(a.ctx, b.callId), null);
      assert.equal(await outbound.getCallDetail(a.ctx, b.agentCallId), null);
      assert.equal(await outbound.resolveCallId(a.ctx, b.callId), null);
      assert.equal(await outbound.resolveCallId(a.ctx, b.agentCallId), null);
      // Positive control: its own ids work, through either id.
      assert.equal(await outbound.resolveCallId(a.ctx, a.callId), a.callId);
      assert.equal(
        await outbound.resolveCallId(a.ctx, a.agentCallId),
        a.callId,
      );
      assert.ok(await outbound.getCallDetail(a.ctx, a.agentCallId));
    });

    it("lists and filters only the caller's own calls", async () => {
      const all = await callsRepo.listByOwnerPaginated(a.ctx, { limit: 100 });
      assert.ok(all.data.some((c) => c.id === a.callId));
      assert.ok(all.data.every((c) => c.id !== b.callId));
      const filtered = await callsRepo.listByOwnerPaginated(a.ctx, {
        contactId: b.contactId,
      });
      assert.equal(filtered.total, 0);
      assert.equal(await callsRepo.findByIdForOwner(a.ctx, b.callId), null);
    });

    it("answers another workspace's agent and agent calls as nothing", async () => {
      assert.equal(await agentsRepo.findByIdForOwner(a.ctx, b.agentId), null);
      assert.equal(
        await agentCalls.findByIdForOwner(a.ctx, b.agentCallId),
        null,
      );
      const theirs = await agentCalls.listForAgent(a.ctx, b.agentId);
      assert.equal(theirs.total, 0);
    });

    it("keeps a personal workspace apart from the organization it belongs to", async () => {
      const personal: OwnershipContext = {
        userId: a.userId,
        organizationId: null,
      };
      await assert.rejects(
        contacts.getContactById(personal, a.contactId),
        NotFoundException,
      );
      assert.equal(await outbound.getCallDetail(personal, a.callId), null);
      assert.equal(
        await agentsRepo.findByIdForOwner(personal, a.agentId),
        null,
      );
    });

    it("stops honoring a key the moment it is disabled or rotated", async () => {
      const key = generateCustomIntegrationApiKey();
      const created = await integrations.create(b.ctx, {
        name: "Temporary",
        apiKeyPrefix: key.prefix,
        apiKeyHash: key.hash,
        webhookSigningSecretCt: "ciphertext",
      });
      assert.deepEqual((await auth.resolveApiKey(key.plaintext)).ctx, b.ctx);

      await integrations.update(created.id, { status: "disabled" });
      await assert.rejects(auth.resolveApiKey(key.plaintext), /disabled/);

      await integrations.update(created.id, { status: "active" });
      const next = generateCustomIntegrationApiKey();
      await integrations.rotateApiKey(created.id, next.prefix, next.hash);
      await assert.rejects(
        auth.resolveApiKey(key.plaintext),
        UnauthorizedException,
      );
      assert.deepEqual((await auth.resolveApiKey(next.plaintext)).ctx, b.ctx);
    });
  },
);
