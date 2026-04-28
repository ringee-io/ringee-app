import { BadRequestException, Injectable } from "@nestjs/common";
import {
  CallScriptRepository,
  CallScriptWithSections,
  OrganizationRepository,
  UserRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

export type ScriptSectionDto = {
  id?: string;
  title: string;
  body: string;
};

export type CallScriptResponse = {
  sections: { id: string; title: string; body: string }[];
};

@Injectable()
export class CallScriptService {
  constructor(
    private readonly repo: CallScriptRepository,
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
  ) {}

  async getScript(ctx: OwnershipContext): Promise<CallScriptResponse> {
    const resolved = await this.resolveCtx(ctx);
    const script = await this.repo.findByOwner(resolved);
    return this.toResponse(script);
  }

  async saveScript(
    ctx: OwnershipContext,
    sections: ScriptSectionDto[],
  ): Promise<CallScriptResponse> {
    if (!Array.isArray(sections)) {
      throw new BadRequestException("sections must be an array");
    }

    const sanitized = sections
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        title: typeof s.title === "string" ? s.title.slice(0, 200) : "",
        body: typeof s.body === "string" ? s.body : "",
      }));

    const resolved = await this.resolveCtx(ctx);
    const script = await this.repo.upsertWithSections(resolved, sanitized);
    return this.toResponse(script);
  }

  private toResponse(script: CallScriptWithSections | null): CallScriptResponse {
    if (!script) return { sections: [] };
    return {
      sections: script.sections.map((s) => ({
        id: s.id,
        title: s.title,
        body: s.body,
      })),
    };
  }

  private async resolveCtx(ctx: OwnershipContext): Promise<OwnershipContext> {
    const userId = await this.resolveUserId(ctx.userId);
    const organizationId = ctx.organizationId
      ? await this.resolveOrgId(ctx.organizationId)
      : null;
    return { userId, organizationId };
  }

  private async resolveUserId(clerkOrDbId: string): Promise<string> {
    if (clerkOrDbId.startsWith("user_")) {
      const user = await this.userRepo.findByClerkId(clerkOrDbId);
      if (!user) throw new BadRequestException("User not found");
      return user.id;
    }
    const user = await this.userRepo.findById(clerkOrDbId);
    if (!user) throw new BadRequestException("User not found in database");
    return user.id;
  }

  private async resolveOrgId(clerkOrDbId: string): Promise<string> {
    if (clerkOrDbId.startsWith("org_")) {
      const org = await this.orgRepo.findByClerkId(clerkOrDbId);
      if (!org) throw new BadRequestException("Organization not found");
      return org.id;
    }
    return clerkOrDbId;
  }
}
