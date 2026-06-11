import { Injectable } from "@nestjs/common";
import { CrmFieldMapping, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CrmFieldMappingRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByConnection(connectionId: string): Promise<CrmFieldMapping[]> {
    return this.prisma.crmFieldMapping.findMany({
      where: { connectionId, enabled: true },
      orderBy: { ringeeEntity: "asc" },
    });
  }

  upsert(input: {
    connectionId: string;
    provider: CrmFieldMapping["provider"];
    ringeeEntity: string;
    ringeeField: string;
    externalEntity: string;
    externalField: string;
    transform?: Record<string, unknown> | null;
    direction?: "push" | "pull" | "bidirectional";
    enabled?: boolean;
  }): Promise<CrmFieldMapping> {
    return this.prisma.crmFieldMapping.upsert({
      where: {
        connectionId_ringeeEntity_ringeeField: {
          connectionId: input.connectionId,
          ringeeEntity: input.ringeeEntity,
          ringeeField: input.ringeeField,
        },
      },
      create: {
        connectionId: input.connectionId,
        provider: input.provider,
        ringeeEntity: input.ringeeEntity,
        ringeeField: input.ringeeField,
        externalEntity: input.externalEntity,
        externalField: input.externalField,
        transform: (input.transform ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        direction: input.direction ?? "push",
        enabled: input.enabled ?? true,
      },
      update: {
        externalEntity: input.externalEntity,
        externalField: input.externalField,
        transform: (input.transform ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        direction: input.direction ?? undefined,
        enabled: input.enabled ?? undefined,
      },
    });
  }

  remove(id: string): Promise<CrmFieldMapping> {
    return this.prisma.crmFieldMapping.delete({ where: { id } });
  }
}
