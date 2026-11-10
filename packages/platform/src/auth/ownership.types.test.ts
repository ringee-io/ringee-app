import { describe, expect, it } from "vitest";
import {
  buildOwnershipFilter,
  isInWorkspace,
  isSameWorkspace,
  workspaceOf,
} from "./ownership.types";

/**
 * WRK-001 by hand: the predicate `buildOwnershipFilter` builds for Prisma,
 * applied to rows already loaded. Every personal row has a null organization,
 * so a personal match needs the owner as well.
 */
describe("isInWorkspace", () => {
  const personal = { userId: "owner-1", organizationId: null };
  const org = { userId: "owner-1", organizationId: "org-1" };

  it("matches an organization row on the organization alone", () => {
    expect(
      isInWorkspace(org, { userId: "member-2", organizationId: "org-1" }),
    ).toBe(true);
    expect(
      isInWorkspace(org, { userId: "owner-1", organizationId: "org-2" }),
    ).toBe(false);
    expect(
      isInWorkspace(org, { userId: "owner-1", organizationId: null }),
    ).toBe(false);
  });

  it("matches a personal row only for its owner and a null organization", () => {
    expect(
      isInWorkspace(personal, { userId: "owner-1", organizationId: null }),
    ).toBe(true);
    expect(
      isInWorkspace(personal, { userId: "owner-1", organizationId: undefined }),
    ).toBe(true);
    // Another freelancer's personal row.
    expect(
      isInWorkspace(personal, { userId: "other-1", organizationId: null }),
    ).toBe(false);
    // The owner's own row in an organization.
    expect(
      isInWorkspace(personal, { userId: "owner-1", organizationId: "org-1" }),
    ).toBe(false);
    // A row with no owner never belongs to a personal workspace.
    expect(
      isInWorkspace(personal, { userId: null, organizationId: null }),
    ).toBe(false);
  });

  it("agrees with buildOwnershipFilter for both scopes", () => {
    const rows = [
      { userId: "owner-1", organizationId: null },
      { userId: "other-1", organizationId: null },
      { userId: "owner-1", organizationId: "org-1" },
      { userId: "member-2", organizationId: "org-1" },
    ];
    for (const ctx of [personal, org]) {
      const filter = buildOwnershipFilter(ctx);
      for (const row of rows) {
        const filtered = Object.entries(filter).every(
          ([key, value]) => row[key as keyof typeof row] === value,
        );
        expect(isInWorkspace(ctx, row)).toBe(filtered);
      }
    }
  });
});

describe("isSameWorkspace", () => {
  it("never pairs two people's personal rows", () => {
    expect(
      isSameWorkspace(
        { userId: "owner-1", organizationId: null },
        { userId: "other-1", organizationId: null },
      ),
    ).toBe(false);
    expect(
      isSameWorkspace(
        { userId: "owner-1", organizationId: null },
        { userId: "owner-1", organizationId: null },
      ),
    ).toBe(true);
  });

  it("pairs organization rows by organization, whoever wrote them", () => {
    expect(
      isSameWorkspace(
        { userId: "admin-1", organizationId: "org-1" },
        { userId: "member-2", organizationId: "org-1" },
      ),
    ).toBe(true);
    expect(
      isSameWorkspace(
        { userId: "owner-1", organizationId: "org-1" },
        { userId: "owner-1", organizationId: null },
      ),
    ).toBe(false);
    expect(
      isSameWorkspace(
        { userId: "owner-1", organizationId: "org-1" },
        { userId: "owner-1", organizationId: "org-2" },
      ),
    ).toBe(false);
  });
});

describe("workspaceOf", () => {
  it("rebuilds the persisted scope of a row", () => {
    expect(workspaceOf({ userId: "owner-1", organizationId: null })).toEqual({
      userId: "owner-1",
      organizationId: null,
    });
    expect(workspaceOf({ userId: "admin-1", organizationId: "org-1" })).toEqual(
      {
        userId: "admin-1",
        organizationId: "org-1",
      },
    );
  });
});
