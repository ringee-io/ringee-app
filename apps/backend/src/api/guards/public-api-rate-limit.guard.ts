import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { RedisService } from "@ringee/platform";
import type { Response } from "express";
import type { CustomIntegrationApiRequest } from "./custom-integration-api-key.guard";

/** Requests one integration may make per window, across every public route. */
export const PUBLIC_API_MAX_REQUESTS = 600;
export const PUBLIC_API_WINDOW_SECONDS = 60;

/**
 * Paces the server-to-server public API per integration (HOOK-006).
 *
 * It runs after `CustomIntegrationApiKeyGuard`, so the bucket is the
 * authenticated integration and never anything the client sent: one noisy
 * workflow cannot starve another workspace, and rotating IPs buys nothing. The
 * limit is generous — a workflow looping over a few thousand contacts stays
 * inside it — and a refusal says when to come back, which the n8n node honors.
 *
 * This is pacing, not authorization, so a Redis outage lets the request
 * through instead of taking the API down with it.
 */
@Injectable()
export class PublicApiRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PublicApiRateLimitGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const integrationId =
      http.getRequest<CustomIntegrationApiRequest>().customIntegrationAuth
        ?.integration.id;
    // Misordered guards must fail closed, not run an unauthenticated request.
    if (!integrationId) throw new UnauthorizedException();

    let count: number;
    try {
      count = await this.redis.incrementWithExpiry(
        `ringee:public-api:rl:${integrationId}`,
        PUBLIC_API_WINDOW_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Public API rate limit unavailable, allowing the request: ${(error as Error).message}`,
      );
      return true;
    }

    if (count > PUBLIC_API_MAX_REQUESTS) {
      http
        .getResponse<Response>()
        .setHeader("Retry-After", String(PUBLIC_API_WINDOW_SECONDS));
      throw new HttpException(
        "Too many requests for this integration. Retry after the number of seconds in the Retry-After header.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
