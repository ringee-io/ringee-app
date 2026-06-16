import {
  BadRequestException,
  Body,
  Controller,
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
import { ContextDescriptor, ObjectionInsightService } from "@ringee/services";

interface DescriptorBody {
  contextType?: "campaign" | "organization_outside_campaign" | "personal";
  campaignId?: string;
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

/**
 * Objection Intelligence results: ranked insight rows (with user state) and the
 * per-objection actions. Ownership + context isolation are enforced inside the
 * service via resolveDescriptor; this controller only parses the request.
 */
@Controller("objection-insights")
@UseGuards(OrgAdminGuard)
export class ObjectionInsightController {
  constructor(private readonly insights: ObjectionInsightService) {}

  /** Ranked insights + trend for one context. */
  @Post("results")
  async results(
    @Body() body: DescriptorBody,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.insights.listForContext(ctx, parseDescriptor(body));
  }

  /** Save a user-edited/accepted recommended response (status → saved). */
  @Post(":id/save")
  async save(
    @Param("id") id: string,
    @Body() body: DescriptorBody & { response?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.insights.saveResponse(
      ctx,
      parseDescriptor(body),
      id,
      body.response ?? "",
    );
  }

  /** Dismiss a recommendation (status → dismissed). */
  @Post(":id/dismiss")
  async dismiss(
    @Param("id") id: string,
    @Body() body: DescriptorBody,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.insights.dismiss(ctx, parseDescriptor(body), id);
  }

  /** Create the grouped "review recommended response" pending action. */
  @Post(":id/review")
  async review(
    @Param("id") id: string,
    @Body() body: DescriptorBody,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.insights.createReviewAction(ctx, parseDescriptor(body), id);
  }

  /** Create the "add objection response to script" pending action. */
  @Post(":id/add-to-script")
  async addToScript(
    @Param("id") id: string,
    @Body() body: DescriptorBody,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.insights.addToScript(ctx, parseDescriptor(body), id);
  }
}
