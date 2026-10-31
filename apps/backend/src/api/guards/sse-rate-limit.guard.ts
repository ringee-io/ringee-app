import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { RedisService } from "@ringee/platform";
import type { Request, Response } from "express";
import { clientIp } from "../client-ip";

/** Stream opens one client address may make per window, across both routes. */
const MAX_OPENS_PER_IP = 600;
const WINDOW_SECONDS = 60;

/**
 * Bounds stream-open attempts on the public SSE routes before their ticket is
 * checked. Generous enough for an office behind one NAT reconnecting together.
 */
@Injectable()
export class SseRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SseRateLimitGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    let count: number;
    try {
      count = await this.redis.incrementWithExpiry(
        `ringee:sse:rl:ip:${clientIp(http.getRequest<Request>())}`,
        WINDOW_SECONDS,
      );
    } catch (error) {
      // Pacing only — the ticket is what admits a stream — so a Redis outage
      // must not take every live stream down with it.
      this.logger.warn(
        `SSE rate limit unavailable, allowing the stream: ${(error as Error).message}`,
      );
      return true;
    }
    if (count > MAX_OPENS_PER_IP) {
      http
        .getResponse<Response>()
        .setHeader("Retry-After", String(WINDOW_SECONDS));
      throw new HttpException(
        "Too many stream connections. Try again shortly.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
