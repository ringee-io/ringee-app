import type {
  Offer,
  OfferParticipation,
  OfferParticipationStatus,
  OfferPlacement,
} from "@ringee/database";

// ── Eligibility rules ─────────────────────────────────────────────
//
// The rule tree is data. Nothing in this file (or anywhere else) knows what a
// particular offer is for — an offer's conditions arrive as JSON on
// `Offer.eligibilityConfig` and are evaluated against a normalized context.

export type RuleOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "exists";

export interface RuleCondition {
  /** Dot path into the eligibility context, e.g. "organization.totalCalls". */
  field: string;
  operator: RuleOperator;
  value?: unknown;
}

export interface RuleGroup {
  /** Every child must pass. */
  all?: RuleNode[];
  /** At least one child must pass. */
  any?: RuleNode[];
  /** The child must NOT pass. */
  not?: RuleNode;
}

export type RuleNode = RuleCondition | RuleGroup;

/**
 * `eligibilityConfig` accepts two shapes:
 *
 *   1. A bare rule group, evaluated against the whole context (which carries
 *      both `user.*` and `organization.*`).
 *   2. Per-workspace variants. For organizations, `workspace` decides whether
 *      the offer appears at all and `member` decides whether an individual
 *      member may claim — the two-level check the review offer needs.
 */
export interface OfferEligibilityConfig {
  personal?: RuleGroup;
  organization?: {
    workspace?: RuleGroup;
    member?: RuleGroup;
  };
  /** Fallback when the workspace-specific variant is absent. */
  default?: RuleGroup;
}

// ── Eligibility context ───────────────────────────────────────────

export type WorkspaceKind = "personal" | "organization";

export interface OfferContextUser {
  id: string;
  /** Calls made in the CURRENT workspace. */
  totalCalls: number;
  createdAt: Date;
  daysSinceSignup: number;
  /** Clerk-level role inside the active organization, null for personal. */
  role: string | null;
}

export interface OfferContextOrganization {
  id: string;
  totalCalls: number;
  memberCount: number;
  createdAt: Date;
  daysSinceCreated: number;
}

export interface OfferContextMember {
  userId: string;
  role: string;
  totalCalls: number;
}

export interface OfferContextWorkspace {
  type: WorkspaceKind;
  balance: number;
}

/**
 * Built ONCE per request and shared by every offer evaluated in it. Offers may
 * only read from here; they never issue their own queries.
 */
export interface OfferEligibilityContext {
  user: OfferContextUser;
  organization: OfferContextOrganization | null;
  workspace: OfferContextWorkspace;
  /** Every member of the active organization; empty for personal workspaces. */
  members: OfferContextMember[];
  now: Date;
}

// ── Action ────────────────────────────────────────────────────────

export type OfferActionType =
  | "EXTERNAL_URL_SUBMISSION"
  | "INTERNAL_ACTION"
  | "CTA_ONLY";

export interface OfferActionConfig {
  type: OfferActionType;
  /** Key the submitted value lands on inside `submissionData`. */
  field?: string;
  /** EXTERNAL_URL_SUBMISSION: hostnames the URL must belong to. */
  allowedDomains?: string[];
  /** Reject a value another participant already submitted for this offer. */
  unique?: boolean;
  /** Copy for the generic submission form, rendered as-is by the frontend. */
  fieldLabel?: string;
  fieldPlaceholder?: string;
  helpText?: string;
  submitLabel?: string;
  /**
   * Screenshot showing the user where to find the value we are asking for —
   * "copy the link from here". A path under the frontend's `public/`, or an
   * absolute URL. Keeps "how do I get a Trustpilot review link?" a data
   * question: the dialog just renders whatever image the offer names.
   */
  helpImage?: string;
  /** Alt text for `helpImage`. Falls back to `helpText` when omitted. */
  helpImageAlt?: string;
  /**
   * Where the user goes to actually perform the action — the review page, the
   * survey, the feature to try. For INTERNAL_ACTION / CTA_ONLY it is where the
   * CTA sends them; for a submission it is the page they visit BEFORE pasting
   * the result back.
   */
  href?: string;
  /** Label for that link, e.g. "Write your review". */
  hrefLabel?: string;
}

// ── Reward ────────────────────────────────────────────────────────

export type OfferRewardType = "CREDIT" | "NONE";

export type OfferRewardDestination =
  | "PERSONAL_WORKSPACE"
  | "ORGANIZATION"
  | "ACTIVE_WORKSPACE";

export interface OfferRewardRule {
  type: OfferRewardType;
  amount?: number;
  currency?: string;
  destination?: OfferRewardDestination;
}

/** Same variant-or-flat convention as `eligibilityConfig`. */
export interface OfferRewardConfig extends Partial<OfferRewardRule> {
  personal?: OfferRewardRule;
  organization?: OfferRewardRule;
}

// ── Display ───────────────────────────────────────────────────────

export interface OfferCopy {
  title?: string;
  description?: string;
  ctaLabel?: string;
  dismissLabel?: string;
}

export interface OfferDisplayConfig extends OfferCopy {
  personal?: OfferCopy;
  organization?: OfferCopy;
  /** Visual hint for the placement surface, e.g. "default" | "success". */
  variant?: string;
  icon?: string;
}

// ── Frequency ─────────────────────────────────────────────────────

export type OfferFrequencyMode =
  | "ONCE"
  | "ONCE_PER_USER"
  | "ONCE_PER_ORGANIZATION"
  | "RECURRING";

export interface OfferFrequencyConfig {
  mode?: OfferFrequencyMode;
  dismissible?: boolean;
  /** How long a "not now" hides the offer. Omitted = hidden forever. */
  showAgainAfterHours?: number;
}

// ── Presented offer (the API response shape) ──────────────────────

export interface PresentedReward {
  type: OfferRewardType;
  /** What THIS user gets for their own claim. */
  amount: number;
  /**
   * Ceiling still on the table. For organizations: per-member amount times the
   * members who are eligible AND have not claimed yet.
   */
  potentialAmount: number;
  currency: string;
  destination: OfferRewardDestination;
}

export interface PresentedOffer {
  id: string;
  slug: string;
  placement: OfferPlacement;
  priority: number;
  title: string;
  description: string | null;
  cta: { label: string };
  dismissible: boolean;
  reward: PresentedReward;
  /** Organization offers only: how many members currently qualify. */
  eligibleParticipants: number;
  /** Of those, how many can still claim. */
  remainingParticipants: number;
  action: {
    type: OfferActionType;
    field: string | null;
    fieldLabel: string | null;
    fieldPlaceholder: string | null;
    helpText: string | null;
    helpImage: string | null;
    helpImageAlt: string | null;
    submitLabel: string | null;
    href: string | null;
    hrefLabel: string | null;
    allowedDomains: string[];
  };
  requiresApproval: boolean;
  participation: {
    id: string;
    status: OfferParticipationStatus;
    submittedAt: string | null;
    rewardedAt: string | null;
    rejectionReason: string | null;
  } | null;
  endsAt: string | null;
}

/** Why an offer was withheld — surfaced in the backoffice, never to the user. */
export interface OfferEvaluation {
  offer: Offer;
  eligible: boolean;
  reason?: string;
  participations: OfferParticipation[];
}

/**
 * Reads a JSON config column. Prisma types these as `JsonValue`, but offers
 * always author them as objects — anything else (null, a stray array, a
 * scalar) degrades to `{}` so a malformed row renders defaults instead of
 * throwing.
 */
export function readConfig<T extends object>(value: unknown): T {
  return (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as T;
}
