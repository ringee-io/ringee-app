import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { ComplianceService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("dnc")
export class DNCController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get()
  async listDNC(
    @CurrentUser() user: CurrentUserData,
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.complianceService.listDNC(ctx.organizationId!, {
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post()
  async addToDNC(
    @Body() body: { phoneNumber: string; reason?: string },
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.complianceService.addToDNC({
      phoneNumber: body.phoneNumber,
      organizationId: ctx.organizationId!,
      reason: body.reason,
      source: "manual",
      addedByUserId: ctx.userId,
    });
  }

  @Post("import")
  async bulkImport(
    @Body() body: { phoneNumbers: string[]; reason?: string },
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.complianceService.bulkAddToDNC(
      body.phoneNumbers.map((phone) => ({
        phoneNumber: phone,
        organizationId: ctx.organizationId!,
        reason: body.reason,
        source: "import",
        addedByUserId: ctx.userId,
      }))
    );
  }

  @Get("check/:phoneNumber")
  async checkDNC(
    @Param("phoneNumber") phoneNumber: string,
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    const isOnDNC = await this.complianceService.isOnDNC(
      ctx.organizationId!,
      phoneNumber
    );
    return { phoneNumber, isOnDNC };
  }

  @Delete(":id")
  async removeFromDNC(@Param("id") id: string) {
    return this.complianceService.checkDNCById(id);
  }
}
