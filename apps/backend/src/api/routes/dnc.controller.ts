import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { ComplianceService } from "@ringee/services";

@Controller("dnc")
export class DNCController {
  constructor(private readonly complianceService: ComplianceService) {}

  /**
   * List DNC entries for the current scope.
   * - Org context (user has activeOrgId): returns the organization's DNC list.
   * - Freelancer context: returns the user's personal DNC list.
   */
  @Get()
  async listDNC(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    const ctx = createOwnershipContext(user);
    return this.complianceService.listDNC(ctx, {
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post()
  async addToDNC(
    @Body() body: { phoneNumber: string; reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.phoneNumber) {
      throw new BadRequestException("phoneNumber is required");
    }
    const ctx = createOwnershipContext(user);
    return this.complianceService.addToDNC({
      phoneNumber: body.phoneNumber,
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      reason: body.reason,
      source: "manual",
      addedByUserId: ctx.userId,
    });
  }

  @Post("import")
  async bulkImport(
    @Body() body: { phoneNumbers: string[]; reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!Array.isArray(body.phoneNumbers) || body.phoneNumbers.length === 0) {
      throw new BadRequestException("phoneNumbers must be a non-empty array");
    }
    const ctx = createOwnershipContext(user);
    return this.complianceService.bulkAddToDNC(
      body.phoneNumbers.map((phone) => ({
        phoneNumber: phone,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        reason: body.reason,
        source: "import",
        addedByUserId: ctx.userId,
      })),
    );
  }

  @Get("check/:phoneNumber")
  async checkDNC(
    @Param("phoneNumber") phoneNumber: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const entry = await this.complianceService.findOnDNC(ctx, phoneNumber);
    return {
      phoneNumber,
      isOnDNC: entry !== null,
      reason: entry?.reason ?? null,
      source: entry?.source ?? null,
      addedAt: entry?.createdAt ?? null,
    };
  }

  @Delete(":id")
  async removeFromDNC(@Param("id") id: string) {
    return this.complianceService.deleteDNCById(id);
  }
}
