/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VoiceAgentHumanSupportService } from "./voice-agent-human-support.service";

const AGENT = { id: "agent-1", name: "Sofia" };
const CALL = {
  id: "agent-call-1",
  callId: "call-1",
};
const CONTACT = {
  id: "contact-1",
  name: "Carlos Rivera",
  phoneNumber: "+13055550123",
  email: "carlos@acme.test",
  company: "Acme",
};

function build(over: { first?: boolean; emails?: boolean } = {}) {
  const emails: Array<{
    to: string[];
    subject: string;
    html: string;
  }> = [];
  const pushes: Array<{
    token: string;
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    };
  }> = [];
  const released: string[] = [];
  let personalLookups = 0;
  let organizationLookups = 0;

  const service = new VoiceAgentHumanSupportService(
    {
      findById: async () => {
        personalLookups += 1;
        return {
          id: "owner-1",
          emails: over.emails === false ? [] : [{ email: "owner@test.dev" }],
        };
      },
    } as never,
    {
      findAdminMembersWithEmails: async () => {
        organizationLookups += 1;
        return [
          {
            id: "admin-1",
            emails:
              over.emails === false
                ? []
                : [{ email: "admin@test.dev", isPrimary: true }],
          },
          {
            id: "admin-2",
            emails: over.emails === false ? [] : [{ email: "other@test.dev" }],
          },
        ];
      },
    } as never,
    {
      findActiveByUser: async (userId: string) =>
        over.emails === false ? [] : [{ fcmToken: `ExpoPushToken[${userId}]` }],
    } as never,
    {
      sendNotification: async (
        token: string,
        payload: {
          title: string;
          body: string;
          data?: Record<string, string>;
        },
      ) => {
        pushes.push({ token, payload });
      },
    } as never,
    {
      setIfAbsent: async () => over.first !== false,
      del: async (key: string) => {
        released.push(key);
      },
    } as never,
  );

  (
    service as unknown as {
      email: {
        sendEmail: (
          to: string[],
          subject: string,
          html: string,
        ) => Promise<object>;
      };
    }
  ).email = {
    sendEmail: async (to, subject, html) => {
      emails.push({ to, subject, html });
      return { id: "email-1" };
    },
  };

  return {
    service,
    emails,
    pushes,
    released,
    personalLookups: () => personalLookups,
    organizationLookups: () => organizationLookups,
  };
}

describe("VoiceAgentHumanSupportService", () => {
  it("emails and pushes organization admins with agent and contact context", async () => {
    const { service, emails, pushes, personalLookups } = build();
    const result = await service.notify({
      ctx: { userId: "member-1", organizationId: "org-1" },
      agent: AGENT as never,
      call: CALL as never,
      contact: CONTACT,
      subject: "Booking failed",
      message: "Customer needs <Tuesday> & a human confirmation.",
    });

    assert.deepEqual(result, {
      delivered: true,
      duplicate: false,
      recipientCount: 2,
    });
    assert.equal(personalLookups(), 0);
    assert.deepEqual(emails[0]?.to, ["admin@test.dev", "other@test.dev"]);
    assert.equal(
      emails[0]?.subject,
      "Human support requested — Booking failed",
    );
    assert.match(emails[0]?.html ?? "", /Sofia/);
    assert.match(emails[0]?.html ?? "", /Carlos Rivera/);
    assert.match(emails[0]?.html ?? "", /\+13055550123/);
    assert.match(emails[0]?.html ?? "", /&lt;Tuesday&gt; &amp;/);
    assert.equal(pushes.length, 2);
    assert.equal(pushes[0]?.payload.data?.agentCallId, "agent-call-1");
    assert.equal(pushes[0]?.payload.data?.contactId, "contact-1");
  });

  it("notifies the owner for a personal workspace", async () => {
    const { service, emails, personalLookups, organizationLookups } = build();
    const result = await service.notify({
      ctx: { userId: "owner-1", organizationId: null },
      agent: AGENT as never,
      call: CALL as never,
      contact: CONTACT,
      subject: "Needs help",
      message: "Please call back.",
    });

    assert.equal(result.delivered, true);
    assert.equal(personalLookups(), 1);
    assert.equal(organizationLookups(), 0);
    assert.deepEqual(emails[0]?.to, ["owner@test.dev"]);
  });

  it("suppresses a provider retry for the same call", async () => {
    const { service, emails, pushes } = build({ first: false });
    const result = await service.notify({
      ctx: { userId: "member-1", organizationId: "org-1" },
      agent: AGENT as never,
      call: CALL as never,
      contact: CONTACT,
      subject: "Booking failed",
      message: "Please follow up.",
    });

    assert.deepEqual(result, {
      delivered: true,
      duplicate: true,
      recipientCount: 0,
    });
    assert.deepEqual(emails, []);
    assert.deepEqual(pushes, []);
  });

  it("releases the retry marker when admins have no usable channel", async () => {
    const { service, released } = build({ emails: false });
    const result = await service.notify({
      ctx: { userId: "member-1", organizationId: "org-1" },
      agent: AGENT as never,
      call: CALL as never,
      contact: CONTACT,
      subject: "Booking failed",
      message: "Please follow up.",
    });

    assert.equal(result.delivered, false);
    assert.deepEqual(released, ["voice-agent:human-support:agent-call-1"]);
  });
});
