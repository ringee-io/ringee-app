import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import {
  CallSession,
  CallSessionAccessToken,
  CallSessionAccessTokenStatus,
  CallSessionRepository,
  CallSessionSource,
  CallSessionStatus,
} from "@ringee/database";

/**
 * Magic-link tokens. We mint a high-entropy opaque string (32 random bytes
 * encoded as URL-safe base64), return it once to the caller, and persist
 * only its SHA-256 hash. The token itself carries no session data — the
 * server resolves the session from the hashed lookup.
 */
@Injectable()
export class CallSessionAccessTokenService {
  constructor(private readonly repo: CallSessionRepository) {}

  /** SHA-256 of the raw token, hex-encoded. */
  static hash(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  /** Generate a fresh 256-bit opaque token, URL-safe base64. */
  private generateRawToken(): string {
    return randomBytes(32)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  async issueToken(params: {
    callSessionId: string;
    expiresAt: Date;
    createdByUserId?: string | null;
    createdBySource?: CallSessionSource;
  }): Promise<{ rawToken: string; token: CallSessionAccessToken }> {
    const rawToken = this.generateRawToken();
    const tokenHash = CallSessionAccessTokenService.hash(rawToken);

    const token = await this.repo.createAccessToken({
      callSession: { connect: { id: params.callSessionId } },
      tokenHash,
      expiresAt: params.expiresAt,
      createdByUserId: params.createdByUserId ?? null,
      createdBySource: params.createdBySource ?? CallSessionSource.api,
    });

    return { rawToken, token };
  }

  /**
   * Validate a raw token and return the underlying access-token row + session.
   * Throws UnauthorizedException for any failure mode (not found, expired,
   * revoked, session deleted). We deliberately return the same exception type
   * to avoid leaking which precise check failed.
   */
  async validateToken(rawToken: string): Promise<{
    accessToken: CallSessionAccessToken;
    session: CallSession;
  }> {
    if (!rawToken || rawToken.length < 16) {
      throw new UnauthorizedException("Invalid session link");
    }
    const hash = CallSessionAccessTokenService.hash(rawToken);
    const accessToken = await this.repo.findAccessTokenByHash(hash);
    if (!accessToken) {
      throw new UnauthorizedException("Invalid session link");
    }
    if (accessToken.status !== CallSessionAccessTokenStatus.active) {
      throw new UnauthorizedException("Session link is no longer active");
    }
    if (accessToken.expiresAt.getTime() <= Date.now()) {
      // Lazily mark as expired so future lookups short-circuit.
      await this.repo
        .updateAccessToken(accessToken.id, {
          status: CallSessionAccessTokenStatus.expired,
        })
        .catch(() => undefined);
      throw new UnauthorizedException("Session link has expired");
    }

    const session = await this.repo.findById(accessToken.callSessionId);
    if (!session || session.deletedAt) {
      throw new UnauthorizedException("Session is no longer available");
    }
    if (
      session.status === CallSessionStatus.revoked ||
      session.status === CallSessionStatus.expired
    ) {
      throw new UnauthorizedException("Session is no longer available");
    }

    return { accessToken, session };
  }

  async markUsed(tokenId: string): Promise<void> {
    await this.repo
      .updateAccessToken(tokenId, { lastUsedAt: new Date() })
      .catch(() => undefined);
  }

  async revokeForSession(sessionId: string): Promise<number> {
    return this.repo.revokeAccessTokensBySession(sessionId);
  }
}
