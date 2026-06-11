import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { CampaignRepository, CampaignMemberRepository } from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

@Injectable()
export class CampaignMemberService {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly memberRepo: CampaignMemberRepository,
  ) {}

  private async getCampaignWithAuth(ctx: OwnershipContext, campaignId: string) {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }
    return campaign;
  }

  async listMembers(ctx: OwnershipContext, campaignId: string) {
    await this.getCampaignWithAuth(ctx, campaignId);
    return this.memberRepo.findByCampaign(campaignId);
  }

  async addMember(
    ctx: OwnershipContext,
    campaignId: string,
    userId: string,
    role = "agent",
  ) {
    const campaign = await this.getCampaignWithAuth(ctx, campaignId);
    if (campaign.status === "completed") {
      throw new BadRequestException(
        "Cannot add members to a completed campaign",
      );
    }
    return this.memberRepo.addMember(campaignId, userId, role);
  }

  async removeMember(
    ctx: OwnershipContext,
    campaignId: string,
    userId: string,
  ) {
    const campaign = await this.getCampaignWithAuth(ctx, campaignId);
    if (campaign.status === "completed") {
      throw new BadRequestException(
        "Cannot remove members from a completed campaign",
      );
    }
    return this.memberRepo.removeMember(campaignId, userId);
  }
}
