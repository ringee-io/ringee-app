import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { apiConfiguration } from "@ringee/configuration";

/**
 * Validates the shared secret TriggerLoop attaches to every webhook call.
 * Kept simple intentionally: if TriggerLoop moves to HMAC-signed payloads,
 * swap the compare call for a signature verify — the surface stays the same.
 *
 * Fails closed. The controller is `@Public()`, so this guard is the ONLY thing
 * standing in front of an endpoint that executes actions (email, push
 * notifications, task creation) against named subjects. An unconfigured
 * `TRIGGERLOOP_WEBHOOK_SECRET` therefore rejects every request rather than
 * waving them through.
 */
@Injectable()
export class TriggerLoopWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const raw = req.headers["x-triggerloop-secret"];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (!provided) {
      throw new UnauthorizedException("Missing TriggerLoop secret");
    }

    const expected = apiConfiguration.TRIGGERLOOP_WEBHOOK_SECRET;
    if (!expected) {
      throw new UnauthorizedException(
        "TriggerLoop webhooks are not configured",
      );
    }

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid TriggerLoop secret");
    }

    return true;
  }
}
