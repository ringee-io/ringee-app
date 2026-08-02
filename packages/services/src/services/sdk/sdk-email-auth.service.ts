import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import {
  CustomIntegration,
  PrismaService,
  UserRepository,
} from "@ringee/database";
import {
  RedisService,
  ResendProvider,
  generateOtpCode,
  hashOtp,
  maskEmail,
  verifyOtp,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { SdkError } from "./sdk.errors";

/** Verified agent identity returned once the OTP checks out. */
export interface SdkVerifiedIdentity {
  userId: string;
  organizationId: string | null;
  email: string;
  role: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}

/** Generic, enumeration-safe response for start/resend. */
export interface SdkChallengeResponse {
  challengeId: string;
  expiresIn: number;
  maskedEmail: string;
  resendAvailableIn: number;
}

interface StoredChallenge {
  id: string;
  integrationId: string;
  origin: string;
  email: string;
  /** Present only when the email maps to an authorized agent. */
  userId?: string;
  organizationId?: string | null;
  role?: string | null;
  codeHash: string;
  attempts: number;
  resendCount: number;
  /** Whether this challenge can ever succeed (anti-enumeration decoy if false). */
  authorized: boolean;
  createdAt: number;
  lastSentAt: number;
  expiresAt: number;
}

const CHALLENGE_TTL_SECONDS = 300; // 5 min
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Rate-limit windows (per 10 min).
const RL_WINDOW = 600;
const RL_MAX_PER_IP = 15;
const RL_MAX_PER_EMAIL = 6;
const RL_MAX_PER_INTEGRATION = 200;

@Injectable()
export class SdkEmailAuthService {
  private readonly logger = new Logger(SdkEmailAuthService.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly redis: RedisService,
    private readonly users: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  private challengeKey(id: string): string {
    return `ringee:sdk:email-challenge:${id}`;
  }

  private emailHash(email: string): string {
    return createHash("sha256").update(email).digest("hex").slice(0, 24);
  }

  /**
   * Step 1: request a code. Always returns the same generic shape so a caller
   * cannot tell whether the email belongs to an authorized agent. An email is
   * only sent when the agent is genuinely authorized.
   */
  async start(params: {
    integration: CustomIntegration;
    origin: string;
    email: string;
    ip?: string | null;
  }): Promise<SdkChallengeResponse> {
    const email = params.email?.trim().toLowerCase() ?? "";
    if (!EMAIL_RE.test(email)) {
      throw new SdkError("INVALID_EMAIL", "A valid email is required.");
    }

    await this.enforceRateLimits(params.integration.id, email, params.ip);

    // Resolve authorization WITHOUT revealing the result to the caller.
    const identity = await this.resolveIdentity(params.integration, email);

    const challengeId = `ech_${randomBytes(18).toString("base64url")}`;
    const code = generateOtpCode();
    const now = Date.now();
    const challenge: StoredChallenge = {
      id: challengeId,
      integrationId: params.integration.id,
      origin: params.origin,
      email,
      userId: identity?.userId,
      organizationId: identity?.organizationId ?? null,
      role: identity?.role ?? null,
      codeHash: hashOtp(code, challengeId),
      attempts: 0,
      resendCount: 0,
      authorized: !!identity,
      createdAt: now,
      lastSentAt: now,
      expiresAt: now + CHALLENGE_TTL_SECONDS * 1000,
    };
    await this.redis.set(
      this.challengeKey(challengeId),
      challenge,
      CHALLENGE_TTL_SECONDS * 1000,
    );

    if (identity) {
      // Best-effort — a mail failure must not change the response shape.
      await this.sendCodeEmail(email, code, identity.firstName).catch((err) =>
        this.logger.error(
          `SDK OTP email failed for integration ${params.integration.id}`,
          err as Error,
        ),
      );
    }

    return {
      challengeId,
      expiresIn: CHALLENGE_TTL_SECONDS,
      maskedEmail: maskEmail(email),
      resendAvailableIn: RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * Step 2: verify a submitted code. On success the challenge is consumed and a
   * verified identity is returned for session minting.
   */
  async verify(params: {
    integration: CustomIntegration;
    origin: string;
    challengeId: string;
    code: string;
  }): Promise<SdkVerifiedIdentity> {
    const key = this.challengeKey(params.challengeId);
    const challenge = await this.redis.get<StoredChallenge>(key);

    if (
      !challenge ||
      challenge.integrationId !== params.integration.id ||
      challenge.origin !== params.origin
    ) {
      throw new SdkError(
        "EMAIL_CHALLENGE_EXPIRED",
        "This code request expired. Please request a new one.",
      );
    }
    if (challenge.expiresAt <= Date.now()) {
      await this.redis.del(key);
      throw new SdkError(
        "EMAIL_CHALLENGE_EXPIRED",
        "This code expired. Please request a new one.",
      );
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new SdkError(
        "EMAIL_CODE_ATTEMPTS_EXCEEDED",
        "Too many attempts. Please request a new code.",
      );
    }

    const code = (params.code ?? "").trim();
    const valid =
      challenge.authorized &&
      !!challenge.userId &&
      verifyOtp(code, challenge.id, challenge.codeHash);

    if (!valid) {
      const attempts = challenge.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await this.redis.del(key);
        throw new SdkError(
          "EMAIL_CODE_ATTEMPTS_EXCEEDED",
          "Too many attempts. Please request a new code.",
        );
      }
      const ttl = Math.max(
        1,
        Math.ceil((challenge.expiresAt - Date.now()) / 1000),
      );
      await this.redis.set(key, { ...challenge, attempts }, ttl * 1000);
      throw new SdkError("INVALID_EMAIL_CODE", "The code is incorrect.");
    }

    // Consume: one-time use.
    await this.redis.del(key);

    // Re-resolve to pick up any live change (block, membership removal) since
    // the challenge was created — never trust the cached authorization alone.
    const identity = await this.resolveIdentity(
      params.integration,
      challenge.email,
    );
    if (!identity) {
      throw new SdkError(
        "AGENT_NOT_ALLOWED",
        "This agent is no longer authorized.",
      );
    }
    return identity;
  }

  /** Re-send a code for an existing challenge, subject to a cooldown. */
  async resend(params: {
    integration: CustomIntegration;
    origin: string;
    challengeId: string;
    ip?: string | null;
  }): Promise<SdkChallengeResponse> {
    const key = this.challengeKey(params.challengeId);
    const challenge = await this.redis.get<StoredChallenge>(key);
    if (
      !challenge ||
      challenge.integrationId !== params.integration.id ||
      challenge.origin !== params.origin
    ) {
      throw new SdkError(
        "EMAIL_CHALLENGE_EXPIRED",
        "This code request expired. Please request a new one.",
      );
    }

    const now = Date.now();
    const sinceLast = (now - challenge.lastSentAt) / 1000;
    if (sinceLast < RESEND_COOLDOWN_SECONDS) {
      throw new SdkError(
        "RATE_LIMITED",
        "Please wait before requesting another code.",
      );
    }
    if (challenge.resendCount >= MAX_RESENDS) {
      throw new SdkError(
        "RATE_LIMITED",
        "Too many code requests. Please start over.",
      );
    }

    await this.enforceRateLimits(
      params.integration.id,
      challenge.email,
      params.ip,
    );

    // New code invalidates the previous one; window + attempts reset.
    const code = generateOtpCode();
    const updated: StoredChallenge = {
      ...challenge,
      codeHash: hashOtp(code, challenge.id),
      attempts: 0,
      resendCount: challenge.resendCount + 1,
      lastSentAt: now,
      expiresAt: now + CHALLENGE_TTL_SECONDS * 1000,
    };
    await this.redis.set(key, updated, CHALLENGE_TTL_SECONDS * 1000);

    if (challenge.authorized && challenge.userId) {
      const user = await this.users
        .findById(challenge.userId)
        .catch(() => null);
      await this.sendCodeEmail(
        challenge.email,
        code,
        user?.firstName ?? null,
      ).catch((err) =>
        this.logger.error("SDK OTP resend email failed", err as Error),
      );
    }

    return {
      challengeId: challenge.id,
      expiresIn: CHALLENGE_TTL_SECONDS,
      maskedEmail: maskEmail(challenge.email),
      resendAvailableIn: RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * Resolve the agent an email maps to for this integration, or `null` when it
   * is not authorized. Never throws for authorization failures (anti-enum) —
   * only for genuinely exceptional errors.
   *
   * - Personal integration (`organizationId === null`): only the integration
   *   owner may authenticate.
   * - Organization integration: the email must belong to a member of that org.
   * In both cases the user must exist, not be blocked, and have `canCall`.
   */
  private async resolveIdentity(
    integration: CustomIntegration,
    email: string,
  ): Promise<SdkVerifiedIdentity | null> {
    const user = await this.users.findByEmail(email).catch(() => null);
    if (!user) return null;
    if (user.blockedAt) return null;
    if (user.canCall === false) return null;

    if (!integration.organizationId) {
      // Personal integration: strictly the owner.
      if (user.id !== integration.userId) return null;
      return this.toIdentity(user, email, null, null);
    }

    // Organization integration: require an active membership.
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: integration.organizationId, userId: user.id },
      select: { role: true },
    });
    if (!membership) return null;
    return this.toIdentity(
      user,
      email,
      integration.organizationId,
      membership.role,
    );
  }

  private toIdentity(
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      imageUrl: string | null;
    },
    email: string,
    organizationId: string | null,
    role: string | null,
  ): SdkVerifiedIdentity {
    return {
      userId: user.id,
      organizationId,
      email,
      role,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
    };
  }

  private async enforceRateLimits(
    integrationId: string,
    email: string,
    ip?: string | null,
  ): Promise<void> {
    const checks: Array<Promise<number>> = [
      this.redis.incrementWithExpiry(
        `ringee:sdk:rl:email:${this.emailHash(email)}`,
        RL_WINDOW,
      ),
      this.redis.incrementWithExpiry(
        `ringee:sdk:rl:int:${integrationId}`,
        RL_WINDOW,
      ),
    ];
    if (ip) {
      checks.push(
        this.redis.incrementWithExpiry(`ringee:sdk:rl:ip:${ip}`, RL_WINDOW),
      );
    }
    const [emailCount, intCount, ipCount] = await Promise.all(checks);
    if (
      emailCount > RL_MAX_PER_EMAIL ||
      intCount > RL_MAX_PER_INTEGRATION ||
      (ipCount !== undefined && ipCount > RL_MAX_PER_IP)
    ) {
      throw new SdkError(
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
      );
    }
  }

  private async sendCodeEmail(
    email: string,
    code: string,
    firstName: string | null,
  ): Promise<void> {
    const greeting = firstName ? `Hi ${this.escapeHtml(firstName)},` : "Hi,";
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717; max-width: 480px;">
        <h2 style="margin: 0 0 12px;">Your Ringee verification code</h2>
        <p style="margin: 0 0 8px;">${greeting}</p>
        <p style="margin: 0 0 16px;">Use this code to start calling with Ringee:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 0; text-align: center; background: #f5f5f5; border-radius: 8px;">
          ${code}
        </div>
        <p style="margin: 16px 0 0; color: #737373; font-size: 13px;">
          This code expires in 5 minutes. If you didn't request it, you can ignore this email.
        </p>
      </div>`;
    await this.email.sendEmail(
      email,
      "Your Ringee verification code",
      html,
      apiConfiguration.EMAIL_FROM_NAME || "Ringee",
      apiConfiguration.EMAIL_FROM_ADDRESS,
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
