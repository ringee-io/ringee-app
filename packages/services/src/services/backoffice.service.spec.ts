import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { BackofficeService } from "./backoffice.service";

interface StoredNumber {
  id: string;
  phoneNumber: string;
  kind: "purchased" | "verified_caller_id";
  userId: string | null;
  organizationId: string | null;
  deletedAt: Date | null;
}

function setup(
  options: {
    existing?: StoredNumber[];
    orgOwner?: string | null;
    lockFree?: boolean;
    assignFails?: string;
  } = {},
) {
  const events: string[] = [];
  const registrations: unknown[] = [];
  const existing = new Map(
    (options.existing ?? []).map((n) => [n.phoneNumber, n]),
  );

  const repo = {
    adminRegister: async (
      registration: { phoneNumber: string },
      retiredId: string | null,
    ) => {
      registrations.push({ ...registration, retiredId });
      events.push(`register ${registration.phoneNumber}`);
      return { id: retiredId ?? `new-${registration.phoneNumber}` };
    },
    adminAssign: async (
      numberId: string,
      owner: { userId: string; organizationId: string | null },
    ) => {
      events.push(
        `assign ${numberId} ${owner.userId} ${owner.organizationId ?? "-"}`,
      );
      if (options.assignFails) throw new Error(options.assignFails);
      return { id: numberId };
    },
    adminUnassign: async (numberId: string) => {
      events.push(`unassign ${numberId}`);
      return { id: numberId };
    },
    resolveOrgOwnerUserId: async () =>
      options.orgOwner === undefined ? "admin-1" : options.orgOwner,
    userExists: async (id: string) => id !== "ghost",
  };

  const service = new BackofficeService(
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      findByPhoneNumber: async (phoneNumber: string) =>
        existing.get(phoneNumber) ?? null,
    } as never,
    {
      setIfAbsent: async (key: string) => {
        events.push(`lock ${key}`);
        return options.lockFree ?? true;
      },
      compareAndSwap: async (key: string) => {
        events.push(`release ${key}`);
        return true;
      },
    } as never,
  );
  return { service, events, registrations };
}

