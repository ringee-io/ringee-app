import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CallScript, CallScriptSection, Prisma } from "@prisma/client";
import {
  OwnershipContext,
  buildOwnershipFilter,
} from "@ringee/platform";

export type CallScriptWithSections = CallScript & {
  sections: CallScriptSection[];
};

export type ScriptSectionInput = {
  id?: string;
  title: string;
  body: string;
};

@Injectable()
export class CallScriptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOwner(
    ctx: OwnershipContext
  ): Promise<CallScriptWithSections | null> {
    const ownership = buildOwnershipFilter(ctx);
    return this.prisma.callScript.findFirst({
      where: ownership,
      include: {
        sections: {
          orderBy: { position: "asc" },
        },
      },
    });
  }

  async upsertWithSections(
    ctx: OwnershipContext,
    sections: ScriptSectionInput[]
  ): Promise<CallScriptWithSections> {
    return this.prisma.$transaction(async (tx) => {
      const ownership = buildOwnershipFilter(ctx);
      const existing = await tx.callScript.findFirst({
        where: ownership,
        select: { id: true },
      });

      const scriptId = existing
        ? existing.id
        : (
            await tx.callScript.create({
              data: {
                userId: ctx.userId,
                organizationId: ctx.organizationId ?? null,
              },
              select: { id: true },
            })
          ).id;

      await tx.callScriptSection.deleteMany({
        where: { scriptId },
      });

      if (sections.length > 0) {
        await tx.callScriptSection.createMany({
          data: sections.map((s, index) => ({
            scriptId,
            title: s.title,
            body: s.body,
            position: index,
          })),
        });
      }

      const result = await tx.callScript.findUniqueOrThrow({
        where: { id: scriptId },
        include: {
          sections: { orderBy: { position: "asc" } },
        },
      });

      return result;
    });
  }
}
