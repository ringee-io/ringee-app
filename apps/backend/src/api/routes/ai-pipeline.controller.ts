import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  OrgAdminGuard,
  createOwnershipContext,
} from "@ringee/platform";
import {
  ContextDescriptor,
  PendingActionService,
  PipelineActivationService,
  PipelineRunService,
  PipelineType,
  contextKey,
} from "@ringee/services";
import { PendingActionFilterKey, PendingActionStatus } from "@ringee/database";

const VALID_PIPELINE_TYPES: PipelineType[] = [
  "follow_up_recommendations",
  "script_optimization",
  "objection_intelligence",
];

interface DescriptorBody {
  contextType?: "campaign" | "organization_outside_campaign" | "personal";
  campaignId?: string;
}

function parseType(type: string): PipelineType {
  if (!VALID_PIPELINE_TYPES.includes(type as PipelineType)) {
    throw new NotFoundException(`Unknown pipeline: ${type}`);
  }
  return type as PipelineType;
}

function parseDescriptor(body: DescriptorBody | undefined): ContextDescriptor {
  const ct = body?.contextType;
  if (ct === "campaign") {
    if (!body?.campaignId) {
      throw new BadRequestException(
        "campaignId is required for campaign context",
      );
    }
    return { type: "campaign", campaignId: body.campaignId };
  }
  if (ct === "organization_outside_campaign") {
    return { type: "organization_outside_campaign" };
  }
  if (ct === "personal") {
    return { type: "personal" };
  }
  throw new BadRequestException("Invalid contextType");
}

@Controller("ai-pipeline")
@UseGuards(OrgAdminGuard)
export class AiPipelineController {
  constructor(
    private readonly activationService: PipelineActivationService,
    private readonly runService: PipelineRunService,
    private readonly pendingActions: PendingActionService,
  ) {}

  /** Cards overview — every pipeline reports its (possibly empty) state. */
  @Get()
  async overview(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.activationService.listPipelinesOverview(ctx);
  }

  /** Activation table for a pipeline's detail page (campaigns + org + personal). */
  @Get(":type")
  async activationSummary(
    @Param("type") type: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.activationService.getActivationSummary(ctx, parseType(type));
  }

  /** Enable/disable a pipeline for one context (never affects other contexts). */
  @Post(":type/activation")
  async setActivation(
    @Param("type") type: string,
    @Body() body: DescriptorBody & { enabled?: boolean },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    if (typeof body?.enabled !== "boolean") {
      throw new BadRequestException("enabled (boolean) is required");
    }
    return this.activationService.setEnabled(
      ctx,
      parseType(type),
      parseDescriptor(body),
      body.enabled,
    );
  }

  /** Pre-flight info before a manual run (eligible, confidence, low-data, running). */
  @Post(":type/run/preview")
  async runPreview(
    @Param("type") type: string,
    @Body() body: DescriptorBody,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.runService.getRunPreview(
      ctx,
      parseType(type),
      parseDescriptor(body),
    );
  }

  /** Start a manual run; refuses if a run is already in progress for the context. */
  @Post(":type/run")
  async run(
    @Param("type") type: string,
    @Body() body: DescriptorBody,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.runService.startManualRun(
      ctx,
      parseType(type),
      parseDescriptor(body),
    );
  }

  /** Results scoped to one context: pending actions for that contextKey. */
  @Post(":type/results")
  async results(
    @Param("type") type: string,
    @Body()
    body: DescriptorBody & {
      filter?: PendingActionFilterKey;
      status?: PendingActionStatus;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const pipelineType = parseType(type);
    // Resolve + verify the descriptor → contextKey (ownership enforced here).
    const context = await this.activationService.resolveDescriptor(
      ctx,
      parseDescriptor(body),
    );
    const key = contextKey(context);
    const actions = await this.pendingActions.list(ctx, {
      contextKey: key,
      filter: body.filter,
      status: body.status,
    });
    return { pipelineType, contextKey: key, ...actions };
  }
}
