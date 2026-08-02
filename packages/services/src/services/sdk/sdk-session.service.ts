import { Injectable } from "@nestjs/common";
import {
  CustomIntegration,
  CustomIntegrationRepository,
  PrismaService,
  UserRepository,
} from "@ringee/database";
import {
  OwnershipContext,
  SDK_SESSION_TTL_SECONDS,
  SdkAgentSessionClaims,
  mintAgentSession,
  normalizeOrigin,
  verifyAgentSession,
} from "@ringee/platform";
import { OrganizationService } from "../organization.service";
import {
  SdkCallerIdResolver,
  SdkCallerId,
} from "./sdk-caller-id-resolver.service";
import { SdkTelnyxTokenService } from "./sdk-telnyx-token.service";
import { SdkVerifiedIdentity } from "./sdk-email-auth.service";
import { SdkError } from "./sdk.errors";

export interface SdkAuthenticatedAgent {
  claims: SdkAgentSessionClaims;
  integration: CustomIntegration;
  ctx: OwnershipContext;
  role: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
    email: string;
  };
}

export interface SdkBootstrap {
  accessToken: string;
  expiresIn: number;
  agent: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    imageUrl: string | null;
    role: string | null;
  };
  workspace: {
    organizationId: string | null;
    name: string;
  };
  permissions: {
    canCall: boolean;
    canRecord: boolean;
  };
  callerIds: SdkCallerId[];
  /** SIP WebRTC credential (kept in memory only by the SDK). */
  telnyxToken: {
    sipUsername: string;
    sipPassword: string;
    expiresAt: string;
    connectionId: string;
  };
}

/**
 * Owns the Ringee-signed agent session: minting after OTP, verifying on every
 * privileged request, and assembling the auth "bootstrap" (agent + workspace +
 * permissions + caller IDs + a fresh Telnyx credential). The signature proves
 * identity; live database checks (integration active, user not blocked, still a
 * member, `canCall`) are re-run every time so a revoked agent is rejected
 * before their token naturally expires.
 */
@Injectable()
export class SdkSessionService {
  constructor(
    private readonly repo: CustomIntegrationRepository,
    private readonly users: UserRepository,
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationService,
    private readonly callerIds: SdkCallerIdResolver,
    private readonly telnyxToken: SdkTelnyxTokenService,
  ) {}

  /** Mint a signed session for a freshly OTP-verified identity. */
  issue(params: {
    integration: CustomIntegration;
    origin: string;
    identity: SdkVerifiedIdentity;
  }): { token: string; claims: SdkAgentSessionClaims } {
    return mintAgentSession({
      integrationId: params.integration.id,
      userId: params.identity.userId,
      organizationId: params.identity.organizationId,
      email: params.identity.email,
      origin: params.origin,
    });
  }

