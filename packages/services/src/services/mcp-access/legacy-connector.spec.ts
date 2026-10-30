import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { McpController } from "../../../../../apps/backend/src/api/routes/mcp.controller";

describe("retired UUID MCP authorization", () => {
  it("never resolves a user or organization UUID into an authenticated context", async () => {
    const controller = new McpController(
      {} as never,
      {} as never,
    ) as unknown as {
      resolveContextById(id: string): Promise<unknown>;
      resolveOrgContext(
        userId: string,
        organizationId: string,
      ): Promise<unknown>;
    };
    const retired = (error: unknown) =>
      (error as { getStatus(): number }).getStatus() === 410;
    await assert.rejects(
      controller.resolveContextById("12345678-1234-1234-1234-123456789012"),
      retired,
    );
    await assert.rejects(
      controller.resolveOrgContext("user-id", "org-id"),
      retired,
    );
  });
});
