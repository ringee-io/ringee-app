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
