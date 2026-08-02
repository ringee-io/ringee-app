import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { Public } from "@ringee/platform";
import { SdkCallService, type SdkAuthenticatedAgent } from "@ringee/services";
import { SdkSessionGuard } from "./sdk-session.guard";
import { SdkAgent } from "./sdk-agent.decorator";

interface AuthorizeBody {
  to: string;
  callerIdId?: string;
  contactId?: string;
  externalContactId?: string;
  allowOverCap?: boolean;
}

/**
 * Server-side call authorization. The SDK calls this before placing the WebRTC
 * leg: it runs DNC / credit / caller-ID / contact resolution (reusing the exact
 * services the web dialer uses), pre-creates the `Call` (`source = "sdk"`), and
 * returns a signed correlation token the browser echoes so the Telnyx webhook
 * can adopt the row. `@Public()` bypasses Clerk; the `SdkSessionGuard` proves
 * the agent instead.
 */
@Public()
@UseGuards(SdkSessionGuard)
@Controller("v1/sdk/calls")
export class SdkCallController {
  constructor(private readonly calls: SdkCallService) {}

  @Post("authorize")
  authorize(
    @SdkAgent() agent: SdkAuthenticatedAgent,
    @Body() body: AuthorizeBody,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.calls.authorize(agent, {
      to: body?.to ?? "",
      callerIdId: body?.callerIdId,
      contactId: body?.contactId,
      externalContactId: body?.externalContactId,
      allowOverCap: body?.allowOverCap,
      idempotencyKey,
    });
  }
}
