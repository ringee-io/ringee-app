import {
  InfrastructureResourceType,
  InfrastructureConnectionType,
  InfrastructureConnectionStatus,
} from "@ringee/database";
import type { SipDeviceCredentials } from "../sip-device";

export interface InfraNodeDto {
  /** InfrastructureResource id (the canvas node id). */
  id: string;
  type: InfrastructureResourceType;
  /** Id of the real entity this node mirrors, or null for drafts. */
  referenceId: string | null;
  name: string;
  status: string;
  position: { x: number; y: number };
  metadata: Record<string, unknown>;
}

export interface InfraEdgeDto {
  /**
   * Either `derived:<sourceId>:<targetId>:<TYPE>` for edges computed from a real
   * relationship, or an InfrastructureConnection id for persisted draft edges.
   */
  id: string;
  source: string;
  target: string;
  type: InfrastructureConnectionType;
  status: InfrastructureConnectionStatus;
  /** True when the edge backs a real, applied relationship. */
  applied: boolean;
}

export interface InfraOverviewDto {
  nodes: InfraNodeDto[];
  edges: InfraEdgeDto[];
  workspace: {
    scope: "organization" | "personal";
    organizationId: string | null;
  };
}

export interface InfraLinkableItem {
  type: InfrastructureResourceType;
  referenceId: string;
  name: string;
  status: string;
  subtitle: string;
}

export interface InfraEventDto {
  id: string;
  type: string;
  message: string;
  actorUserId: string | null;
  createdAt: Date;
}

export interface CreateConnectionResult {
  applied: boolean;
  status: InfrastructureConnectionStatus;
  message: string;
}

// ── Native resource creation (Railway-style build flows) ────────────────────

export interface InfraNumberSearchItem {
  /** E.164 number — also the id passed to checkout/provisioning. */
  phoneNumber: string;
  countryCode: string;
  numberType: string | null;
  locality: string | null;
  region: string | null;
  monthlyCost: number;
  upfrontCost: number;
  currency: string;
  capabilities: { voice: boolean; sms: boolean };
}

export interface InfraNumberSearchResult {
  numbers: InfraNumberSearchItem[];
  /** True when this country/type needs regulatory documents before activation. */
  documentsRequired: boolean;
}

export interface InfraCheckoutResult {
  url: string;
}

export interface InfraCompletePhoneResult {
  /** True once the paid number exists in the workspace and a node was placed. */
  ready: boolean;
  resourceId?: string;
  status?: string;
}

export interface InfraCreateResult {
  resourceId: string;
}

export interface InfraSipCreateResult {
  resourceId: string;
  /** One-time credentials — surfaced only here and on explicit regeneration. */
  credentials: SipDeviceCredentials;
}

/** Optional canvas drop position passed by the creation/link flows. */
export interface InfraPosition {
  x: number;
  y: number;
}

export interface InfraSipCreateInput {
  label: string;
  deviceType?: string | null;
  assignedUserId?: string | null;
  numberId?: string | null;
  allowInbound?: boolean;
  position?: InfraPosition;
}

export interface InfraCampaignCreateInput {
  name: string;
  description?: string;
  dialerMode?: string;
  agentUserIds?: string[];
  numberPurchasedId?: string;
  position?: InfraPosition;
}

/** Property-level edits applied from an inspector tab (not relationship edges). */
export interface InfraConfigPatch {
  /** Canvas display label (renames the node only). */
  name?: string;
  /** CAMPAIGN: pass-through to CampaignConfigService.updateSettings. */
  campaignSettings?: Record<string, unknown>;
  /** CAMPAIGN: status transition ("active" | "paused" | "completed"). */
  transition?: "active" | "paused" | "completed";
  /** SIP_DEVICE: enable/disable. */
  enabled?: boolean;
}

export interface InfraConfigResult {
  ok: true;
  /** Present only when SIP credentials were regenerated. */
  credentials?: SipDeviceCredentials;
}

// ── Usage view ──────────────────────────────────────────────────────────────

/** Filters accepted by the Usage view (all optional; range defaults to 30d). */
export interface InfraUsageFilters {
  start?: Date;
  end?: Date;
  campaignId?: string | null;
  /** NumberPurchased id — resolved to its E.164 for call attribution. */
  numberId?: string | null;
  sipDeviceId?: string | null;
  /** User id — only honoured for org admins. */
  memberId?: string | null;
}

/** A "top resource" reference for the performance highlights. */
export interface InfraUsageRef {
  id: string;
  name: string;
  /** The metric that ranked it (calls, unless noted by the consumer). */
  value: number;
}

export interface InfraUsageResourceRow {
  id: string;
  name: string;
  calls: number;
  minutes: number;
  cost: number;
}

export interface InfraUsageSeriesPoint {
  /** ISO day, YYYY-MM-DD. */
  date: string;
  calls: number;
  minutes: number;
  spend: number;
}

export interface InfraUsageResult {
  scope: "organization" | "personal";
  currency: string;
  range: { start: string; end: string };
  overview: {
    callsToday: number;
    callsThisWeek: number;
    minutesThisMonth: number;
    monthlyCost: number;
    activeCampaigns: number;
    activeNumbers: number;
    sipDevices: number;
    activeAgents: number;
  };
  performance: {
    totalCalls: number;
    callsConnected: number;
    /** 0–100. */
    answerRate: number;
    avgDurationSec: number;
    topCampaign: InfraUsageRef | null;
    topNumber: InfraUsageRef | null;
    topAgent: InfraUsageRef | null;
    topDevice: InfraUsageRef | null;
  };
  cost: {
    spendByNumber: InfraUsageResourceRow[];
    spendByCampaign: InfraUsageResourceRow[];
    series: InfraUsageSeriesPoint[];
  };
  byResource: {
    byCampaign: InfraUsageResourceRow[];
    byNumber: InfraUsageResourceRow[];
    byDevice: InfraUsageResourceRow[];
    byMember: InfraUsageResourceRow[];
  };
}

// ── Journey (internal: Ryan Buckets / maturity segmentation) ──────────────────
// User-facing name is "Journey". These are the *raw signals* that aren't already
// derivable on the client from the overview nodes/edges: a stable 30-day call
// volume plus the recording / transcription / AI switches. The frontend combines
// them with the resource inventory it already has to classify a maturity stage.

export interface InfraJourneySignalsDto {
  scope: "organization" | "personal";
  /** Calls placed in the last 30 days (fixed window, filter-independent). */
  callsLast30d: number;
  /** Talk minutes across those calls (rounded). */
  minutesLast30d: number;
  /** Connected calls in the window (for the answer-rate reason). */
  connectedCallsLast30d: number;
  /** 0–100, over the 30-day window. */
  answerRate: number;
  /** "Record all calls" is on for this workspace. */
  recordingEnabled: boolean;
  /** Realtime or recording transcription is on for this workspace. */
  transcriptionEnabled: boolean;
  /** Transcripts actually produced in the last 30 days (proof of use). */
  transcriptionsLast30d: number;
  /** At least one AI pipeline is enabled for this workspace. */
  aiEnabled: boolean;
}
