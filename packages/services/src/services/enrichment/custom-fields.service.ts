import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CompanyCustomFieldValue,
  ContactCustomFieldValue,
  CustomFieldDefinition,
  CustomFieldEntity,
  CustomFieldRepository,
  CustomFieldType,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

export type CreateDefinitionInput = {
  entity: CustomFieldEntity;
  key: string;
  label: string;
  description?: string | null;
  fieldType: CustomFieldType;
  options?: unknown;
  defaultValue?: unknown;
  required?: boolean;
  unique?: boolean;
  showInList?: boolean;
  position?: number;
  metadata?: Record<string, unknown> | null;
};

export type UpdateDefinitionInput = Partial<
  Omit<CreateDefinitionInput, "entity" | "key" | "fieldType">
>;

export type CustomFieldValueInput = {
  text?: string | null;
  number?: number | null;
  bool?: boolean | null;
  date?: Date | string | null;
  json?: unknown;
  raw?: unknown; // generic — service decides which slot to use based on field type
};

@Injectable()
export class CustomFieldsService {
  constructor(private readonly repo: CustomFieldRepository) {}

  // ── Definitions ──

  listDefinitions(
    ctx: OwnershipContext,
    entity?: CustomFieldEntity,
  ): Promise<CustomFieldDefinition[]> {
    return this.repo.listDefinitions({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      entity,
    });
  }

  async createDefinition(
    ctx: OwnershipContext,
    input: CreateDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(input.key)) {
      throw new BadRequestException(
        "key must match /^[a-z][a-z0-9_]{1,63}$/ (lowercase, snake_case)",
      );
    }
    const existing = await this.repo.findDefinitionByKey({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      entity: input.entity,
      key: input.key,
    });
    if (existing) {
      throw new BadRequestException(
        `Custom field "${input.key}" already exists`,
      );
    }
    return this.repo.createDefinition({
      organizationId: ctx.organizationId ?? null,
      userId: ctx.organizationId ? null : ctx.userId,
      entity: input.entity,
      key: input.key,
      label: input.label,
      description: input.description ?? null,
      fieldType: input.fieldType,
      options: input.options ?? null,
      defaultValue: input.defaultValue ?? null,
      required: input.required ?? false,
      unique: input.unique ?? false,
      showInList: input.showInList ?? true,
      position: input.position ?? 0,
      metadata: input.metadata ?? null,
    });
  }

  async updateDefinition(
    ctx: OwnershipContext,
    id: string,
    input: UpdateDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    const def = await this.requireDefinition(id);
    this.assertAccess(ctx, def);
    return this.repo.updateDefinition(id, input);
  }

  async deleteDefinition(ctx: OwnershipContext, id: string): Promise<void> {
    const def = await this.requireDefinition(id);
    this.assertAccess(ctx, def);
    await this.repo.deleteDefinition(id);
  }

  // ── Values: Contact ──

  listContactValues(
    contactId: string,
  ): Promise<
    (ContactCustomFieldValue & { definition: CustomFieldDefinition })[]
  > {
    return this.repo.listContactValues(contactId);
  }

  async setContactValue(
    contactId: string,
    definitionId: string,
    value: CustomFieldValueInput,
  ): Promise<ContactCustomFieldValue> {
    const def = await this.requireDefinition(definitionId);
    if (def.entity !== "contact") {
      throw new BadRequestException("Definition is not for contact entity");
    }
    return this.repo.upsertContactValue({
      contactId,
      definitionId,
      value: this.normalizeValue(def.fieldType, value),
    });
  }

  async deleteContactValue(
    contactId: string,
    definitionId: string,
  ): Promise<void> {
    await this.repo.deleteContactValue(contactId, definitionId);
  }

  // ── Values: Company ──

  listCompanyValues(
    companyId: string,
  ): Promise<
    (CompanyCustomFieldValue & { definition: CustomFieldDefinition })[]
  > {
    return this.repo.listCompanyValues(companyId);
  }

  async setCompanyValue(
    companyId: string,
    definitionId: string,
    value: CustomFieldValueInput,
  ): Promise<CompanyCustomFieldValue> {
    const def = await this.requireDefinition(definitionId);
    if (def.entity !== "company") {
      throw new BadRequestException("Definition is not for company entity");
    }
    return this.repo.upsertCompanyValue({
      companyId,
      definitionId,
      value: this.normalizeValue(def.fieldType, value),
    });
  }

  async deleteCompanyValue(
    companyId: string,
    definitionId: string,
  ): Promise<void> {
    await this.repo.deleteCompanyValue(companyId, definitionId);
  }

  // ── Internals ──

  private async requireDefinition(id: string): Promise<CustomFieldDefinition> {
    const d = await this.repo.findDefinitionById(id);
    if (!d) throw new NotFoundException("Custom field definition not found");
    return d;
  }

  private assertAccess(
    ctx: OwnershipContext,
    def: CustomFieldDefinition,
  ): void {
    if (def.organizationId) {
      if (def.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Cannot access this definition");
      }
      return;
    }
    if (def.userId && def.userId !== ctx.userId) {
      throw new ForbiddenException("Cannot access this definition");
    }
  }

  private normalizeValue(
    type: CustomFieldType,
    v: CustomFieldValueInput,
  ): {
    valueText?: string | null;
    valueNumber?: number | null;
    valueBool?: boolean | null;
    valueDate?: Date | null;
    valueJson?: unknown;
  } {
    switch (type) {
      case "text":
      case "url":
      case "email":
      case "phone":
      case "select":
        return {
          valueText: v.text ?? (typeof v.raw === "string" ? v.raw : null),
        };
      case "number":
        return {
          valueNumber:
            v.number ??
            (typeof v.raw === "number"
              ? v.raw
              : v.raw != null
                ? Number(v.raw)
                : null),
        };
      case "boolean":
        return {
          valueBool: v.bool ?? (typeof v.raw === "boolean" ? v.raw : null),
        };
      case "date":
        return {
          valueDate:
            v.date instanceof Date
              ? v.date
              : v.date
                ? new Date(v.date)
                : v.raw
                  ? new Date(v.raw as string)
                  : null,
        };
      case "multi_select":
      case "json":
        return { valueJson: v.json ?? v.raw ?? null };
    }
  }
}
