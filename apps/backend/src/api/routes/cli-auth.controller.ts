import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser, CurrentUserData, Public } from "@ringee/platform";
import { CliAuthService, PersonalApiKeyService } from "@ringee/services";
import type { Request } from "express";
import {
  PersonalApiKeyGuard,
  type PersonalApiKeyRequest,
} from "../guards/personal-api-key.guard";

class StartCliAuthDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientVersion?: string;
}

class PollCliAuthDto {
  @IsString()
  @MaxLength(255)
  deviceCode!: string;
}

class ApproveCliAuthDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workspaceId?: string;
}

/**
 * `ringee login` — a device-authorization flow (RFC 8628 shapes) that issues a
 * personal API key to a terminal. See `CliAuthService` for the full flow.
 */
@Controller("cli/auth")
export class CliAuthController {
  constructor(
    private readonly cliAuth: CliAuthService,
    private readonly apiKeys: PersonalApiKeyService,
  ) {}

  // ── Terminal side ─────────────────────────────────────────────────────

  /**
   * Start a login. `@Public()` because the terminal has no credential yet;
   * it grants nothing by itself — access exists only after a signed-in user
   * approves the code in the browser. Rate limited per IP.
   */
  @Public()
  @Post("device")
  start(@Body() dto: StartCliAuthDto, @Req() req: Request) {
    return this.cliAuth.start({ ...dto, ip: req.ip ?? null });
  }

  /**
   * Collect the key. `@Public()`; the proof is the secret device code, which
   * only the terminal that started the login holds. Errors follow RFC 8628
   * §3.5: HTTP 400 with `{ error: "authorization_pending" | … }`.
   */
  @Public()
  @Post("token")
  @HttpCode(HttpStatus.OK)
  async token(@Body() dto: PollCliAuthDto) {
    const result = await this.cliAuth.poll(dto.deviceCode);
    if (result.status === "error") {
      throw new HttpException({ error: result.error }, HttpStatus.BAD_REQUEST);
    }
    const { status: _status, ...authorized } = result;
    return authorized;
  }

  /** Who this key acts as, and in which workspace. */
  @Public()
  @UseGuards(PersonalApiKeyGuard)
  @Get("whoami")
  async whoami(@Req() req: PersonalApiKeyRequest) {
    const { apiKey, ctx } = req.personalApiKeyAuth;
    return {
      ...(await this.apiKeys.describeAccount(
        ctx.userId,
        ctx.organizationId ?? null,
      )),
      key: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        source: apiKey.source,
        createdAt: apiKey.createdAt,
      },
    };
  }

  /** `ringee logout`: the key revokes itself. */
  @Public()
  @UseGuards(PersonalApiKeyGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: PersonalApiKeyRequest): Promise<void> {
    const { apiKey } = req.personalApiKeyAuth;
    await this.apiKeys.revoke(apiKey.userId, apiKey.id);
  }

  // ── Browser side (signed-in dashboard user) ──────────────────────────

  @Get("requests/:userCode")
  getRequest(
    @CurrentUser() user: CurrentUserData,
    @Param("userCode") userCode: string,
  ) {
    return this.cliAuth.getForApproval(user.id, userCode);
  }

  @Post("requests/:userCode/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(
    @CurrentUser() user: CurrentUserData,
    @Param("userCode") userCode: string,
    @Body() dto: ApproveCliAuthDto,
  ): Promise<void> {
    return this.cliAuth.approve(
      user.id,
      userCode,
      dto.workspaceId ?? "personal",
    );
  }

  @Post("requests/:userCode/deny")
  @HttpCode(HttpStatus.NO_CONTENT)
  deny(
    @CurrentUser() user: CurrentUserData,
    @Param("userCode") userCode: string,
  ): Promise<void> {
    return this.cliAuth.deny(user.id, userCode);
  }
}
