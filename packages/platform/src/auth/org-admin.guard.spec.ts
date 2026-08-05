/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { OrgAdminGuard } from "./org-admin.guard";

/**
 * The guard that makes the Journey admin-only.
 *
 * `JourneyController` carries `@OrgAdminOnly()` at the class level, so these
 * cases are the actual access-control contract for every journey route —
 * including the read. Hiding the nav entry is presentation; this is the control.
 */

function context(request: Record<string, unknown>, allowMember = false) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
    __allowMember: allowMember,
  } as never;
}

function guard(allowMember = false) {
  const reflector = {
    getAllAndOverride: () => allowMember,
  };
  return new OrgAdminGuard(reflector as never);
}

describe("OrgAdminGuard", () => {
  it("lets a freelancer through — they are their own workspace admin", () => {
    assert.equal(guard().canActivate(context({})), true);
  });

  it("lets an organization admin through", () => {
    assert.equal(
      guard().canActivate(
        context({ clerkOrgId: "org_1", orgRole: "org:admin" }),
      ),
      true,
    );
  });

  it("denies a plain organization member with 403", () => {
    assert.throws(
      () =>
        guard().canActivate(
          context({ clerkOrgId: "org_1", orgRole: "org:member" }),
        ),
      ForbiddenException,
    );
  });

  it("denies a member with no role at all", () => {
    assert.throws(
      () => guard().canActivate(context({ clerkOrgId: "org_1" })),
      ForbiddenException,
    );
  });

  it("denies an unrecognised role rather than defaulting to allow", () => {
    assert.throws(
      () =>
        guard().canActivate(
          context({ clerkOrgId: "org_1", orgRole: "org:billing_manager" }),
        ),
      ForbiddenException,
    );
  });

  it("cannot be bypassed by sending a role in the body", () => {
    // Only `request.orgRole`, populated by ClerkAuthGuard from the session,
    // is consulted. A crafted payload is invisible here.
    assert.throws(
      () =>
        guard().canActivate(
          context({
            clerkOrgId: "org_1",
            orgRole: "org:member",
            body: { orgRole: "org:admin" },
            query: { role: "org:admin" },
          }),
        ),
      ForbiddenException,
    );
  });

  it("honours an explicit @AllowOrgMember() escape hatch", () => {
    // The Journey does NOT use this — asserted so a future edit that adds it
    // has to change this test deliberately.
    assert.equal(
      guard(true).canActivate(
        context({ clerkOrgId: "org_1", orgRole: "org:member" }),
      ),
      true,
    );
  });
});