describe("BackofficeService.registerNumbers", () => {
  it("files a new number under its country and type, Ringee's records only", async () => {
    const { service, registrations } = setup();

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+1 (305) 555-0101", "+18888675309", "+1 809 555 0123"],
      assignTo: null,
    });

    assert.deepEqual(registrations, [
      {
        phoneNumber: "+13055550101",
        isoCountry: "US",
        phoneNumberType: "local",
        retiredId: null,
      },
      {
        phoneNumber: "+18888675309",
        isoCountry: "US",
        phoneNumberType: "toll_free",
        retiredId: null,
      },
      {
        phoneNumber: "+18095550123",
        isoCountry: "DO",
        phoneNumberType: "local",
        retiredId: null,
      },
    ]);
    assert.deepEqual(
      results.map((r) => [r.phoneNumber, r.outcome, r.assigned, r.error]),
      [
        ["+13055550101", "added", false, null],
        ["+18888675309", "added", false, null],
        ["+18095550123", "added", false, null],
      ],
    );
  });

  it("never guesses a country: a national or unreadable number fails alone", async () => {
    const { service, registrations } = setup();

    const { results } = await service.registerNumbers({
      phoneNumbers: ["3055550101", "hello", "", "+13055550101"],
      assignTo: null,
    });

    assert.deepEqual(
      results.map((r) => [r.phoneNumber, r.outcome]),
      [
        ["3055550101", "failed"],
        ["hello", "failed"],
        ["+13055550101", "added"],
      ],
    );
    assert.equal(registrations.length, 1);
  });

  it("registers a number typed twice once", async () => {
    const { service, registrations } = setup();

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101", "+1 305-555-0101", "0013055550101"],
      assignTo: null,
    });

    assert.equal(results.length, 1);
    assert.equal(registrations.length, 1);
  });

  it("revives the row of a retired number instead of creating another", async () => {
    const { service, registrations } = setup({
      existing: [
        {
          id: "retired-1",
          phoneNumber: "+13055550101",
          kind: "purchased",
          userId: null,
          organizationId: null,
          deletedAt: new Date("2026-10-28T00:00:00Z"),
        },
      ],
    });

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: null,
    });

    assert.equal(results[0]?.outcome, "restored");
    assert.equal(results[0]?.numberId, "retired-1");
    assert.deepEqual(
      (registrations[0] as { retiredId: string }).retiredId,
      "retired-1",
    );
  });

  it("refuses a customer's verified caller ID", async () => {
    const { service, events } = setup({
      existing: [
        {
          id: "caller-id-1",
          phoneNumber: "+13055550101",
          kind: "verified_caller_id",
          userId: "user-x",
          organizationId: null,
          deletedAt: null,
        },
      ],
    });

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: { type: "user", id: "user-a" },
    });

    assert.equal(results[0]?.outcome, "failed");
    assert.deepEqual(events, []);
  });

  it("assigns each new number to the account, under the number's route lock", async () => {
    const { service, events } = setup();

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: { type: "org", id: "org-1" },
    });

    assert.deepEqual(events, [
      "register +13055550101",
      "lock inbound-route:ringee:new-+13055550101",
      "assign new-+13055550101 admin-1 org-1",
      "release inbound-route:ringee:new-+13055550101",
    ]);
    assert.equal(results[0]?.assigned, true);
  });

  it("assigns a number already in the inventory when it is unassigned", async () => {
    const { service, events, registrations } = setup({
      existing: [
        {
          id: "pool-1",
          phoneNumber: "+13055550101",
          kind: "purchased",
          userId: null,
          organizationId: null,
          deletedAt: null,
        },
      ],
    });

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: { type: "user", id: "user-a" },
    });

    assert.equal(registrations.length, 0);
    assert.ok(events.includes("assign pool-1 user-a -"));
    assert.deepEqual(
      [results[0]?.outcome, results[0]?.assigned, results[0]?.error],
      ["existing", true, null],
    );
  });

  it("leaves a number another account holds where it is", async () => {
    const { service, events } = setup({
      existing: [
        {
          id: "held-1",
          phoneNumber: "+13055550101",
          kind: "purchased",
          userId: "user-b",
          organizationId: null,
          deletedAt: null,
        },
      ],
    });

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: { type: "user", id: "user-a" },
    });

    assert.deepEqual(events, []);
    assert.equal(results[0]?.assigned, false);
    assert.match(results[0]?.error ?? "", /unassign it first/);
  });

  it("reports a number already held by the account as assigned", async () => {
    const { service, events } = setup({
      existing: [
        {
          id: "held-1",
          phoneNumber: "+13055550101",
          kind: "purchased",
          // Another member holds it, but the workspace is the organization.
          userId: "member-2",
          organizationId: "org-1",
          deletedAt: null,
        },
      ],
    });

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: { type: "org", id: "org-1" },
    });

    assert.deepEqual(events, []);
    assert.deepEqual(
      [results[0]?.outcome, results[0]?.assigned, results[0]?.error],
      ["existing", true, null],
    );
  });

  it("keeps a registered number when its assignment fails, and says so", async () => {
    const { service } = setup({ assignFails: "connection reset" });

    const { results } = await service.registerNumbers({
      phoneNumbers: ["+13055550101"],
      assignTo: { type: "user", id: "user-a" },
    });

    assert.equal(results[0]?.outcome, "added");
    assert.equal(results[0]?.assigned, false);
    assert.match(results[0]?.error ?? "", /not assigned: connection reset/);
  });

  it("checks the account before registering anything", async () => {
    const { service, events } = setup({ orgOwner: null });

    await assert.rejects(
      service.registerNumbers({
        phoneNumbers: ["+13055550101"],
        assignTo: { type: "org", id: "org-1" },
      }),
      BadRequestException,
    );
    await assert.rejects(
      service.registerNumbers({
        phoneNumbers: ["+13055550101"],
        assignTo: { type: "user", id: "ghost" },
      }),
      /User not found/,
    );
    assert.deepEqual(events, []);
  });

  it("refuses an empty or oversized request", async () => {
    const { service } = setup();

    await assert.rejects(
      service.registerNumbers({ phoneNumbers: [" ", ""], assignTo: null }),
      BadRequestException,
    );
    await assert.rejects(
      service.registerNumbers({
        phoneNumbers: Array.from(
          { length: 51 },
          (_, i) => `+1305555${String(i).padStart(4, "0")}`,
        ),
        assignTo: null,
      }),
      BadRequestException,
    );
  });
});

describe("BackofficeService number moves", () => {
  it("unassigns under the number's route lock", async () => {
    const { service, events } = setup();

    await service.unassignNumber("number-1");

    assert.deepEqual(events, [
      "lock inbound-route:ringee:number-1",
      "unassign number-1",
      "release inbound-route:ringee:number-1",
    ]);
  });

  it("refuses to move a number while its route is being written", async () => {
    const { service, events } = setup({ lockFree: false });

    await assert.rejects(
      service.assignNumber("user", "user-a", "number-1"),
      ConflictException,
    );
    assert.ok(!events.some((e) => e.startsWith("assign")));
  });
});
