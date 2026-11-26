import { describe, expect, it } from "vitest";
import { workspaceKeyOf } from "../../auth/ownership.types";
import {
  DEFAULT_CLASS_BY_SOURCE,
  DISPATCH_SOURCES,
  INTERACTIVE_ONLY_SOURCES,
  TRAFFIC_CLASSES,
  TRAFFIC_LABEL,
  TRAFFIC_LEVEL,
  resolveTrafficClass,
  trafficClassOfLevel,
} from "./traffic-class";

describe("traffic classes", () => {
  it("orders P0..P3 from interactive to background", () => {
    expect(TRAFFIC_CLASSES.map((cls) => TRAFFIC_LEVEL[cls])).toEqual([
      0, 1, 2, 3,
    ]);
    expect(TRAFFIC_CLASSES.map((cls) => TRAFFIC_LABEL[cls])).toEqual([
      "P0",
      "P1",
      "P2",
      "P3",
    ]);
    expect(trafficClassOfLevel(2)).toBe("automation");
    expect(() => trafficClassOfLevel(9)).toThrow(RangeError);
  });

  it("classifies every declared source", () => {
    for (const source of DISPATCH_SOURCES) {
      expect(TRAFFIC_CLASSES).toContain(DEFAULT_CLASS_BY_SOURCE[source]);
    }
  });

  it.each([
    ["web_dial", "interactive"],
    ["inbound_ring", "interactive"],
    ["call_transfer", "interactive"],
    ["voicemail_drop", "interactive"],
    ["agent_dashboard", "interactive"],
    ["agent_reminder", "scheduled"],
    ["agent_callback", "scheduled"],
    ["agent_automation", "automation"],
    ["progressive_dial", "automation"],
    ["agent_api", "background"],
    ["agent_mcp", "background"],
    ["unscoped", "interactive"],
  ] as const)("%s is %s by default", (source, cls) => {
    expect(resolveTrafficClass(source)).toBe(cls);
  });

  it("lets an administrator move an automated source", () => {
    expect(resolveTrafficClass("agent_api", { agent_api: "automation" })).toBe(
      "automation",
    );
    expect(
      resolveTrafficClass("agent_reminder", { agent_reminder: "background" }),
    ).toBe("background");
  });

  it("never lets an override demote a person waiting on the line", () => {
    for (const source of INTERACTIVE_ONLY_SOURCES) {
      expect(resolveTrafficClass(source, { [source]: "background" })).toBe(
        "interactive",
      );
    }
  });

  it("an unscoped request is interactive so it can never fail", () => {
    expect(resolveTrafficClass("unscoped", { unscoped: "background" })).toBe(
      "interactive",
    );
  });
});

describe("workspace keys", () => {
  // The pacing layer keys a workspace with the canonical `workspaceKeyOf`.
  it("keeps a personal workspace and an organization apart (WRK-001)", () => {
    const personal = workspaceKeyOf({ userId: "u1", organizationId: null });
    const org = workspaceKeyOf({ userId: "u1", organizationId: "o1" });
    expect(personal).toBe("personal:u1");
    expect(org).toBe("organization:o1");
    expect(personal).not.toBe(org);
  });

  it("is the organization, not the member, inside an organization", () => {
    expect(workspaceKeyOf({ userId: "u1", organizationId: "o1" })).toBe(
      workspaceKeyOf({ userId: "u2", organizationId: "o1" }),
    );
  });

  it("gives two freelancers two keys, though neither has an organization", () => {
    expect(workspaceKeyOf({ userId: "u1" })).not.toBe(
      workspaceKeyOf({ userId: "u2" }),
    );
  });
});
