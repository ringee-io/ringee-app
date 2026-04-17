import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { AttioAppService } from "@ringee/services";
import type { AttioAppContext } from "@ringee/services";
import { CurrentUser, CurrentUserData, Public } from "@ringee/platform";

@Controller("integrations/attio")
export class AttioAppController {
  constructor(private readonly attioApp: AttioAppService) {}

  private extractToken(authHeader: string | undefined): string {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }
    return authHeader.slice(7);
  }

  private resolveContext(authHeader: string | undefined): AttioAppContext {
    const token = this.extractToken(authHeader);
    return this.attioApp.validateToken(token);
  }

  @Post("generate-token")
  async generateToken(@CurrentUser() user: CurrentUserData) {
    const token = this.attioApp.generateToken({
      userId: user.id,
      organizationId: user.activeOrgId ?? null,
    });
    const context = await this.attioApp.getContextInfo({
      userId: user.id,
      organizationId: user.activeOrgId ?? null,
      scope: user.activeOrgId ? "organization" : "personal",
    });
    return { token, context };
  }

  @Public()
  @Post("validate")
  async validate(@Headers("authorization") auth: string | undefined) {
    const ctx = this.resolveContext(auth);
    const context = await this.attioApp.getContextInfo(ctx);
    return { valid: true, context };
  }

  @Public()
  @Get("context")
  async getContext(@Headers("authorization") auth: string | undefined) {
    const ctx = this.resolveContext(auth);
    return this.attioApp.getContextInfo(ctx);
  }

  @Public()
  @Get("call-history")
  async getCallHistory(
    @Headers("authorization") auth: string | undefined,
    @Query("phones") phones: string | undefined,
    @Query("limit") limit: string | undefined,
  ) {
    const ctx = this.resolveContext(auth);
    if (!phones) throw new BadRequestException("phones query parameter required");
    const phoneList = phones.split(",").map((p) => p.trim()).filter(Boolean);
    return this.attioApp.getCallHistory(ctx, phoneList, limit ? Number(limit) : 20);
  }

  @Public()
  @Get("caller-ids")
  async getCallerIds(@Headers("authorization") auth: string | undefined) {
    const ctx = this.resolveContext(auth);
    return this.attioApp.getCallerIds(ctx);
  }

  @Public()
  @Post("call-session")
  async createCallSession(
    @Headers("authorization") auth: string | undefined,
    @Body()
    body: {
      toNumber: string;
      fromNumber: string;
      recordName?: string;
      attioRecordId?: string;
      attioObjectType?: string;
    },
  ) {
    const ctx = this.resolveContext(auth);
    if (!body.toNumber || !body.fromNumber) {
      throw new BadRequestException("toNumber and fromNumber are required");
    }
    return this.attioApp.createCallSession(ctx, body);
  }
}
