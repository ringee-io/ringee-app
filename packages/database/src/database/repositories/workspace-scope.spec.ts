import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  workspaceAdmissionSql,
  workspaceAdmissionWhere,
} from "./workspace-scope";

const OWNER = "5a1d7c0e-1f43-4e0e-9a51-0d8f4a0b6c11";

describe("workspace admission (AGENT-011, AGENT-018)", () => {
  it("admits listed personal owners only by their own userId with no organization", () => {
    assert.deepEqual(
      workspaceAdmissionWhere({
        organizationIds: [],
        personalUserIds: [OWNER],
      }),
      {
        OR: [
          { organizationId: { in: [] } },
          { organizationId: null, userId: { in: [OWNER] } },
        ],
      },
    );
    const sql = workspaceAdmissionSql(
      { organizationIds: [], personalUserIds: [OWNER] },
      "d",
    );
    assert.match(
      sql.sql,
      /d\."organizationId" IS NULL AND d\."userId"::text = ANY/,
    );
    assert.deepEqual(sql.values, [[], [OWNER]]);
  });

  it("admits every personal row when the personal list is null", () => {
    assert.deepEqual(
      workspaceAdmissionWhere({
        organizationIds: ["org-1"],
        personalUserIds: null,
      }),
      {
        OR: [{ organizationId: { in: ["org-1"] } }, { organizationId: null }],
      },
    );
    const sql = workspaceAdmissionSql({
      organizationIds: null,
      personalUserIds: null,
    });
    assert.equal(
      sql.sql,
      `(("organizationId" IS NOT NULL) OR ("organizationId" IS NULL))`,
    );
    assert.deepEqual(sql.values, []);
  });
});
