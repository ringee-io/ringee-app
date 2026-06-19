import { describe, expect, it } from "vitest";
import { mapStatusToErrorCode } from "./ringee-api";

describe("mapStatusToErrorCode", () => {
  it("maps HTTP statuses to stable prepare-call error codes", () => {
    expect(mapStatusToErrorCode(401)).toBe("UNAUTHENTICATED");
    expect(mapStatusToErrorCode(402)).toBe("INSUFFICIENT_CREDITS");
    expect(mapStatusToErrorCode(403)).toBe("FORBIDDEN");
    expect(mapStatusToErrorCode(409)).toBe("NO_CALLER_ID");
  });

  it("falls back to UNKNOWN for unmapped statuses", () => {
    expect(mapStatusToErrorCode(500)).toBe("UNKNOWN");
    expect(mapStatusToErrorCode(418)).toBe("UNKNOWN");
  });
});
