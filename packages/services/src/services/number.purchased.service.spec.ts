import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { NumberPurchasedService } from "./number.purchased.service";

const config = apiConfiguration as unknown as Record<string, unknown>;
const NUMBER = {
  id: "number-r",
  phoneNumber: "+13055550101",
  userId: "user-a",
  organizationId: null,
  status: "active",
  deletedAt: null,
};
const OWNER = { id: "user-a", activeOrgId: null, activeOrgRole: null };
const LOCK = "inbound-route:ringee:number-r";

function setup(options: {
  lockFree?: boolean;
  /** Where the DID sits once the transfer committed. */
  connectionId?: string | null;
  carrierFails?: boolean;
}) {
  const events: string[] = [];
  const service = new NumberPurchasedService(
    {
      findById: async () => NUMBER,
      transferWorkspace: async () => {
        events.push("transfer");
        return {
          ...NUMBER,
          organizationId: "org-1",
          providerConnectionId: options.connectionId ?? null,
        };
      },
      update: async (_id: string, data: Record<string, unknown>) => {
        events.push(`update ${String(data.providerConnectionId)}`);
        return { ...NUMBER, organizationId: "org-1", ...data };
      },
    } as never,
    {
      assignNumberToConnection: async (_number: string, connection: string) => {
        events.push(`assign ${connection}`);
        if (options.carrierFails) throw new Error("carrier down");
        return { connectionId: connection, connectionName: "Shared" };
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      listMembershipsForUser: async () => [
        { id: "org-1", name: "Acme", role: "org:admin" },
      ],
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
  return { service, events };
}

describe("NumberPurchasedService.transferWorkspace", () => {
  const previous = {
    app: config.TELNYX_CALL_CONTROL_APP_ID,
    shared: config.TELNYX_CONNECTION_ID,
  };
  beforeEach(() => {
    config.TELNYX_CALL_CONTROL_APP_ID = "receptionist-app";
    config.TELNYX_CONNECTION_ID = "shared-webrtc";
  });
  afterEach(() => {
    config.TELNYX_CALL_CONTROL_APP_ID = previous.app;
    config.TELNYX_CONNECTION_ID = previous.shared;
  });

  it("moves a number under the lock its inbound route writers hold", async () => {
    const s = setup({ connectionId: "shared-webrtc" });
    await s.service.transferWorkspace(OWNER, "number-r", "org-1");
    assert.deepEqual(s.events, [`lock ${LOCK}`, "transfer", `release ${LOCK}`]);
  });

  it("refuses to move a number while its route is being written", async () => {
    const s = setup({ lockFree: false });
    await assert.rejects(
      s.service.transferWorkspace(OWNER, "number-r", "org-1"),
      ConflictException,
    );
    assert.deepEqual(s.events, [`lock ${LOCK}`]);
  });

  it("takes a DID an AI route held off the Call Control application once the route is gone", async () => {
    const s = setup({ connectionId: "receptionist-app" });
    const moved = await s.service.transferWorkspace(OWNER, "number-r", "org-1");
    assert.deepEqual(s.events, [
      `lock ${LOCK}`,
      "transfer",
      "assign shared-webrtc",
      "update shared-webrtc",
      `release ${LOCK}`,
    ]);
    assert.equal(moved.providerConnectionId, "shared-webrtc");
  });

  it("keeps the transfer when the carrier refuses to move the DID", async () => {
    const s = setup({ connectionId: "receptionist-app", carrierFails: true });
    const moved = await s.service.transferWorkspace(OWNER, "number-r", "org-1");
    assert.equal(moved.organizationId, "org-1");
    assert.deepEqual(s.events, [
      `lock ${LOCK}`,
      "transfer",
      "assign shared-webrtc",
      `release ${LOCK}`,
    ]);
  });
});
