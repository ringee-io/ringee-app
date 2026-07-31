import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";
import { apiConfiguration } from "@ringee/configuration";
import { RedisService } from "@ringee/platform";
import { UserAccessEnforcementService } from "./user-access-enforcement.service";

const KEY_PREFIX = "stripe-abuse:v1";
const WEBHOOK_DEDUP_SECONDS = 2 * 24 * 60 * 60;

export interface StripeFailureResult {
  shouldCancelIntent: boolean;
  userBlocked: boolean;
  ipBlocked: boolean;
}

@Injectable()
export class StripeAbuseProtectionService {
  private readonly logger = new Logger(StripeAbuseProtectionService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly userAccess: UserAccessEnforcementService,
  ) {}

  /**
   * Enforces creation velocity before Ringee mints a Stripe client secret or
   * hosted Checkout session. Returns a one-way IP fingerprint safe to attach to
   * Stripe metadata so signed failure webhooks can update the same IP counter.
   */
  async assertIntentCreationAllowed(
    request: Request,
    userId: string,
  ): Promise<string> {
    const ipHash = this.fingerprintRequestIp(request);
    const [userBlockTtl, ipBlockTtl, userBlockReason] = await Promise.all([
      this.blockTtl("user", userId),
      this.blockTtl("ip", ipHash),
      this.blockReason("user", userId),
    ]);

    if (userBlockTtl > 0 || ipBlockTtl > 0) {
      // Only a threshold of signed, webhook-confirmed card failures is strong
      // enough evidence to disable an account. A creation burst can be caused
      // by retries, navigation, or a flaky connection and is throttled only.
      if (userBlockTtl > 0 && userBlockReason === "card_failures") {
        await this.userAccess.banForPaymentAbuse(userId);
      }
      this.throwBlocked(Math.max(userBlockTtl, ipBlockTtl));
    }

    const windowSeconds = apiConfiguration.STRIPE_ABUSE_REQUEST_WINDOW_SECONDS;
    const [userCount, ipCount] = await Promise.all([
      this.redis.incrementWithExpiry(
        `${KEY_PREFIX}:requests:user:${userId}`,
        windowSeconds,
      ),
      this.redis.incrementWithExpiry(
        `${KEY_PREFIX}:requests:ip:${ipHash}`,
        windowSeconds,
      ),
    ]);

    const userExceeded =
      userCount > apiConfiguration.STRIPE_ABUSE_MAX_REQUESTS_PER_USER;
    const ipExceeded =
      ipCount > apiConfiguration.STRIPE_ABUSE_MAX_REQUESTS_PER_IP;

    if (userExceeded || ipExceeded) {
      await Promise.all([
        userExceeded
          ? this.block(
              "user",
              userId,
              "request_velocity",
              apiConfiguration.STRIPE_ABUSE_REQUEST_BLOCK_SECONDS,
            )
          : Promise.resolve(),
        ipExceeded
          ? this.block(
              "ip",
              ipHash,
              "request_velocity",
              apiConfiguration.STRIPE_ABUSE_REQUEST_BLOCK_SECONDS,
            )
          : Promise.resolve(),
      ]);
      this.logger.warn(
        `Stripe intent creation blocked for user=${userId}, ip=${ipHash.slice(0, 8)} (userLimit=${userExceeded}, ipLimit=${ipExceeded})`,
      );
      this.throwBlocked(apiConfiguration.STRIPE_ABUSE_REQUEST_BLOCK_SECONDS);
    }

    return ipHash;
  }

