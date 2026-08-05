import { JourneyMetricKey, JourneyMetrics } from "./journey.metrics";

/**
 * Advanced capabilities — the "used it for real" catalogue.
 *
 * The last stage of each ladder asks for *breadth*, not for one specific
 * feature. That is deliberate: a digital call centre has no reason to buy a
 * desk phone, and forcing SIP on them to finish the Journey would teach them
 * nothing and cost us credibility. A workspace picks whichever combination
 * matches how it actually sells.
 *
 * Each capability has its own floor, so "connected an integration" never
 * counts — only "produced this many real results with it".
 */

export const JOURNEY_CAPABILITY_IDS = [
  "campaigns",
  "crm",
  "custom_integration",
  "ai",
  "mcp",
  "calendar",
  "caller_id_rotation",
  "sip",
  "sdk",
  "extension",
  "call_sessions",
  "enrichment",
] as const;

export type JourneyCapabilityId = (typeof JOURNEY_CAPABILITY_IDS)[number];

interface CapabilityRule {
  id: JourneyCapabilityId;
  /** Every entry must clear its threshold for the capability to count. */
  requires: Array<{ metric: JourneyMetricKey; atLeast: number }>;
}

/**
 * PROVISIONAL thresholds. They are conservative first guesses and have not been
 * validated against production history — run `pnpm journey:analyze` before
 * treating any of them as settled.
 */
export const JOURNEY_CAPABILITY_RULES: readonly CapabilityRule[] = [
  {
    id: "campaigns",
    requires: [{ metric: "campaignsWithRealActivity", atLeast: 1 }],
  },
  { id: "crm", requires: [{ metric: "crmSyncedCalls", atLeast: 5 }] },
  {
    id: "custom_integration",
    requires: [{ metric: "customIntegrationDeliveries", atLeast: 5 }],
  },
  {
    id: "ai",
    // A pipeline result with no transcripts behind it is not AI adoption.
    requires: [
      { metric: "aiResultsProduced", atLeast: 1 },
      { metric: "transcriptionsCompleted", atLeast: 5 },
    ],
  },
  { id: "mcp", requires: [{ metric: "mcpCalls", atLeast: 3 }] },
  { id: "calendar", requires: [{ metric: "meetingsSynced", atLeast: 2 }] },
  {
    id: "caller_id_rotation",
    // Rotation being enabled proves nothing; two caller IDs on the wire does.
    requires: [{ metric: "rotationCallerIdsUsed", atLeast: 2 }],
  },
  { id: "sip", requires: [{ metric: "sipDeviceCalls", atLeast: 5 }] },
  { id: "sdk", requires: [{ metric: "sdkCalls", atLeast: 5 }] },
  { id: "extension", requires: [{ metric: "extensionCalls", atLeast: 5 }] },
  {
    id: "call_sessions",
    requires: [{ metric: "callSessionCalls", atLeast: 5 }],
  },
  {
    id: "enrichment",
    requires: [{ metric: "enrichmentImports", atLeast: 10 }],
  },
] as const;

/** The capabilities this workspace has genuinely put to work. */
export function usedCapabilities(
  metrics: JourneyMetrics,
): JourneyCapabilityId[] {
  return JOURNEY_CAPABILITY_RULES.filter((rule) =>
    rule.requires.every((need) => metrics[need.metric] >= need.atLeast),
  ).map((rule) => rule.id);
}

export function countUsedCapabilities(metrics: JourneyMetrics): number {
  return usedCapabilities(metrics).length;
}
