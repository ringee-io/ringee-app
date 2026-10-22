/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrmCallLogInput } from "@ringee/platform";
import { CrmCallLogService } from "./crm-call-log.service";
import { CrmSyncService } from "./crm-sync.service";

type AnyRecord = Record<string, unknown>;

const connection = {
  id: "conn-1",
  provider: "hubspot",
  status: "active",
  externalAccountId: "123",
} as never;

const call = {
  id: "call-1",
  userId: "u-ana",
  organizationId: "org-1",
  contactId: "contact-1",
  direction: "outbound",
  fromNumber: "+14155550000",
  toNumber: "+14155552671",
  answeredAt: null,
  durationSeconds: 0,
  outcome: null,
  outcomeNote: null,
  dispositionName: null,
  callerIdId: null,
  startedAt: new Date("2026-10-21T10:00:00.000Z"),
  createdAt: new Date("2026-10-21T10:00:00.000Z"),
  endedAt: new Date("2026-10-21T10:00:20.000Z"),
};

const contact = {
  id: "contact-1",
  name: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phoneNumber: "+14155552671",
  company: null,
  jobTitle: "Head of Research",
  websiteUrl: "https://analytical.example",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  locationCity: "London",
  locationRegion: null,
  locationPostalCode: null,
  locationCountry: "United Kingdom",
  affiliations: [{ company: { name: "Analytical Engines" } }],
};

function harness(
  opts: {
    linkByPhone?: AnyRecord | null;
    owner?: string | null;
    failRemember?: boolean;
  } = {},
) {
  const record = {
    snapshots: [] as AnyRecord[],
    remembered: [] as AnyRecord[],
    uploads: [] as AnyRecord[],
    ownerAskedFor: [] as unknown[],
  };
  const service = new CrmCallLogService(
    { listActive: async () => [connection] } as never,
    {
      resolveByPhone: async (_c: unknown, phone: string) => ({
        link: null,
        candidates: [],
        phoneE164: phone,
      }),
      findLinkByPhone: async () => opts.linkByPhone ?? null,
      rememberLoggedRecord: async (_c: unknown, input: AnyRecord) => {
        if (opts.failRemember) throw new Error("db down");
        record.remembered.push(input);
        return input;
      },
    } as never,
    {
      upsertPending: async (input: AnyRecord) => {
        record.snapshots.push(input.payload as AnyRecord);
        return { id: "sync-1", ...input };
      },
      markStatus: async () => ({}),
    } as never,
    { enqueue: async () => ({}) } as never,
    { findById: async () => contact } as never,
    { findById: async () => call } as never,
    {
      findById: async () => ({ firstName: "Ana", lastName: "Pérez" }),
    } as never,
    { findById: async () => null } as never,
    { triggerCrmDrain: async () => undefined } as never,
    {
      resolveCrmMemberId: async (_c: unknown, userId: unknown) => {
        record.ownerAskedFor.push(userId);
        return opts.owner ?? null;
      },
    } as never,
    {
      enqueueForLoggedCall: async (
        c: AnyRecord,
        _conn: unknown,
        r: unknown,
      ) => {
        record.uploads.push({ callId: c.id, record: r });
      },
    } as never,
  );
  return { service, record };
}

const sync = { id: "sync-1", callId: "call-1" } as never;

function pendingInput(over: Partial<CrmCallLogInput> = {}): CrmCallLogInput {
  return {
    idempotencyKey: "key-1",
    ringeeCallId: "call-1",
    direction: "outbound",
    from: "+14155550000",
    to: "+14155552671",
    startedAt: new Date("2026-10-21T10:00:00.000Z"),
    linkedRecords: [],
    needsPersonCreation: { phoneE164: "+14155552671" },
    ...over,
  };
}

