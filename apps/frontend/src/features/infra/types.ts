export type InfrastructureResourceType =
  | 'TEAM_MEMBER'
  | 'PHONE_NUMBER'
  | 'SIP_DEVICE'
  | 'CAMPAIGN'
  | 'NUMBER_POOL'
  | 'ROUTING_RULE'
  | 'INTEGRATION';

export type InfrastructureConnectionType =
  | 'ASSIGNED_TO'
  | 'USES'
  | 'ROUTES_TO'
  | 'BELONGS_TO'
  | 'OWNS'
  | 'MEMBER_OF'
  | 'TRIGGERS';

export type InfrastructureConnectionStatus =
  | 'ACTIVE'
  | 'DRAFT'
  | 'BROKEN'
  | 'VISUAL_ONLY';

export interface InfraNode {
  id: string;
  type: InfrastructureResourceType;
  referenceId: string | null;
  name: string;
  status: string;
  position: { x: number; y: number };
  metadata: Record<string, unknown>;
}

export interface InfraEdge {
  id: string;
  source: string;
  target: string;
  type: InfrastructureConnectionType;
  status: InfrastructureConnectionStatus;
  applied: boolean;
}

export interface InfraOverview {
  nodes: InfraNode[];
  edges: InfraEdge[];
  workspace: {
    scope: 'organization' | 'personal';
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

export interface InfraEvent {
  id: string;
  type: string;
  message: string;
  actorUserId: string | null;
  createdAt: string;
}

export interface CreateConnectionResult {
  applied: boolean;
  status: InfrastructureConnectionStatus;
  message: string;
}

// ── Native build flows ──────────────────────────────────────────────────────

export interface InfraNumberSearchItem {
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
  documentsRequired: boolean;
}

export interface SipCredentials {
  sipServer: string;
  outboundProxy: string;
  port: number;
  transport: string;
  username: string;
  authId: string;
  password: string;
  callerId: string | null;
  inboundNumber: string | null;
  outboundEnabled: boolean;
  inboundMode: string;
}

export interface InfraSipCreateResult {
  resourceId: string;
  credentials: SipCredentials;
}

export interface InfraCreateResult {
  resourceId: string;
}

export interface InfraCheckoutResult {
  url: string;
}

export interface InfraCompletePhoneResult {
  ready: boolean;
  resourceId?: string;
  status?: string;
}

export interface InfraNumberDocuments {
  requirementsStatus: string;
  requirementsMet: boolean;
  requirements: {
    id: string;
    name: string;
    description?: string;
    status?: string | null;
    reason?: string | null;
  }[];
}

/** Property-level inspector edits (relationship edges go through assign/unassign). */
export interface InfraConfigPatch {
  name?: string;
  campaignSettings?: Record<string, unknown>;
  transition?: 'active' | 'paused' | 'completed';
  enabled?: boolean;
}
