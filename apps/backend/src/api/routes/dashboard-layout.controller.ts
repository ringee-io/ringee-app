import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import { DashboardLayoutService } from "@ringee/services";
import type { DashboardScope, UpsertWidgetInput } from "@ringee/database";

interface WidgetDto {
  id?: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: unknown;
  isVisible?: boolean;
}

function parseScope(scope?: string): DashboardScope | undefined {
  if (!scope) return undefined;
  if (scope !== "personal" && scope !== "organization") {
    throw new BadRequestException("scope must be 'personal' or 'organization'");
  }
  return scope;
}

function toWidgetInput(dto: WidgetDto): UpsertWidgetInput {
  if (!dto.type || !dto.title) {
    throw new BadRequestException("Widget type and title are required");
  }
  if (
    !Number.isInteger(dto.x) ||
    !Number.isInteger(dto.y) ||
    !Number.isInteger(dto.w) ||
    !Number.isInteger(dto.h)
  ) {
    throw new BadRequestException("Widget x/y/w/h must be integers");
  }
  return {
    type: dto.type,
    title: dto.title,
    x: dto.x,
    y: dto.y,
    w: dto.w,
    h: dto.h,
    config:
      dto.config === undefined
        ? null
        : (dto.config as UpsertWidgetInput["config"]),
    isVisible: dto.isVisible,
  };
}

function toWidgetPatch(body: Partial<WidgetDto>): Partial<UpsertWidgetInput> {
  const patch: Partial<UpsertWidgetInput> = {};
  if (body.type !== undefined) patch.type = body.type;
  if (body.title !== undefined) patch.title = body.title;
  if (body.x !== undefined) patch.x = body.x;
  if (body.y !== undefined) patch.y = body.y;
  if (body.w !== undefined) patch.w = body.w;
  if (body.h !== undefined) patch.h = body.h;
  if (body.config !== undefined) {
    patch.config = body.config as UpsertWidgetInput["config"];
  }
  if (body.isVisible !== undefined) patch.isVisible = body.isVisible;
  return patch;
}

@Controller("dashboard/layout")
export class DashboardLayoutController {
  constructor(private readonly service: DashboardLayoutService) {}

  @Get()
  async getLayout(
    @CurrentUser() user: CurrentUserData,
    @Query("scope") scope?: string,
  ) {
    const ctx = createOwnershipContext(user);
    const resolved = this.service.resolveScope(ctx, parseScope(scope));
    return this.service.getOrCreateDefault(ctx, resolved);
  }

  @Put("widgets")
  @OrgAdminOnly()
  async replaceWidgets(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { scope?: string; widgets: WidgetDto[] },
  ) {
    const ctx = createOwnershipContext(user);
    const scope = this.service.resolveScope(ctx, parseScope(body.scope));
    if (!Array.isArray(body.widgets)) {
      throw new BadRequestException("widgets must be an array");
    }
    return this.service.replaceWidgets(
      ctx,
      scope,
      body.widgets.map(toWidgetInput),
    );
  }

  @Post("widgets")
  @OrgAdminOnly()
  async addWidget(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { scope?: string; widget: WidgetDto },
  ) {
    const ctx = createOwnershipContext(user);
    const scope = this.service.resolveScope(ctx, parseScope(body.scope));
    if (!body.widget) throw new BadRequestException("widget is required");
    return this.service.addWidget(ctx, scope, toWidgetInput(body.widget));
  }

  @Patch("widgets/:id")
  @OrgAdminOnly()
  async updateWidget(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: Partial<WidgetDto>,
  ) {
    const ctx = createOwnershipContext(user);
    return this.service.updateWidget(ctx, id, toWidgetPatch(body));
  }

  @Delete("widgets/:id")
  @OrgAdminOnly()
  async deleteWidget(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    await this.service.deleteWidget(ctx, id);
    return { ok: true };
  }
}
