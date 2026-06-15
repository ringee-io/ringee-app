import { AiPipelineContextType } from "@ringee/database";

/**
 * The three mutually-exclusive contexts a pipeline result/counter can belong
 * to. Context isolation is absolute: a call belongs to exactly one of these and
 * its results never mix with another's.
 *
 * Note: `Call` has no campaignId column in this schema — the campaign is
 * resolved from CallAttempt / CallSession by PipelineContextResolver and passed
 * in as `campaignId`. A personal user can own a campaign, so a campaign
 * context's organizationId may be null.
 */
export type PipelineContextType =
  | "campaign"
  | "organization_outside_campaign"
  | "personal";

export type PipelineContext =
  | { type: "campaign"; campaignId: string; organizationId: string | null }
  | { type: "organization_outside_campaign"; organizationId: string }
  | { type: "personal"; userId: string };

/** A call with its campaign already hydrated (see PipelineContextResolver). */
export interface CallLike {
  userId: string | null;
  organizationId: string | null;
  /** Hydrated from CallAttempt/CallSession — NOT a column on Call. */
  campaignId: string | null;
  /** The campaign's organization, when the call belongs to a campaign. */
  campaignOrganizationId?: string | null;
}

/**
 * Stable key used for counters, run records, activation rows and indexing.
 * Exactly one key per context; this is the only place keys are minted.
 */
export function contextKey(ctx: PipelineContext): string {
  switch (ctx.type) {
    case "campaign":
      return `campaign:${ctx.campaignId}`;
    case "organization_outside_campaign":
      return `org_no_campaign:${ctx.organizationId}`;
    case "personal":
      return `personal:${ctx.userId}`;
  }
}

/**
 * Single source of truth for resolving a call's context. Precedence is strict:
 * campaign > organization_outside_campaign > personal. There is exactly one
 * resolveCallContext — no ad-hoc context logic anywhere else.
 */
export function resolveCallContext(call: CallLike): PipelineContext {
  if (call.campaignId) {
    return {
      type: "campaign",
      campaignId: call.campaignId,
      organizationId:
        call.campaignOrganizationId ?? call.organizationId ?? null,
    };
  }
  if (call.organizationId) {
    return {
      type: "organization_outside_campaign",
      organizationId: call.organizationId,
    };
  }
  if (!call.userId) {
    // Defensive: a finalized call always has an owner. Fall back to a stable
    // sentinel rather than throwing inside the fan-out.
    throw new Error("Cannot resolve pipeline context: call has no owner");
  }
  return { type: "personal", userId: call.userId };
}

/** Map a PipelineContext to the Prisma enum stored on rows. */
export function toContextTypeEnum(ctx: PipelineContext): AiPipelineContextType {
  switch (ctx.type) {
    case "campaign":
      return AiPipelineContextType.campaign;
    case "organization_outside_campaign":
      return AiPipelineContextType.organization_outside_campaign;
    case "personal":
      return AiPipelineContextType.personal;
  }
}

/** Owner columns to persist alongside the contextKey for scoping/listing. */
export function contextOwnerColumns(ctx: PipelineContext): {
  campaignId: string | null;
  organizationId: string | null;
  userId: string | null;
} {
  switch (ctx.type) {
    case "campaign":
      return {
        campaignId: ctx.campaignId,
        organizationId: ctx.organizationId,
        userId: null,
      };
    case "organization_outside_campaign":
      return {
        campaignId: null,
        organizationId: ctx.organizationId,
        userId: null,
      };
    case "personal":
      return { campaignId: null, organizationId: null, userId: ctx.userId };
  }
}
