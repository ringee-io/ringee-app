import { Injectable } from "@nestjs/common";
import { Prisma, WorkspaceCompanyProfile } from "@prisma/client";
import { OwnershipContext } from "@ringee/platform";
import { PrismaService } from "../prisma.service";

/**
 * One company profile per workspace, shared by every AI voice agent in it.
 * Follows the CallRecordingSettings shape: a personal workspace sets `userId`,
 * an organization sets `organizationId`, never both.
 */
@Injectable()
export class WorkspaceCompanyProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(ctx: OwnershipContext): Promise<WorkspaceCompanyProfile | null> {
    return ctx.organizationId
      ? this.prisma.workspaceCompanyProfile.findUnique({
          where: { organizationId: ctx.organizationId },
        })
      : this.prisma.workspaceCompanyProfile.findUnique({
          where: { userId: ctx.userId },
        });
  }

  upsert(
    ctx: OwnershipContext,
    data: Pick<
      Prisma.WorkspaceCompanyProfileUncheckedCreateInput,
      "companyName" | "companyWebsite" | "companyDescription"
    >,
  ): Promise<WorkspaceCompanyProfile> {
    return ctx.organizationId
      ? this.prisma.workspaceCompanyProfile.upsert({
          where: { organizationId: ctx.organizationId },
          create: { ...data, organizationId: ctx.organizationId },
          update: data,
        })
      : this.prisma.workspaceCompanyProfile.upsert({
          where: { userId: ctx.userId },
          create: { ...data, userId: ctx.userId },
          update: data,
        });
  }
}
