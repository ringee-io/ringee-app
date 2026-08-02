import { Controller, Get, Headers, Post } from "@nestjs/common";
import { Public } from "@ringee/platform";
import { SdkPublishableKeyService, SdkSessionService } from "@ringee/services";

/**
 * SDK bootstrap + session lifecycle.
 *
 * `initialize` validates the publishable key + origin (no agent yet).
 * `restore` re-hydrates a persisted session on page reload, re-validating the
 * agent live and minting a fresh Telnyx credential (the old one was memory-only).
 */
@Public()
@Controller("v1/sdk")
export class SdkSessionController {
  constructor(
    private readonly pk: SdkPublishableKeyService,
    private readonly sessions: SdkSessionService,
  ) {}

  /** Validate the installation. Returns nothing sensitive. */
  @Post("initialize")
  async initialize(
    @Headers("x-ringee-key") key: string,
    @Headers("origin") origin: string,
  ) {
    const resolved = await this.pk.resolve(key, origin);
    return {
      ok: true,
      integrationId: resolved.integration.id,
      workspace: resolved.integration.organizationId
        ? "organization"
        : "personal",
    };
  }

  /** Restore an existing agent session (page reload). */
  @Post("session/restore")
  async restore(
    @Headers("authorization") authorization: string,
    @Headers("origin") origin: string,
  ) {
    return this.sessions.restore(authorization, origin);
  }

  /** Lightweight liveness check the SDK can poll before privileged calls. */
  @Get("session/me")
  async me(
    @Headers("authorization") authorization: string,
    @Headers("origin") origin: string,
  ) {
    const agent = await this.sessions.authenticate(authorization, origin);
    return {
      agent: {
        id: agent.user.id,
        firstName: agent.user.firstName,
        lastName: agent.user.lastName,
        email: agent.user.email,
        imageUrl: agent.user.imageUrl,
        role: agent.role,
      },
      workspace: {
        organizationId: agent.integration.organizationId,
      },
    };
  }
}
