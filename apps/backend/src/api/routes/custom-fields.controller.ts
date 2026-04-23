import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CustomFieldEntity, CustomFieldType } from "@ringee/database";
import { CustomFieldsService } from "@ringee/services";
import {
  createOwnershipContext,
  CurrentUser,
  CurrentUserData,
} from "@ringee/platform";

const VALID_ENTITIES: CustomFieldEntity[] = ["contact", "company"];
const VALID_TYPES: CustomFieldType[] = [
  "text",
  "number",
  "boolean",
  "date",
  "url",
  "email",
  "phone",
  "select",
  "multi_select",
  "json",
];

@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  // ── Definitions ──────────────────────────────────────────────────────

  @Get("definitions")
  async listDefinitions(
    @Query("entity") entity: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    if (entity && !VALID_ENTITIES.includes(entity as CustomFieldEntity)) {
      throw new BadRequestException(`invalid entity: ${entity}`);
    }
    return this.service.listDefinitions(
      ctx,
      entity as CustomFieldEntity | undefined,
    );
  }

  @Post("definitions")
  async createDefinition(
    @Body()
    body: {
      entity: CustomFieldEntity;
      key: string;
      label: string;
      description?: string;
      fieldType: CustomFieldType;
      options?: unknown;
      defaultValue?: unknown;
      required?: boolean;
      unique?: boolean;
      showInList?: boolean;
      position?: number;
      metadata?: Record<string, unknown>;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body || !body.entity || !body.key || !body.label || !body.fieldType) {
      throw new BadRequestException(
        "entity, key, label, fieldType are required",
      );
    }
    if (!VALID_ENTITIES.includes(body.entity)) {
      throw new BadRequestException(`invalid entity: ${body.entity}`);
    }
    if (!VALID_TYPES.includes(body.fieldType)) {
      throw new BadRequestException(`invalid fieldType: ${body.fieldType}`);
    }
    const ctx = createOwnershipContext(user);
    return this.service.createDefinition(ctx, body);
  }

  @Patch("definitions/:id")
  async updateDefinition(
    @Param("id") id: string,
    @Body()
    body: {
      label?: string;
      description?: string;
      options?: unknown;
      defaultValue?: unknown;
      required?: boolean;
      unique?: boolean;
      showInList?: boolean;
      position?: number;
      metadata?: Record<string, unknown>;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.service.updateDefinition(ctx, id, body);
  }

  @Delete("definitions/:id")
  async deleteDefinition(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    await this.service.deleteDefinition(ctx, id);
    return { ok: true };
  }

  // ── Contact values ───────────────────────────────────────────────────

  @Get("contacts/:id/values")
  async listContactValues(@Param("id") contactId: string) {
    return this.service.listContactValues(contactId);
  }

  @Post("contacts/:id/values/:definitionId")
  async setContactValue(
    @Param("id") contactId: string,
    @Param("definitionId") definitionId: string,
    @Body()
    body: {
      text?: string | null;
      number?: number | null;
      bool?: boolean | null;
      date?: string | null;
      json?: unknown;
      raw?: unknown;
    },
  ) {
    return this.service.setContactValue(contactId, definitionId, {
      ...body,
      date: body.date ? new Date(body.date) : null,
    });
  }

  @Delete("contacts/:id/values/:definitionId")
  async deleteContactValue(
    @Param("id") contactId: string,
    @Param("definitionId") definitionId: string,
  ) {
    await this.service.deleteContactValue(contactId, definitionId);
    return { ok: true };
  }

  // ── Company values ───────────────────────────────────────────────────

  @Get("companies/:id/values")
  async listCompanyValues(@Param("id") companyId: string) {
    return this.service.listCompanyValues(companyId);
  }

  @Post("companies/:id/values/:definitionId")
  async setCompanyValue(
    @Param("id") companyId: string,
    @Param("definitionId") definitionId: string,
    @Body()
    body: {
      text?: string | null;
      number?: number | null;
      bool?: boolean | null;
      date?: string | null;
      json?: unknown;
      raw?: unknown;
    },
  ) {
    return this.service.setCompanyValue(companyId, definitionId, {
      ...body,
      date: body.date ? new Date(body.date) : null,
    });
  }

  @Delete("companies/:id/values/:definitionId")
  async deleteCompanyValue(
    @Param("id") companyId: string,
    @Param("definitionId") definitionId: string,
  ) {
    await this.service.deleteCompanyValue(companyId, definitionId);
    return { ok: true };
  }
}
