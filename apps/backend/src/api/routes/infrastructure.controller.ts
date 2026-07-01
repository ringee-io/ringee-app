import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from "@nestjs/common";
import {
  CurrentUser,
  createOwnershipContext,
  OrgAdminOnly,
  AllowOrgMember,
  UpdatePositionDto,
  RenameResourceDto,
  CreateConnectionDto,
  LinkResourceDto,
  AddTeamMembersDto,
  SearchNumbersDto,
  CreatePhoneCheckoutInfraDto,
  CompletePhoneCheckoutDto,
  CreateSipDeviceInfraDto,
  CreateCampaignInfraDto,
  UpdateConfigurationDto,
  AssignResourceDto,
} from "@ringee/platform";
import { InfrastructureService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

/**
 * Ringee Infra — visual architecture console. Reads are open to org members;
 * every mutation is admin-only via the controller-level guard (freelancers with
 * no org pass unrestricted, matching the rest of the calling-infra controllers).
 */
@Controller("infrastructure")
@OrgAdminOnly()
export class InfrastructureController {
  constructor(private readonly infra: InfrastructureService) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  @Get("overview")
  @AllowOrgMember()
  async overview(@CurrentUser() user: CurrentUserData) {
    return this.infra.getOverview(createOwnershipContext(user));
  }

  @Get("linkable")
  @AllowOrgMember()
  async linkable(@CurrentUser() user: CurrentUserData) {
    return this.infra.listLinkable(createOwnershipContext(user));
  }

  @Get("entities")
  @AllowOrgMember()
  async entities(@CurrentUser() user: CurrentUserData) {
    return this.infra.listEntities(createOwnershipContext(user));
  }

  @Get("resources/:id/events")
  @AllowOrgMember()
  async events(@CurrentUser() user: CurrentUserData, @Param("id") id: string) {
    return this.infra.listEvents(createOwnershipContext(user), id);
  }

  @Get("resources/:id/documents")
  @AllowOrgMember()
  async documents(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    return this.infra.getResourceDocuments(createOwnershipContext(user), id);
  }

  // ── Canvas placement / labels ───────────────────────────────────────────────

  @Post("resources/link")
  async link(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: LinkResourceDto,
  ) {
    const ctx = createOwnershipContext(user);
    return this.infra.linkResource(ctx, dto.type, dto.referenceId, {
      x: dto.x ?? 0,
      y: dto.y ?? 0,
    });
  }

  @Patch("resources/:id/position")
  async updatePosition(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    await this.infra.updatePosition(
      createOwnershipContext(user),
      id,
      dto.x,
      dto.y,
    );
    return { ok: true };
  }

  @Patch("resources/:id")
  async rename(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() dto: RenameResourceDto,
  ) {
    await this.infra.renameResource(createOwnershipContext(user), id, dto.name);
    return { ok: true };
  }

  @Post("resources/:id/hide")
  async hide(@CurrentUser() user: CurrentUserData, @Param("id") id: string) {
    await this.infra.removeFromCanvas(createOwnershipContext(user), id);
    return { ok: true };
  }

  // ── Native creation (build flows) ───────────────────────────────────────────

  @Post("resources/team-member")
  async addTeamMembers(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AddTeamMembersDto,
  ) {
    const pos =
      dto.x !== undefined && dto.y !== undefined
        ? { x: dto.x, y: dto.y }
        : undefined;
    return this.infra.addTeamMembers(
      createOwnershipContext(user),
      dto.userIds,
      pos,
    );
  }

  @Post("resources/phone-number/search")
  async searchNumbers(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SearchNumbersDto,
  ) {
    return this.infra.searchNumbers(createOwnershipContext(user), {
      country: dto.country,
      numberType: dto.numberType,
      areaCode: dto.areaCode,
      limit: dto.limit,
    });
  }

  @Post("resources/phone-number/checkout")
  async phoneCheckout(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePhoneCheckoutInfraDto,
  ) {
    return this.infra.createPhoneCheckout(createOwnershipContext(user), {
      phoneNumber: dto.phoneNumber,
      frontendOrigin: dto.frontendOrigin,
    });
  }

  @Post("resources/phone-number/complete")
  async phoneComplete(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CompletePhoneCheckoutDto,
  ) {
    const pos =
      dto.x !== undefined && dto.y !== undefined
        ? { x: dto.x, y: dto.y }
        : undefined;
    return this.infra.completePhoneCheckout(createOwnershipContext(user), {
      sessionId: dto.sessionId,
      phoneNumber: dto.phoneNumber,
      position: pos,
    });
  }

  @Post("resources/sip-device")
  async createSipDevice(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateSipDeviceInfraDto,
  ) {
    const pos =
      dto.x !== undefined && dto.y !== undefined
        ? { x: dto.x, y: dto.y }
        : undefined;
    return this.infra.createSipDevice(createOwnershipContext(user), {
      label: dto.label,
      deviceType: dto.deviceType,
      assignedUserId: dto.assignedUserId,
      numberId: dto.numberId,
      allowInbound: dto.allowInbound,
      position: pos,
    });
  }

  @Post("resources/campaign")
  async createCampaign(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateCampaignInfraDto,
  ) {
    const pos =
      dto.x !== undefined && dto.y !== undefined
        ? { x: dto.x, y: dto.y }
        : undefined;
    return this.infra.createCampaignResource(createOwnershipContext(user), {
      name: dto.name,
      description: dto.description,
      dialerMode: dto.dialerMode,
      agentUserIds: dto.agentUserIds,
      numberPurchasedId: dto.numberPurchasedId,
      position: pos,
    });
  }

  // ── Inspector edits ─────────────────────────────────────────────────────────

  @Patch("resources/:id/configuration")
  async updateConfiguration(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() dto: UpdateConfigurationDto,
  ) {
    return this.infra.updateConfiguration(createOwnershipContext(user), id, {
      name: dto.name,
      campaignSettings: dto.campaignSettings,
      transition: dto.transition,
      enabled: dto.enabled,
    });
  }

  @Post("resources/:id/regenerate-credentials")
  async regenerateCredentials(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    return this.infra.regenerateSipCredentials(
      createOwnershipContext(user),
      id,
    );
  }

  @Post("resources/:id/assign")
  async assign(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() dto: AssignResourceDto,
  ) {
    return this.infra.assignResource(
      createOwnershipContext(user),
      id,
      dto.targetType,
      dto.targetReferenceId,
    );
  }

  @Post("resources/:id/unassign")
  async unassign(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() dto: AssignResourceDto,
  ) {
    await this.infra.unassignResource(
      createOwnershipContext(user),
      id,
      dto.targetType,
      dto.targetReferenceId,
    );
    return { ok: true };
  }

  @Delete("resources/:id")
  async deleteResource(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    await this.infra.deleteResource(createOwnershipContext(user), id);
    return { ok: true };
  }

  // ── Connections ─────────────────────────────────────────────────────────────

  @Post("connections")
  async createConnection(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateConnectionDto,
  ) {
    return this.infra.createConnection(
      createOwnershipContext(user),
      dto.sourceResourceId,
      dto.targetResourceId,
    );
  }

  @Delete("connections/:id")
  async deleteConnection(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    await this.infra.deleteConnection(createOwnershipContext(user), id);
    return { ok: true };
  }
}
