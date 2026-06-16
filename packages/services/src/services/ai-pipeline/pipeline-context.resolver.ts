import { Injectable } from "@nestjs/common";
import { PrismaService } from "@ringee/database";
import { PipelineContext, resolveCallContext } from "./pipeline-context";

export interface ResolvableCall {
  id: string;
  userId: string | null;
  organizationId: string | null;
}

/**
 * `Call` has no campaignId column. A call belongs to a campaign through either
 * a CallAttempt (the dialer) or a CallSessionItem whose session has a
 * campaignId (magic-link sessions attached to a campaign). This resolver
 * hydrates that link, then defers to the single pure resolveCallContext.
 */
@Injectable()
export class PipelineContextResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForCall(call: ResolvableCall): Promise<PipelineContext> {
    const campaign = await this.resolveCampaign(call.id);
    return resolveCallContext({
      userId: call.userId,
      organizationId: call.organizationId,
      campaignId: campaign.campaignId,
      campaignOrganizationId: campaign.campaignOrganizationId,
    });
  }

  private async resolveCampaign(callId: string): Promise<{
    campaignId: string | null;
    campaignOrganizationId: string | null;
  }> {
    // 1) Dialer campaign via the most recent CallAttempt for this call.
    const attempt = await this.prisma.callAttempt.findFirst({
      where: { callId },
      orderBy: { createdAt: "desc" },
      select: { campaign: { select: { id: true, organizationId: true } } },
    });
    if (attempt?.campaign) {
      return {
        campaignId: attempt.campaign.id,
        campaignOrganizationId: attempt.campaign.organizationId,
      };
    }

    // 2) Magic-link session campaign via the CallSessionItem for this call.
    const item = await this.prisma.callSessionItem.findFirst({
      where: { callId },
      orderBy: { createdAt: "desc" },
      select: {
        callSession: {
          select: {
            campaignId: true,
            campaign: { select: { organizationId: true } },
          },
        },
      },
    });
    if (item?.callSession?.campaignId) {
      return {
        campaignId: item.callSession.campaignId,
        campaignOrganizationId:
          item.callSession.campaign?.organizationId ?? null,
      };
    }

    return { campaignId: null, campaignOrganizationId: null };
  }
}
