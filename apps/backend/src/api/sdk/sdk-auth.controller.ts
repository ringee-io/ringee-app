import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "@ringee/platform";
import {
  SdkEmailAuthService,
  SdkPublishableKeyService,
  SdkSessionService,
} from "@ringee/services";

interface StartBody {
  email: string;
}
interface VerifyBody {
  challengeId: string;
  code: string;
}
interface ResendBody {
  challengeId: string;
}

/**
 * Agent email-OTP authentication. Every route is validated by the publishable
 * key + `Origin` first; identity is then proven by a one-time code sent to the
 * agent's email. Responses are enumeration-safe: they never reveal whether an
 * email maps to an authorized agent.
 *
 * `@Public()` bypasses the global Clerk guard — these endpoints are for
 * unauthenticated CRM browsers, secured by the pk/origin/OTP chain instead.
 */
@Public()
@Controller("v1/sdk/auth")
export class SdkAuthController {
  constructor(
    private readonly pk: SdkPublishableKeyService,
    private readonly emailAuth: SdkEmailAuthService,
    private readonly sessions: SdkSessionService,
  ) {}

  @Post("email/start")
  async start(
    @Headers("x-ringee-key") key: string,
    @Headers("origin") origin: string,
    @Body() body: StartBody,
    @Req() req: Request,
  ) {
    const resolved = await this.pk.resolve(key, origin);
    return this.emailAuth.start({
      integration: resolved.integration,
      origin: resolved.origin,
      email: body?.email ?? "",
      ip: req.ip,
    });
  }

  @Post("email/verify")
  async verify(
    @Headers("x-ringee-key") key: string,
    @Headers("origin") origin: string,
    @Body() body: VerifyBody,
  ) {
    const resolved = await this.pk.resolve(key, origin);
    const identity = await this.emailAuth.verify({
      integration: resolved.integration,
      origin: resolved.origin,
      challengeId: body?.challengeId ?? "",
      code: body?.code ?? "",
    });
    return this.sessions.buildBootstrap({
      integration: resolved.integration,
      origin: resolved.origin,
      identity,
    });
  }

  @Post("email/resend")
  async resend(
    @Headers("x-ringee-key") key: string,
    @Headers("origin") origin: string,
    @Body() body: ResendBody,
    @Req() req: Request,
  ) {
    const resolved = await this.pk.resolve(key, origin);
    return this.emailAuth.resend({
      integration: resolved.integration,
      origin: resolved.origin,
      challengeId: body?.challengeId ?? "",
      ip: req.ip,
    });
  }
}
