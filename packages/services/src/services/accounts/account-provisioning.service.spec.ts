/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, Logger } from "@nestjs/common";
import {
  ClerkUserCreationError,
  type ClerkLogin,
  type NewClerkUser,
} from "@ringee/platform";
import { AccountProvisioningService } from "./account-provisioning.service";
import {
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from "./temporary-password";

interface SentEmail {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  cc?: string[];
}

/** Clerk, the demo-request store, the user sync and the inbox, in memory. */
function build(
  over: {
    openDemoRequest?: { id: string } | null;
    existingLogin?: ClerkLogin | null;
    createFails?: Error;
    emailAnswer?: unknown;
  } = {},
) {
  const created: NewClerkUser[] = [];
  const passwordsSet: Array<{ clerkUserId: string; password: string }> = [];
  const closedRequests: Array<{ id: string; clerkUserId: string }> = [];
  const emails: SentEmail[] = [];

  const demoRequests = {
    findLatestWithoutAccount: async () => over.openDemoRequest ?? null,
    recordManualAccount: async (id: string, clerkUserId: string) => {
      closedRequests.push({ id, clerkUserId });
      return true;
    },
  };
  const users = {
    syncFromClerk: async (clerkUserId: string) => ({
      user: { id: `ringee-${clerkUserId}` },
      clerkUser: { privateMetadata: {} },
    }),
    linkRingeeIdToClerk: async () => undefined,
  };

  const service = new AccountProvisioningService(
    demoRequests as never,
    users as never,
  );
  Object.assign(service, {
    logger: Object.assign(new Logger("spec"), {
      log: () => {},
      warn: () => {},
      error: () => {},
    }),
    logins: {
      createUser: async (input: NewClerkUser) => {
        if (over.createFails) throw over.createFails;
        created.push(input);
        return { id: "user_clerk_1" };
      },
      findByEmail: async () => over.existingLogin ?? null,
      setPassword: async (clerkUserId: string, password: string) => {
        passwordsSet.push({ clerkUserId, password });
      },
    },
    email: {
      sendEmail: async (
        to: string,
        subject: string,
        html: string,
        fromName?: string,
        _fromAddress?: string,
        _replyTo?: string,
        cc?: string[],
      ) => {
        emails.push({ to, subject, html, fromName, cc });
        return over.emailAnswer ?? { data: { id: "email-1" }, error: null };
      },
    },
  });

  return { service, created, passwordsSet, closedRequests, emails };
}

const PERSON = {
  firstName: " Mordechai ",
  lastName: "Luria",
  email: "MLuria@MoluSupply.com ",
};

describe("AccountProvisioningService.createAccount", () => {
  it("creates the login and emails its credentials with the team in cc", async () => {
    const { service, created, emails } = build();

    const account = await service.createAccount(PERSON);

    assert.equal(created.length, 1);
    assert.equal(created[0].email, "mluria@molusupply.com");
    assert.equal(created[0].firstName, "Mordechai");
    assert.deepEqual(created[0].privateMetadata, {
      provisionedBy: "backoffice",
    });

    assert.equal(emails.length, 1);
    const [email] = emails;
    assert.equal(email.to, "mluria@molusupply.com");
    assert.deepEqual(email.cc, ["edison@getringee.com"]);
    assert.equal(email.fromName, "Edison from Ringee");
    assert.equal(email.subject, "Your Ringee account is ready");
    assert.match(email.html, /Hi Mordechai,/);
    assert.match(email.html, /I have created your account/);
    assert.ok(email.html.includes(created[0].password));
    assert.match(email.html, /\/dashboard\/profile\/security/);
    assert.doesNotMatch(email.html, /requesting a Ringee demo/);

    assert.deepEqual(account, {
      userId: "ringee-user_clerk_1",
      clerkUserId: "user_clerk_1",
      email: "mluria@molusupply.com",
      emailSent: true,
      temporaryPassword: null,
    });
  });

  it("thanks a demo requester and closes their request with the login", async () => {
    const { service, closedRequests, emails } = build({
      openDemoRequest: { id: "request-1" },
    });

    await service.createAccount(PERSON);

    assert.match(emails[0].html, /Thank you for requesting a Ringee demo/);
    assert.deepEqual(closedRequests, [
      { id: "request-1", clerkUserId: "user_clerk_1" },
    ]);
  });

  it("hands the password back when the email was not sent", async () => {
    const { service, created } = build({
      emailAnswer: { error: { message: "rate limited" } },
    });

    const account = await service.createAccount(PERSON);

    assert.equal(account.emailSent, false);
    assert.equal(account.temporaryPassword, created[0].password);
  });

  it("refuses an email that already has a login, and sends nothing", async () => {
    const { service, emails } = build({
      createFails: new ClerkUserCreationError(
        "email_taken",
        "That email address is taken.",
      ),
    });

    await assert.rejects(service.createAccount(PERSON), ConflictException);
    assert.deepEqual(emails, []);
  });
});

describe("AccountProvisioningService.ensureDemoRequestLogin", () => {
  const REQUEST = {
    id: "request-1",
    email: "mluria@molusupply.com",
    firstName: "Mordechai",
    lastName: "Luria",
    clerkUserId: null,
  };

  it("creates the login marked with the request it was made for", async () => {
    const { service, created } = build();

    const login = await service.ensureDemoRequestLogin(REQUEST, "pw-1");

    assert.deepEqual(login, { kind: "created", clerkUserId: "user_clerk_1" });
    assert.deepEqual(created[0].privateMetadata, {
      provisionedBy: "demo_request",
      demoRequestId: "request-1",
    });
    assert.equal(created[0].password, "pw-1");
  });

  it("gives the login an earlier attempt made a new password instead of a second login", async () => {
    const { service, created, passwordsSet } = build({
      existingLogin: {
        id: "user_clerk_7",
        privateMetadata: {
          provisionedBy: "demo_request",
          demoRequestId: "request-1",
        },
      },
    });

    const login = await service.ensureDemoRequestLogin(REQUEST, "pw-2");

    assert.deepEqual(login, { kind: "recovered", clerkUserId: "user_clerk_7" });
    assert.deepEqual(created, []);
    assert.deepEqual(passwordsSet, [
      { clerkUserId: "user_clerk_7", password: "pw-2" },
    ]);
  });

  it("never touches a login that was not made for this request", async () => {
    const { service, created, passwordsSet } = build({
      existingLogin: { id: "user_clerk_9", privateMetadata: {} },
    });

    const login = await service.ensureDemoRequestLogin(REQUEST, "pw-3");

    assert.deepEqual(login, { kind: "taken" });
    assert.deepEqual(created, []);
    assert.deepEqual(passwordsSet, []);
  });

  it("uses the login already recorded on the request", async () => {
    const { service, passwordsSet } = build();

    const login = await service.ensureDemoRequestLogin(
      { ...REQUEST, clerkUserId: "user_clerk_1" },
      "pw-4",
    );

    assert.deepEqual(login, { kind: "recovered", clerkUserId: "user_clerk_1" });
    assert.deepEqual(passwordsSet, [
      { clerkUserId: "user_clerk_1", password: "pw-4" },
    ]);
  });
});

describe("generateTemporaryPassword", () => {
  it("mixes every character class and leaves out look-alikes and HTML", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      assert.equal(password.length, TEMPORARY_PASSWORD_LENGTH);
      assert.match(password, /[a-z]/);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[2-9]/);
      assert.match(password, /[!#$%*+\-=?@]/);
      assert.doesNotMatch(password, /[01lIO<>&"'\s]/);
      seen.add(password);
    }
    assert.equal(seen.size, 200);
  });
});
