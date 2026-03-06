import {
  Controller,
  Get,
  Post,
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
} from "@ringee/platform";
import { CampaignService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("campaigns")
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Post()
  async createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.createCampaign(ctx, dto);
  }

  @Get()
  async listCampaigns(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "10"
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.listCampaigns(ctx, {
      search,
      status,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get(":id")
  async getCampaign(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.getCampaignById(ctx, id);
  }

  @Patch(":id/status")
  async updateCampaignStatus(
    @Param("id") id: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.updateStatus(ctx, id, dto);
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
    })
  )
  async importLeadsFromCsv(
    @Param("id") campaignId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @CurrentUser() user: CurrentUserData
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
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
    const ctx = createOwnershipContext(user);
    return this.campaignService.addLeadsManually(ctx, campaignId, dto.leads);
  }

  @Get(":id/leads")
  async getCampaignLeads(
    @Param("id") campaignId: string,
    @CurrentUser() user: CurrentUserData,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: "pending" | "called" | "dead"
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
}