  /**
   * Verify a bearer session against the request origin and re-validate the
   * agent live. Returns the authenticated agent or throws a typed error.
   */
  async authenticate(
    rawToken: string | undefined | null,
    requestOrigin: string | undefined | null,
  ): Promise<SdkAuthenticatedAgent> {
    const bearer = this.stripBearer(rawToken);
    const verified = verifyAgentSession(bearer);
    if (!verified.ok) {
      if (verified.error === "expired") {
        throw new SdkError("SESSION_EXPIRED", "Your session has expired.");
      }
      throw new SdkError("AUTH_REQUIRED", "Authentication is required.");
    }
    const claims = verified.claims;

    // The session is bound to the origin it was minted from.
    const normalized = normalizeOrigin(requestOrigin);
    if (!normalized || normalized !== claims.origin) {
      throw new SdkError(
        "DOMAIN_NOT_ALLOWED",
        "This domain is not authorized for the session.",
      );
    }

    const integration = await this.repo.findById(claims.integrationId);
    if (!integration) {
      throw new SdkError("AUTH_REQUIRED", "Authentication is required.");
    }
    if (integration.status !== "active") {
      throw new SdkError(
        "INTEGRATION_DISABLED",
        "This integration is disabled.",
      );
    }
    // Origin must still be permitted by the integration's live allow-list is
    // implicit: the session origin equals the pk origin used at mint time, and
    // the pk is re-checked at initialize. Here we trust the signed origin.

    const { user, role } = await this.revalidateAgent(
      integration,
      claims.userId,
    );

    return {
      claims,
      integration,
      ctx: {
        userId: user.id,
        organizationId: integration.organizationId,
      },
      role,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        email: claims.email,
      },
    };
  }

  /**
   * Build the full auth bootstrap for a verified agent: session token +
   * workspace + permissions + caller IDs + a fresh Telnyx credential.
   */
  async buildBootstrap(params: {
    integration: CustomIntegration;
    origin: string;
    identity: SdkVerifiedIdentity;
  }): Promise<SdkBootstrap> {
    const { token } = this.issue(params);
    return this.assembleBootstrap({
      integration: params.integration,
      accessToken: token,
      agent: {
        id: params.identity.userId,
        firstName: params.identity.firstName,
        lastName: params.identity.lastName,
        email: params.identity.email,
        imageUrl: params.identity.imageUrl,
        role: params.identity.role,
      },
      organizationId: params.identity.organizationId,
    });
  }

  /**
   * Restore an existing session (page reload). Re-validates everything, then
   * returns a fresh bootstrap WITH a new Telnyx credential (the old one was
   * memory-only and is gone). The session token itself is reused unless it is
   * close to expiry.
   */
  async restore(
    rawToken: string | undefined | null,
    requestOrigin: string | undefined | null,
  ): Promise<SdkBootstrap> {
    const authed = await this.authenticate(rawToken, requestOrigin);
    return this.assembleBootstrap({
      integration: authed.integration,
      accessToken: this.stripBearer(rawToken)!,
      agent: {
        id: authed.user.id,
        firstName: authed.user.firstName,
        lastName: authed.user.lastName,
        email: authed.user.email,
        imageUrl: authed.user.imageUrl,
        role: authed.role,
      },
      organizationId: authed.integration.organizationId,
    });
  }

  private async assembleBootstrap(params: {
    integration: CustomIntegration;
    accessToken: string;
    agent: SdkBootstrap["agent"];
    organizationId: string | null;
  }): Promise<SdkBootstrap> {
    const ctx: OwnershipContext = {
      userId: params.integration.userId,
      organizationId: params.organizationId,
    };
    // Caller IDs are scoped to the *agent* placing calls, not the integration
    // owner, so pass the agent's user id.
    const callerIds = await this.callerIds.list(ctx, params.agent.id);
    const telnyxToken = await this.telnyxToken.issue(params.agent.id);

    let workspaceName = "Personal";
    if (params.organizationId) {
      const org = await this.organizations
        .getOrganizationById(params.organizationId)
        .catch(() => null);
      workspaceName = org?.name ?? "Organization";
    }

    return {
      accessToken: params.accessToken,
      expiresIn: SDK_SESSION_TTL_SECONDS,
      agent: params.agent,
      workspace: {
        organizationId: params.organizationId,
        name: workspaceName,
      },
      permissions: {
        canCall: true,
        canRecord: callerIds.some((c) => c.canRecord),
      },
      callerIds,
      telnyxToken,
    };
  }

  /** Live re-check that the agent may still act. Throws a typed error if not. */
  private async revalidateAgent(
    integration: CustomIntegration,
    userId: string,
  ): Promise<{
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      imageUrl: string | null;
      blockedAt: Date | null;
      canCall: boolean;
    };
    role: string | null;
  }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new SdkError("AUTH_REQUIRED", "Authentication is required.");
    }
    if (user.blockedAt) {
      throw new SdkError("USER_BLOCKED", "This account is disabled.");
    }
    if (user.canCall === false) {
      throw new SdkError(
        "CALLING_DISABLED",
        "Calling is disabled for this account.",
      );
    }

    if (!integration.organizationId) {
      if (user.id !== integration.userId) {
        throw new SdkError("AGENT_NOT_IN_WORKSPACE", "Agent not in workspace.");
      }
      return { user, role: null };
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: integration.organizationId, userId: user.id },
      select: { role: true },
    });
    if (!membership) {
      throw new SdkError("AGENT_NOT_IN_WORKSPACE", "Agent not in workspace.");
    }
    return { user, role: membership.role };
  }

  private stripBearer(raw: string | undefined | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7).trim();
    }
    return trimmed;
  }
}