  /**
   * Counts an interactive card failure exactly once per signed Stripe event.
   * Automatic recurring/off-session failures must not call this method.
   */
  async recordFailedCardAttempt(params: {
    eventId: string;
    userId: string;
    ipHash?: string | null;
  }): Promise<StripeFailureResult> {
    const { eventId, userId, ipHash } = params;
    const firstDelivery = await this.redis.setIfAbsent(
      `${KEY_PREFIX}:webhook:${eventId}`,
      "1",
      WEBHOOK_DEDUP_SECONDS,
    );
    if (!firstDelivery) {
      return {
        shouldCancelIntent: false,
        userBlocked: false,
        ipBlocked: false,
      };
    }

    const [existingUserBlock, existingIpBlock, existingUserBlockReason] =
      await Promise.all([
        this.blockTtl("user", userId),
        ipHash ? this.blockTtl("ip", ipHash) : Promise.resolve(-2),
        this.blockReason("user", userId),
      ]);
    if (existingUserBlock > 0 || existingIpBlock > 0) {
      if (
        existingUserBlock > 0 &&
        existingUserBlockReason === "card_failures"
      ) {
        await this.userAccess.banForPaymentAbuse(userId);
      }
      return {
        shouldCancelIntent: true,
        userBlocked: existingUserBlock > 0,
        ipBlocked: existingIpBlock > 0,
      };
    }

    const windowSeconds = apiConfiguration.STRIPE_ABUSE_FAILURE_WINDOW_SECONDS;
    const [userFailures, ipFailures] = await Promise.all([
      this.redis.incrementWithExpiry(
        `${KEY_PREFIX}:failures:user:${userId}`,
        windowSeconds,
      ),
      ipHash
        ? this.redis.incrementWithExpiry(
            `${KEY_PREFIX}:failures:ip:${ipHash}`,
            windowSeconds,
          )
        : Promise.resolve(0),
    ]);

    const userBlocked =
      userFailures >= apiConfiguration.STRIPE_ABUSE_MAX_FAILURES_PER_USER;
    const ipBlocked =
      Boolean(ipHash) &&
      ipFailures >= apiConfiguration.STRIPE_ABUSE_MAX_FAILURES_PER_IP;

    if (userBlocked || ipBlocked) {
      await Promise.all([
        userBlocked
          ? this.block(
              "user",
              userId,
              "card_failures",
              apiConfiguration.STRIPE_ABUSE_BLOCK_SECONDS,
            )
          : Promise.resolve(),
        ipBlocked && ipHash
          ? this.block(
              "ip",
              ipHash,
              "card_failures",
              apiConfiguration.STRIPE_ABUSE_BLOCK_SECONDS,
            )
          : Promise.resolve(),
      ]);
      if (userBlocked) {
        await this.userAccess.banForPaymentAbuse(userId);
      }
      this.logger.warn(
        `Stripe card testing threshold reached for user=${userId}, ip=${ipHash?.slice(0, 8) ?? "unknown"} (userFailures=${userFailures}, ipFailures=${ipFailures}, userBlocked=${userBlocked}, ipBlocked=${ipBlocked})`,
      );
    }

    return {
      shouldCancelIntent: userBlocked || ipBlocked,
      userBlocked,
      ipBlocked,
    };
  }

  private fingerprintRequestIp(request: Request): string {
    // Railway documents X-Real-IP as the client address it sets at its edge.
    // Only trust it when Railway's own deployment marker is present; otherwise
    // a direct client could forge this header to rotate limiter identities.
    const railwayIp = process.env.RAILWAY_ENVIRONMENT_ID
      ? this.validIpHeader(request.headers["x-real-ip"])
      : null;
    const rawIp =
      railwayIp || request.ip || request.socket.remoteAddress || "unknown";
    const normalized = this.normalizeIp(rawIp);
    return createHmac("sha256", apiConfiguration.APP_ENCRYPTION_SECRET)
      .update(normalized)
      .digest("hex")
      .slice(0, 32);
  }

  private validIpHeader(value: string | string[] | undefined): string | null {
    const candidate = (Array.isArray(value) ? value[0] : value)
      ?.split(",")[0]
      ?.trim();
    if (!candidate) return null;
    const normalized = this.normalizeIp(candidate);
    return isIP(normalized) ? normalized : null;
  }

  private normalizeIp(value: string): string {
    return value
      .trim()
      .replace(/^::ffff:/, "")
      .replace(/%.+$/, "")
      .toLowerCase();
  }

  private blockKey(kind: "user" | "ip", identity: string): string {
    return `${KEY_PREFIX}:blocked:${kind}:${identity}`;
  }

  private async block(
    kind: "user" | "ip",
    identity: string,
    reason: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      this.blockKey(kind, identity),
      reason,
      ttlSeconds * 1000,
    );
  }

  private blockReason(
    kind: "user" | "ip",
    identity: string,
  ): Promise<string | undefined> {
    return this.redis.get<string>(this.blockKey(kind, identity));
  }

  private blockTtl(kind: "user" | "ip", identity: string): Promise<number> {
    return this.redis.ttlSeconds(this.blockKey(kind, identity));
  }

  private throwBlocked(retryAfterSeconds: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        message:
          "Payments are temporarily locked because too many attempts were detected. Try again later or contact support.",
        retryAfterSeconds: Math.max(retryAfterSeconds, 1),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