describe("CrmCallLogService — a first call to someone the CRM lacks", () => {
  it("snapshots every detail of the Ringee contact for creating them", async () => {
    const { service, record } = harness();

    await service.enqueueCallLog(call as never);

    assert.deepEqual(record.snapshots[0].needsPersonCreation, {
      phoneE164: "+14155552671",
      displayName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      company: "Analytical Engines",
      jobTitle: "Head of Research",
      website: "https://analytical.example",
      linkedinUrl: "https://www.linkedin.com/in/ada",
      city: "London",
      region: null,
      postalCode: null,
      country: "United Kingdom",
    });
  });

  it("gives the push the owner the call's member is linked to now", async () => {
    const { service, record } = harness({ owner: "owner-ana" });
    const input = pendingInput();

    await service.prepareForPush(connection, sync, input);

    assert.deepEqual(record.ownerAskedFor, ["u-ana"]);
    assert.equal(input.ownerExternalId, "owner-ana");
    assert.deepEqual(input.linkedRecords, []);
  });

  it("logs against a person linked to the number since the snapshot", async () => {
    const { service } = harness({
      linkByPhone: { externalId: "hs-77", externalType: "person" },
    });
    const input = pendingInput();

    await service.prepareForPush(connection, sync, input);

    assert.deepEqual(input.linkedRecords, [
      { externalId: "hs-77", externalType: "person" },
    ]);
  });

  it("remembers the person the log created, then sends the recording to them", async () => {
    const { service, record } = harness();
    const created = { externalId: "hs-501", externalType: "person" } as const;

    await service.afterPush(connection, sync, pendingInput(), {
      record: created,
      activityId: "hs-call-1",
    });

    assert.deepEqual(record.remembered, [
      {
        record: created,
        phoneE164: "+14155552671",
        contactId: "contact-1",
      },
    ]);
    assert.deepEqual(record.uploads, [{ callId: "call-1", record: created }]);
  });

  it("does not re-link a call that was logged against a known record", async () => {
    const { service, record } = harness();
    const known = { externalId: "hs-9", externalType: "person" } as const;

    await service.afterPush(
      connection,
      sync,
      pendingInput({ linkedRecords: [known] }),
      { record: known, activityId: "hs-call-2" },
    );

    assert.deepEqual(record.remembered, []);
    assert.equal(record.uploads.length, 1);
  });

  it("never fails a call that is already in the CRM", async () => {
    const { service } = harness({ failRemember: true });
    await service.afterPush(connection, sync, pendingInput(), {
      record: { externalId: "hs-1", externalType: "person" },
    });
  });
});

describe("CrmSyncService call log push", () => {
  it("pushes with the owner, then follows up with the record it landed on", async () => {
    const steps: string[] = [];
    const pushed: AnyRecord[] = [];
    const provider = {
      logCall: async (_creds: unknown, input: AnyRecord) => {
        steps.push("logCall");
        pushed.push({ ...input });
        return {
          record: { externalId: "hs-501", externalType: "person" },
          activityId: "hs-call-1",
        };
      },
    };
    const callLog = {
      prepareForPush: async (_c: unknown, _s: unknown, input: AnyRecord) => {
        steps.push("prepare");
        input.ownerExternalId = "owner-ana";
      },
      afterPush: async (
        _c: unknown,
        _s: unknown,
        _i: unknown,
        result: AnyRecord,
      ) => {
        steps.push(`after:${(result.record as AnyRecord).externalId}`);
      },
    };
    const service = new CrmSyncService(
      { get: () => provider } as never,
      {
        findById: async () => connection,
        runWithFreshCredentials: async (
          _c: unknown,
          fn: (creds: unknown) => Promise<unknown>,
        ) => fn({ accessToken: "t" }),
        touchLastSync: async () => undefined,
      } as never,
      {
        claimDueBatch: async () => [
          {
            id: "evt-1",
            kind: "call.log",
            payload: { syncId: "sync-1" },
            attemptCount: 0,
          },
        ],
        markSent: async () => steps.push("sent"),
      } as never,
      {
        findById: async () => ({
          id: "sync-1",
          callId: "call-1",
          connectionId: "conn-1",
          status: "pending",
          payloadSnapshot: {
            startedAt: "2026-10-21T10:00:00.000Z",
            linkedRecords: [],
            needsPersonCreation: { phoneE164: "+14155552671" },
          },
        }),
        markInProgress: async () => ({}),
        markDone: async () => steps.push("done"),
      } as never,
      callLog as never,
    );

    await service.drain();

    assert.deepEqual(steps, [
      "prepare",
      "logCall",
      "done",
      "sent",
      "after:hs-501",
    ]);
    assert.equal(pushed[0]?.ownerExternalId, "owner-ana");
  });
});
