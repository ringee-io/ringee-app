import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AiPipelineActivation,
  AiPipelineActivationRepository,
  CampaignRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { PipelineType } from "./ai-pipeline.types";
import {
  PipelineContext,
  contextKey,
  contextOwnerColumns,
  toContextTypeEnum,
} from "./pipeline-context";
import { PipelineRegistry } from "./pipeline.registry";

/** What the UI sends to identify a context within the current workspace. */
export type ContextDescriptor =
  | { type: "campaign"; campaignId: string }
  | { type: "organization_outside_campaign" }
  | { type: "personal" };

export interface ActivationRow {
  contextKey: string;
  contextType: "campaign" | "organization_outside_campaign" | "personal";
  label: string;
  descriptor: ContextDescriptor;
  enabled: boolean;
  newEligibleSinceLastRun: number;
  lastRunAt: Date | null;
  pendingActionCount: number;
  lastConfidence: string | null;
}

@Injectable()
export class PipelineActivationService {
  constructor(
    private readonly activationRepo: AiPipelineActivationRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly registry: PipelineRegistry,
  ) {}

  /**
   * Resolve + verify a UI descriptor into a PipelineContext for the current
   * workspace. Enforces that the campaign belongs to the workspace and that
   * org-context requires an active organization.
   */
  async resolveDescriptor(
    ctx: OwnershipContext,
    descriptor: ContextDescriptor,
  ): Promise<PipelineContext> {
    switch (descriptor.type) {
      case "campaign": {
        const campaign = await this.campaignRepo.findById(
          descriptor.campaignId,
        );
        if (!campaign) throw new NotFoundException("Campaign not found");
        const owned = ctx.organizationId
          ? campaign.organizationId === ctx.organizationId
          : campaign.userId === ctx.userId && !campaign.organizationId;
        if (!owned) throw new ForbiddenException("Access denied");
        return {
          type: "campaign",
          campaignId: campaign.id,
          organizationId: campaign.organizationId,
        };
      }
      case "organization_outside_campaign": {
        if (!ctx.organizationId) {
          throw new ForbiddenException(
            "Organization context requires an active organization",
          );
        }
        return {
          type: "organization_outside_campaign",
          organizationId: ctx.organizationId,
        };
      }
      case "personal":
        return { type: "personal", userId: ctx.userId };
    }
  }

  async setEnabled(
    ctx: OwnershipContext,
    type: PipelineType,
    descriptor: ContextDescriptor,
    enabled: boolean,
  ): Promise<AiPipelineActivation> {
    const def = this.registry.require(type);
    const pipelineContext = await this.resolveDescriptor(ctx, descriptor);
    return this.activationRepo.setEnabled({
      pipelineType: def.pipelineEnum,
      contextType: toContextTypeEnum(pipelineContext),
      contextKey: contextKey(pipelineContext),
      owner: contextOwnerColumns(pipelineContext),
      enabled,
    });
  }

  /**
   * The activation table for a pipeline's detail page: every campaign in the
   * workspace, plus the org-outside-campaign row and the personal row. Results
   * are isolated per context.
   */
  async getActivationSummary(ctx: OwnershipContext, type: PipelineType) {
    const def = this.registry.require(type);
    const owner = {
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
    };

    const campaigns = await this.campaignRepo.listForPipelineOwner(owner);
    const campaignKeys = campaigns.map((c) => `campaign:${c.id}`);
    const orgKey = ctx.organizationId
      ? `org_no_campaign:${ctx.organizationId}`
      : null;
    const personalKey = `personal:${ctx.userId}`;

    const keys = [...campaignKeys, orgKey, personalKey].filter(
      (k): k is string => !!k,
    );
    const activations = await this.activationRepo.findManyByKeys(
      def.pipelineEnum,
      keys,
    );
    const byKey = new Map(activations.map((a) => [a.contextKey, a]));

    const row = (
      key: string,
      contextType: ActivationRow["contextType"],
      label: string,
      descriptor: ContextDescriptor,
    ): ActivationRow => {
      const a = byKey.get(key);
      return {
        contextKey: key,
        contextType,
        label,
        descriptor,
        enabled: a?.enabled ?? false,
        newEligibleSinceLastRun: a?.newEligibleSinceLastRun ?? 0,
        lastRunAt: a?.lastRunAt ?? null,
        pendingActionCount: a?.pendingActionCount ?? 0,
        lastConfidence: a?.lastConfidence ?? null,
      };
    };

    return {
      pipeline: {
        type: def.type,
        name: def.name,
        valueProposition: def.valueProposition,
        detailRoute: def.detailRoute,
        implemented: def.implemented,
      },
      campaigns: campaigns.map((c) =>
        row(`campaign:${c.id}`, "campaign", c.name, {
          type: "campaign",
          campaignId: c.id,
        }),
      ),
      organization: orgKey
        ? row(
            orgKey,
            "organization_outside_campaign",
            "Organization calls outside campaigns",
            { type: "organization_outside_campaign" },
          )
        : null,
      personal: row(personalKey, "personal", "Personal calls", {
        type: "personal",
      }),
    };
  }

  /**
   * Cards overview for /dashboard/ai-pipeline. Every pipeline (including the
   * not-yet-implemented ones) reports its activation state through the same
   * registry, so the coming-soon cards still read a real (empty) state.
   */
  async listPipelinesOverview(ctx: OwnershipContext) {
    const owner = {
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
    };
    const campaigns = await this.campaignRepo.listForPipelineOwner(owner);
    const keys = [
      ...campaigns.map((c) => `campaign:${c.id}`),
      ctx.organizationId ? `org_no_campaign:${ctx.organizationId}` : null,
      `personal:${ctx.userId}`,
    ].filter((k): k is string => !!k);

    return Promise.all(
      this.registry.all().map(async (def) => {
        const activations = await this.activationRepo.findManyByKeys(
          def.pipelineEnum,
          keys,
        );
        return {
          type: def.type,
          name: def.name,
          valueProposition: def.valueProposition,
          detailRoute: def.detailRoute,
          implemented: def.implemented,
          enabledContexts: activations.filter((a) => a.enabled).length,
          totalPendingActions: activations.reduce(
            (sum, a) => sum + a.pendingActionCount,
            0,
          ),
          totalNewEligible: activations.reduce(
            (sum, a) => sum + a.newEligibleSinceLastRun,
            0,
          ),
        };
      }),
    );
  }
}
