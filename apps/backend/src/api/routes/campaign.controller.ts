import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Patch,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CreateCampaignDto,
  UpdateCampaignStatusDto,
  ImportLeadsManualDto,
  CurrentUser,
  createOwnershipContext,
  CSV_IMPORT_CONFIG,
  OrgAdminOnly,
  AllowOrgMember,
} from "@ringee/platform";
import {
  CampaignService,
  CampaignConfigService,
  DispositionService,
  RetryEngine,
  CampaignMemberService,
} from "@ringee/services";
import { DispositionCategory } from "@ringee/database";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

// Members can view their assigned campaigns (GET endpoints are @AllowOrgMember);
// every mutation is admin-only via the controller-level guard.
@Controller("campaigns")
@OrgAdminOnly()
export class CampaignController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly campaignConfig: CampaignConfigService,
    private readonly dispositionService: DispositionService,
    private readonly retryEngine: RetryEngine,
    private readonly memberService: CampaignMemberService,
  ) {}

  @Post()
  async createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.createCampaign(ctx, dto);
  }

  @Get()
  @AllowOrgMember()
  async listCampaigns(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "10",
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    const isAdmin = user.activeOrgRole === "org:admin";
    return this.campaignService.listCampaigns(ctx, {
      search,
      status,
      page: Number(page),
      limit: Number(limit),
      // Non-admins only see campaigns they're a member of.
      memberUserId: isAdmin ? undefined : user.id,
    });
  }

  @Get(":id")
  @AllowOrgMember()
  async getCampaign(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    const isAdmin = user.activeOrgRole === "org:admin";
    return this.campaignService.getCampaignById(ctx, id, {
      // Non-admins may only open campaigns they're assigned to.
      requireMembershipForUserId: isAdmin ? undefined : user.id,
    });
  }

  @Patch(":id")
  async updateCampaign(
    @Param("id") id: string,
    @Body() dto: any,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.updateSettings(ctx, id, dto);
  }

  @Patch(":id/status")
  async updateCampaignStatus(
    @Param("id") id: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.transitionStatus(ctx, id, dto.status);
  }

  @Delete(":id")
  async deleteCampaign(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.deleteCampaign(ctx, id);
  }

  // ── Disposition endpoints ──

  @Get(":id/dispositions")
  @AllowOrgMember()
  async listDispositions(
    @Param("id") campaignId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.dispositionService.listByCampaign(campaignId);
  }

  @Post(":id/dispositions")
  async createDisposition(
    @Param("id") campaignId: string,
    @Body()
    body: {
      code: string;
      label: string;
      category: DispositionCategory;
      color?: string;
      sortOrder?: number;
      triggersRetry?: boolean;
      triggersCompletion?: boolean;
      triggersDnc?: boolean;
      triggersCallback?: boolean;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.dispositionService.create(campaignId, body);
  }

  @Patch(":id/dispositions/:dispositionId")
  async updateDisposition(
    @Param("dispositionId") dispositionId: string,
    @Body() body: any,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.dispositionService.update(dispositionId, body);
  }

  @Delete(":id/dispositions/:dispositionId")
  async deleteDisposition(
    @Param("dispositionId") dispositionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.dispositionService.deactivate(dispositionId);
  }

  // ── Retry rule endpoints ──

  @Get(":id/retry-rules")
  @AllowOrgMember()
  async listRetryRules(
    @Param("id") campaignId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.retryEngine.listRules(campaignId);
  }

  @Post(":id/retry-rules")
  async upsertRetryRule(
    @Param("id") campaignId: string,
    @Body()
    body: {
      dispositionCategory: DispositionCategory;
      maxAttempts: number;
      delayMinutes: number;
      delayMultiplier?: number;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.retryEngine.upsertRule({ campaignId, ...body });
  }

  @Delete(":id/retry-rules/:ruleId")
  async deleteRetryRule(
    @Param("ruleId") ruleId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    return this.retryEngine.deleteRule(ruleId);
  }

  // ── Member management endpoints ──

  @Get(":id/members")
  @AllowOrgMember()
  async listMembers(
    @Param("id") campaignId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.memberService.listMembers(ctx, campaignId);
  }

  @Post(":id/members")
  async addMember(
    @Param("id") campaignId: string,
    @Body() body: { userId: string; role?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.memberService.addMember(
      ctx,
      campaignId,
      body.userId,
      body.role,
    );
  }

  @Delete(":id/members/:userId")
  async removeMember(
    @Param("id") campaignId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.memberService.removeMember(ctx, campaignId, userId);
  }

  // ── List management endpoints ──

  @Post(":id/lists")
  async createList(
    @Param("id") campaignId: string,
    @Body() body: { name: string; description?: string; source?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.createList(ctx, campaignId, body);
  }

  @Get(":id/lists")
  @AllowOrgMember()
  async listLists(
    @Param("id") campaignId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.listLists(ctx, campaignId);
  }

  @Delete(":id/lists/:listId")
  async deleteList(
    @Param("id") campaignId: string,
    @Param("listId") listId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignConfig.deleteList(ctx, campaignId, listId);
  }

  @Post(":id/leads/csv")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: CSV_IMPORT_CONFIG.MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith(".csv")) {
          cb(new BadRequestException("Only CSV files are allowed"), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async importLeadsFromCsv(
    @Param("id") campaignId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    const ctx = createOwnershipContext(user);
    const csvContent = file.buffer.toString("utf-8");
    return this.campaignService.importLeadsFromCsv(ctx, campaignId, csvContent);
  }

  @Post(":id/leads/manual")
  async addLeadsManually(
    @Param("id") campaignId: string,
    @Body() dto: ImportLeadsManualDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.addLeadsManually(ctx, campaignId, dto.leads);
  }

  @Get(":id/leads")
  @AllowOrgMember()
  async getCampaignLeads(
    @Param("id") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: string,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.getLeads(ctx, campaignId, {
      page: Number(page),
      limit: Number(limit),
      status,
    });
  }

  @Delete(":id/leads/:leadId")
  async deleteCampaignLead(
    @Param("id") campaignId: string,
    @Param("leadId") leadId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.deleteLead(ctx, campaignId, leadId);
  }
}
