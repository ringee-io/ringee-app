import { Injectable } from "@nestjs/common";
import {
  CompanyCustomFieldValue,
  ContactCustomFieldValue,
  CustomFieldDefinition,
  CustomFieldEntity,
  CustomFieldType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export type CustomFieldDefinitionInput = {
  organizationId?: string | null;
  userId?: string | null;
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
  enabled?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type CustomFieldValueInput = {
  valueText?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueDate?: Date | null;
  valueJson?: unknown;
};

@Injectable()
export class CustomFieldRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Definitions ──

  listDefinitions(ctx: {
    userId: string;
    organizationId?: string | null;
    entity?: CustomFieldEntity;
  }): Promise<CustomFieldDefinition[]> {
    const where: Prisma.CustomFieldDefinitionWhereInput = {
      enabled: true,
      ...(ctx.entity ? { entity: ctx.entity } : {}),
      OR: ctx.organizationId
        ? [{ organizationId: ctx.organizationId }]
        : [{ userId: ctx.userId, organizationId: null }],
    };
    return this.prisma.customFieldDefinition.findMany({
      where,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  findDefinitionById(id: string): Promise<CustomFieldDefinition | null> {
    return this.prisma.customFieldDefinition.findUnique({ where: { id } });
  }

  findDefinitionByKey(ctx: {
    userId: string;
    organizationId?: string | null;
    entity: CustomFieldEntity;
    key: string;
  }): Promise<CustomFieldDefinition | null> {
    if (ctx.organizationId) {
      return this.prisma.customFieldDefinition.findFirst({
        where: {
          organizationId: ctx.organizationId,
          entity: ctx.entity,
          key: ctx.key,
        },
      });
    }
    return this.prisma.customFieldDefinition.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: null,
        entity: ctx.entity,
        key: ctx.key,
      },
    });
  }

  createDefinition(
    input: CustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    return this.prisma.customFieldDefinition.create({
      data: {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        entity: input.entity,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        fieldType: input.fieldType,
        options: (input.options ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        defaultValue: (input.defaultValue ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        required: input.required ?? false,
        unique: input.unique ?? false,
        showInList: input.showInList ?? true,
        position: input.position ?? 0,
        enabled: input.enabled ?? true,
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  updateDefinition(
    id: string,
    input: Partial<CustomFieldDefinitionInput>,
  ): Promise<CustomFieldDefinition> {
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        label: input.label,
        description: input.description ?? undefined,
        options: (input.options ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        defaultValue: (input.defaultValue ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        required: input.required,
        unique: input.unique,
        showInList: input.showInList,
        position: input.position,
        enabled: input.enabled,
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  deleteDefinition(id: string): Promise<CustomFieldDefinition> {
    return this.prisma.customFieldDefinition.delete({ where: { id } });
  }

  // ── Values: Contact ──

  listContactValues(
    contactId: string,
  ): Promise<
    (ContactCustomFieldValue & { definition: CustomFieldDefinition })[]
  > {
    return this.prisma.contactCustomFieldValue.findMany({
      where: { contactId },
      include: { definition: true },
    });
  }

  upsertContactValue(input: {
    contactId: string;
    definitionId: string;
    value: CustomFieldValueInput;
  }): Promise<ContactCustomFieldValue> {
    const data = {
      valueText: input.value.valueText ?? null,
      valueNumber: input.value.valueNumber ?? null,
      valueBool: input.value.valueBool ?? null,
      valueDate: input.value.valueDate ?? null,
      valueJson: (input.value.valueJson ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    };
    return this.prisma.contactCustomFieldValue.upsert({
      where: {
        contactId_definitionId: {
          contactId: input.contactId,
          definitionId: input.definitionId,
        },
      },
      create: {
        ...data,
        contactId: input.contactId,
        definitionId: input.definitionId,
      },
      update: data,
    });
  }

  deleteContactValue(
    contactId: string,
    definitionId: string,
  ): Promise<ContactCustomFieldValue> {
    return this.prisma.contactCustomFieldValue.delete({
      where: { contactId_definitionId: { contactId, definitionId } },
    });
  }

  // ── Values: Company ──

  listCompanyValues(
    companyId: string,
  ): Promise<
    (CompanyCustomFieldValue & { definition: CustomFieldDefinition })[]
  > {
    return this.prisma.companyCustomFieldValue.findMany({
      where: { companyId },
      include: { definition: true },
    });
  }

  upsertCompanyValue(input: {
    companyId: string;
    definitionId: string;
    value: CustomFieldValueInput;
  }): Promise<CompanyCustomFieldValue> {
    const data = {
      valueText: input.value.valueText ?? null,
      valueNumber: input.value.valueNumber ?? null,
      valueBool: input.value.valueBool ?? null,
      valueDate: input.value.valueDate ?? null,
      valueJson: (input.value.valueJson ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    };
    return this.prisma.companyCustomFieldValue.upsert({
      where: {
        companyId_definitionId: {
          companyId: input.companyId,
          definitionId: input.definitionId,
        },
      },
      create: {
        ...data,
        companyId: input.companyId,
        definitionId: input.definitionId,
      },
      update: data,
    });
  }

  deleteCompanyValue(
    companyId: string,
    definitionId: string,
  ): Promise<CompanyCustomFieldValue> {
    return this.prisma.companyCustomFieldValue.delete({
      where: { companyId_definitionId: { companyId, definitionId } },
    });
  }
}
