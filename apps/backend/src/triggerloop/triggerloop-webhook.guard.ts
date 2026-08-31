import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { apiConfiguration } from "@ringee/configuration";

/** Header TriggerLoop sends its API key in on every webhook call. */
const API_KEY_HEADER = "x-triggerloop-api-key";

/**
 * Validates the TriggerLoop API key attached to every webhook call.
 *
 * It is the same `TRIGGERLOOP_API_KEY` this backend sends when it calls into
 * TriggerLoop, so the loop runs on one shared credential per project rather
 * than a separate inbound secret that can drift out of sync.
 *
 * Kept simple intentionally: if TriggerLoop moves to HMAC-signed payloads,
 * swap the compare call for a signature verify — the surface stays the same.
 *
 * Fails closed. The controller is `@Public()`, so this guard is the ONLY thing
 * standing in front of an endpoint that executes actions (email, push
 * notifications, task creation) against named subjects. An unconfigured
 * `TRIGGERLOOP_API_KEY` therefore rejects every request rather than waving
 * them through.
 */
@Injectable()
export class TriggerLoopWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const raw = req.headers[API_KEY_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (!provided) {
      throw new UnauthorizedException("Missing TriggerLoop API key");
    }

    const expected = apiConfiguration.TRIGGERLOOP_API_KEY;
    if (!expected) {
      throw new UnauthorizedException(
        "TriggerLoop webhooks are not configured",
      );
    }

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid TriggerLoop API key");
    }

    return true;
  }
}
