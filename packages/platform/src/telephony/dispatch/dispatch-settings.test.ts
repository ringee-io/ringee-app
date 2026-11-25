import { describe, expect, it } from "vitest";
import {
  DISPATCH_SETTING_KEYS,
  applySettingsOverrides,
  baselineSettings,
  deriveLimits,
  validateSettingsPatch,
  type DispatchEnvironment,
} from "./dispatch-settings";

const env: DispatchEnvironment = {
  mode: "observe",
  ceilingCps: 5,
  safetyMargin: 0.2,
  orgAutomationCps: 2,
  queueEnabled: false,
  orgConcurrency: 25,
  queueMaxPerWorkspace: 1000,
  queueMaxTotal: 5000,
  queueMaxWaitMinutes: 120,
  surchargeBudgetUsd: 0,
};

describe("baseline settings", () => {
  it("start in observe mode with the brief's numbers", () => {
    const settings = baselineSettings(env);
    expect(settings).toMatchObject({
      mode: "observe",
      ceilingCps: 5,
      orgAutomationCps: 2,
      orgConcurrency: 25,
      interactiveOnTimeout: "defer",
      pausedClasses: [],
    });
    expect(settings.queueMaxWaitMsBackground).toBe(120 * 60_000);
    expect(settings.queueMaxWaitMsAutomation).toBe(30 * 60_000);
  });

  it("never waits longer for automation than for background", () => {
    const short = baselineSettings({ ...env, queueMaxWaitMinutes: 10 });
    expect(short.queueMaxWaitMsAutomation).toBeLessThanOrEqual(
      short.queueMaxWaitMsBackground,
    );
  });
});

describe("derived limits", () => {
  it("paces at the ceiling less the margin", () => {
    const limits = deriveLimits(baselineSettings(env));
    expect(limits.effectiveCps).toBe(4);
    expect(limits.jitterToleranceMs).toBe(250);
    expect(limits.warnings).toEqual([]);
  });

  it.each([
    [0.2, 250],
    [0.1, 111],
    [0.5, 1000],
    [0, 0],
  ])("a margin of %s tolerates %i ms of jitter", (margin, tolerance) => {
    const limits = deriveLimits(
      baselineSettings({ ...env, safetyMargin: margin }),
    );
    expect(limits.jitterToleranceMs).toBe(tolerance);
  });

  it("warns when the margin leaves no room for jitter", () => {
    const limits = deriveLimits(baselineSettings({ ...env, safetyMargin: 0 }));
    expect(limits.warnings.join(" ")).toMatch(/jitter/);
  });

  it("warns when the ceiling goes above the free 5 CPS", () => {
    const limits = deriveLimits(baselineSettings({ ...env, ceilingCps: 10 }));
    expect(limits.warnings.join(" ")).toMatch(/surcharge exposure/);
    expect(limits.effectiveCps).toBe(8);
  });

  it("rounds each spacing up so a level never runs faster than its cap", () => {
    const limits = deriveLimits(baselineSettings(env));
    limits.levelCapsCps.forEach((cap, level) => {
      expect(
        1_000_000 / limits.levelIntervalsMicros[level],
      ).toBeLessThanOrEqual(cap);
    });
  });
});

describe("validating an administrator's patch", () => {
  it("accepts well-formed values and reports every bad one", () => {
    const { patch, errors } = validateSettingsPatch({
      mode: "enforce",
      ceilingCps: 6,
      safetyMargin: 2,
      orgAutomationCps: "fast",
      nonsense: true,
    });
    expect(patch).toEqual({ mode: "enforce", ceilingCps: 6 });
    expect(errors).toHaveLength(3);
    expect(errors.join(" ")).toMatch(/nonsense/);
  });

  it("refuses to pause interactive dispatch", () => {
    expect(
      validateSettingsPatch({ pausedClasses: ["background", "interactive"] })
        .errors[0],
    ).toMatch(/never be paused/);
    expect(
      validateSettingsPatch({ pausedClasses: ["background"] }).errors,
    ).toEqual([]);
  });

  it("refuses to demote a source a person is waiting on", () => {
    expect(
      validateSettingsPatch({ classOverrides: { inbound_ring: "background" } })
        .errors[0],
    ).toMatch(/stays interactive/);
    expect(
      validateSettingsPatch({ classOverrides: { agent_api: "automation" } })
        .errors,
    ).toEqual([]);
    expect(
      validateSettingsPatch({ classOverrides: { made_up: "automation" } })
        .errors[0],
    ).toMatch(/unknown source/);
  });

  it("keeps the class shares ordered, with the interactive level whole", () => {
    expect(
      validateSettingsPatch({ classCapFractions: [1, 0.75, 0.8, 0.5] }).errors,
    ).not.toEqual([]);
    expect(
      validateSettingsPatch({ classCapFractions: [0.9, 0.75, 0.6, 0.5] })
        .errors,
    ).not.toEqual([]);
    expect(
      validateSettingsPatch({ classCapFractions: [1, 0.5, 0.5, 0.25] }).errors,
    ).toEqual([]);
    expect(
      validateSettingsPatch({ classCapFractions: [1, 0.5] }).errors,
    ).not.toEqual([]);
  });

  it.each([null, "x", 7, ["a"]])("rejects a non-object patch (%j)", (input) => {
    expect(validateSettingsPatch(input).errors).toEqual([
      "The settings must be an object.",
    ]);
  });

  it("lists every key it can validate", () => {
    expect(DISPATCH_SETTING_KEYS).toContain("ceilingCps");
    expect(DISPATCH_SETTING_KEYS).toContain("pausedClasses");
    expect(DISPATCH_SETTING_KEYS).toContain("queueEnabled");
  });
});

describe("stored overrides", () => {
  it("apply on top of the environment", () => {
    const merged = applySettingsOverrides(baselineSettings(env), {
      mode: "enforce",
      pausedClasses: ["background"],
    });
    expect(merged.mode).toBe("enforce");
    expect(merged.pausedClasses).toEqual(["background"]);
    expect(merged.ceilingCps).toBe(5);
  });

  it("skip a stored value that no longer validates instead of breaking pacing", () => {
    const merged = applySettingsOverrides(baselineSettings(env), {
      mode: "enforce",
      ceilingCps: -4,
      safetyMargin: "huge",
      pausedClasses: ["interactive"],
    });
    expect(merged.mode).toBe("enforce");
    expect(merged.ceilingCps).toBe(5);
    expect(merged.safetyMargin).toBe(0.2);
    expect(merged.pausedClasses).toEqual([]);
  });
});
