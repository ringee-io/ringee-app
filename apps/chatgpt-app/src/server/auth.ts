import type { IncomingMessage } from "node:http";

/**
 * OAuth 2.1 surface for the ChatGPT App MCP server (RFC 9728 + MCP auth).
 *
 * Auth is OPT-IN so local development works without it. Enable it for
 * production by setting RINGEE_REQUIRE_AUTH=true plus your identity provider's
 * details. When enabled:
 *   - GET /.well-known/oauth-protected-resource advertises the auth server,
 *   - unauthenticated /mcp requests get 401 + WWW-Authenticate (which makes
 *     ChatGPT discover the metadata and run the OAuth flow),
 *   - each request's Bearer token is verified against the provider's JWKS.
 *
 * Signature verification uses `jose`, imported lazily so it's only required
 * when auth is on. Install it for production: `pnpm add jose`.
 */

export interface AuthConfig {
  enabled: boolean;
  /** Canonical public URL of THIS MCP server (the "resource"). */
  resource: string;
  /** Authorization server issuer URL(s). */
  authorizationServers: string[];
  jwksUrl?: string;
  audience?: string;
  issuer?: string;
  scopes: string[];
  /**
   * Multi-tenant identity mapping. The verified access token must carry the
   * caller's Ringee userId (and optionally organizationId) so the server can
   * act on behalf of the right account. These name the JWT claims that hold
   * those ids — configure your IdP (e.g. a Clerk JWT template) to emit them.
   */
  userIdClaim: string;
  orgIdClaim: string;
}

export function getAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfig {
  const enabled = env.RINGEE_REQUIRE_AUTH === "true";
  const resource = (env.RINGEE_PUBLIC_URL || "http://localhost:4250").replace(
    /\/+$/,
    "",
  );
  const issuer = env.RINGEE_OAUTH_ISSUER;
  return {
    enabled,
    resource,
    authorizationServers: issuer ? [issuer.replace(/\/+$/, "")] : [],
    jwksUrl: env.RINGEE_OAUTH_JWKS_URL,
    audience: env.RINGEE_OAUTH_AUDIENCE || resource,
    issuer,
    scopes: (env.RINGEE_OAUTH_SCOPES || "ringee:use").split(/[ ,]+/).filter(Boolean),
    userIdClaim: env.RINGEE_OAUTH_USER_ID_CLAIM || "ringee_user_id",
    orgIdClaim: env.RINGEE_OAUTH_ORG_ID_CLAIM || "ringee_org_id",
  };
}

export function resourceMetadataUrl(cfg: AuthConfig): string {
  return `${cfg.resource}/.well-known/oauth-protected-resource`;
}

/** RFC 9728 protected-resource metadata document. */
export function buildProtectedResourceMetadata(cfg: AuthConfig) {
  return {
    resource: cfg.resource,
    authorization_servers: cfg.authorizationServers,
    scopes_supported: cfg.scopes,
    bearer_methods_supported: ["header"],
  };
}

export function wwwAuthenticate(cfg: AuthConfig): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(cfg)}", scope="${cfg.scopes.join(" ")}"`;
}

export function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header)) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]! : null;
}

export interface VerifiedToken {
  sub?: string;
  scope?: string;
  [claim: string]: unknown;
}

/**
 * Verify an access token's signature and claims against the configured JWKS.
 * Throws on any failure (caller maps that to a 401 challenge).
 */
export async function verifyAccessToken(
  token: string,
  cfg: AuthConfig,
): Promise<VerifiedToken> {
  if (!cfg.jwksUrl || !cfg.issuer) {
    throw new Error(
      "Auth is enabled but RINGEE_OAUTH_JWKS_URL / RINGEE_OAUTH_ISSUER are not set.",
    );
  }
  // Lazy import so `jose` is only needed when auth is enabled. Typed with a
  // minimal local interface so the optional dependency isn't required to build.
  interface JoseLike {
    createRemoteJWKSet: (url: URL) => unknown;
    jwtVerify: (
      token: string,
      key: unknown,
      opts: { issuer?: string; audience?: string },
    ) => Promise<{ payload: Record<string, unknown> }>;
  }
  const jose = (await import("jose" as string).catch(() => {
    throw new Error("Missing dependency `jose`. Run `pnpm add jose` to enable auth.");
  })) as JoseLike;

  const JWKS = jose.createRemoteJWKSet(new URL(cfg.jwksUrl));
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: cfg.issuer,
    audience: cfg.audience,
  });
  return payload as VerifiedToken;
}

/** The Ringee account a verified token resolves to. */
export interface RingeeIdentity {
  userId: string;
  organizationId?: string;
}

/**
 * Map a verified token's claims to the Ringee account it should act as.
 * Returns null when the token carries no Ringee userId claim (the caller
 * decides whether to fall back to an env-configured account or reject).
 */
export function resolveRingeeIdentity(
  payload: VerifiedToken,
  cfg: AuthConfig,
): RingeeIdentity | null {
  const claim = (name: string): string | undefined => {
    const value = payload[name];
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const userId = claim(cfg.userIdClaim);
  if (!userId) return null;

  return { userId, organizationId: claim(cfg.orgIdClaim) };
}
