import { Injectable, Logger } from "@nestjs/common";
import { CrmFieldMapping, CrmFieldMappingRepository } from "@ringee/database";

export type FieldMappingDirection = "push" | "pull" | "bidirectional";

export type ResolvedMapping = {
  ringeeField: string;
  externalField: string;
  transform: MappingTransform | null;
};

export type MappingTransform =
  | { type: "direct" }
  | { type: "map"; values: Record<string, string> }
  | { type: "template"; template: string }
  | { type: "boolean"; trueValue: string; falseValue: string };

@Injectable()
export class CrmFieldMappingService {
  private readonly logger = new Logger(CrmFieldMappingService.name);

  constructor(private readonly repo: CrmFieldMappingRepository) {}

  async getMappings(
    connectionId: string,
    entity: string,
    direction: FieldMappingDirection,
  ): Promise<ResolvedMapping[]> {
    const all = await this.repo.listByConnection(connectionId);
    return all
      .filter(
        (m) =>
          m.ringeeEntity === entity &&
          (m.direction === direction || m.direction === "bidirectional"),
      )
      .map((m) => ({
        ringeeField: m.ringeeField,
        externalField: m.externalField,
        transform: this.parseTransform(m.transform),
      }));
  }

  applyPushMappings(
    mappings: ResolvedMapping[],
    ringeeData: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const m of mappings) {
      const value = ringeeData[m.ringeeField];
      if (value === undefined) continue;
      result[m.externalField] = this.applyTransform(value, m.transform);
    }
    return result;
  }

  applyPullMappings(
    mappings: ResolvedMapping[],
    externalData: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const m of mappings) {
      const value = externalData[m.externalField];
      if (value === undefined) continue;
      result[m.ringeeField] = this.applyReverseTransform(value, m.transform);
    }
    return result;
  }

  async seedDefaultMappings(
    connectionId: string,
    provider: CrmFieldMapping["provider"],
  ): Promise<void> {
    const defaults = this.getDefaultMappings(provider);
    for (const d of defaults) {
      await this.repo.upsert({
        connectionId,
        provider,
        ringeeEntity: d.ringeeEntity,
        ringeeField: d.ringeeField,
        externalEntity: d.externalEntity,
        externalField: d.externalField,
        direction: d.direction as "push" | "pull" | "bidirectional",
        enabled: true,
      });
    }
  }

  private getDefaultMappings(
    provider: CrmFieldMapping["provider"],
  ): Array<{
    ringeeEntity: string;
    ringeeField: string;
    externalEntity: string;
    externalField: string;
    direction: string;
  }> {
    if (provider === "attio") {
      return [
        { ringeeEntity: "contact", ringeeField: "firstName", externalEntity: "people", externalField: "name.first_name", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "lastName", externalEntity: "people", externalField: "name.last_name", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "phoneNumber", externalEntity: "people", externalField: "phone_numbers", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "email", externalEntity: "people", externalField: "email_addresses", direction: "bidirectional" },
        { ringeeEntity: "company", ringeeField: "name", externalEntity: "companies", externalField: "name", direction: "bidirectional" },
        { ringeeEntity: "company", ringeeField: "domain", externalEntity: "companies", externalField: "domains", direction: "bidirectional" },
        { ringeeEntity: "company", ringeeField: "industry", externalEntity: "companies", externalField: "categories", direction: "pull" },
      ];
    }
    if (provider === "odoo_14_18" || provider === "odoo_19_plus") {
      return [
        { ringeeEntity: "contact", ringeeField: "displayName", externalEntity: "res.partner", externalField: "name", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "phoneNumber", externalEntity: "res.partner", externalField: "phone", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "mobile", externalEntity: "res.partner", externalField: "mobile", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "email", externalEntity: "res.partner", externalField: "email", direction: "bidirectional" },
        { ringeeEntity: "contact", ringeeField: "jobTitle", externalEntity: "res.partner", externalField: "function", direction: "bidirectional" },
        { ringeeEntity: "company", ringeeField: "name", externalEntity: "res.partner", externalField: "name", direction: "bidirectional" },
        { ringeeEntity: "company", ringeeField: "domain", externalEntity: "res.partner", externalField: "website", direction: "bidirectional" },
        { ringeeEntity: "company", ringeeField: "industry", externalEntity: "res.partner", externalField: "industry_id", direction: "pull" },
        { ringeeEntity: "call", ringeeField: "disposition", externalEntity: "mail.activity", externalField: "summary", direction: "push" },
        { ringeeEntity: "call", ringeeField: "recordingUrl", externalEntity: "mail.message", externalField: "body", direction: "push" },
        { ringeeEntity: "call", ringeeField: "transcript", externalEntity: "mail.message", externalField: "body", direction: "push" },
      ];
    }
    return [];
  }

  private parseTransform(raw: unknown): MappingTransform | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    if (obj.type === "map" && obj.values) return obj as MappingTransform;
    if (obj.type === "template" && obj.template) return obj as MappingTransform;
    if (obj.type === "boolean") return obj as MappingTransform;
    if (obj.type === "direct") return { type: "direct" };
    return null;
  }

  private applyTransform(value: unknown, transform: MappingTransform | null): unknown {
    if (!transform || transform.type === "direct") return value;
    if (transform.type === "map") {
      return transform.values[String(value)] ?? value;
    }
    if (transform.type === "boolean") {
      return value ? transform.trueValue : transform.falseValue;
    }
    return value;
  }

  private applyReverseTransform(value: unknown, transform: MappingTransform | null): unknown {
    if (!transform || transform.type === "direct") return value;
    if (transform.type === "map") {
      const reverse = Object.entries(transform.values).find(([, v]) => v === String(value));
      return reverse ? reverse[0] : value;
    }
    if (transform.type === "boolean") {
      return String(value) === transform.trueValue;
    }
    return value;
  }
}
