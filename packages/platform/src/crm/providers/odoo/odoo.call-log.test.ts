import { describe, expect, it } from "vitest";
import type { CrmCallLogInput } from "../../types";
import { buildOdooCallLog } from "./odoo.call-log";

const input = (overrides: Partial<CrmCallLogInput> = {}): CrmCallLogInput => ({
  idempotencyKey: "key-1",
  ringeeCallId: "call-1",
  direction: "outbound",
  from: "+14155550000",
  to: "+14155552671",
  startedAt: new Date("2026-09-01T10:00:00.000Z"),
  durationSeconds: 125,
  outcome: "meeting_booked",
  outcomeLabel: "Meeting Booked",
  linkedRecords: [],
  ...overrides,
});

describe("Odoo call log", () => {
  it("keeps the outcome as the summary and names the disposition, escaped", () => {
    const log = buildOdooCallLog(
      input({ dispositionName: "Demo <b>booked</b>" }),
    );
    expect(log.summary).toBe("Ringee call — Meeting Booked");
    expect(log.body).toContain("<strong>Outcome:</strong> Meeting Booked");
    expect(log.body).toContain(
      "<strong>Disposition:</strong> Demo &lt;b&gt;booked&lt;/b&gt;",
    );
  });

  it("reads as it always did for a call without a disposition", () => {
    expect(buildOdooCallLog(input()).body).not.toContain("Disposition");
  });
});
