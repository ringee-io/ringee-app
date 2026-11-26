import { Controller, Get, UseGuards } from "@nestjs/common";
import { Public } from "@ringee/platform";
import { CustomIntegrationApiKeyGuard } from "../guards/custom-integration-api-key.guard";
import { PublicApiRateLimitGuard } from "../guards/public-api-rate-limit.guard";

/**
 * Bumped when a capability below changes in a way an installed client has to
 * know about (never for an addition a client can ignore).
 */
export const PUBLIC_API_VERSION = 1;

/**
 * What this deployment's public API does (HOOK-011). A client that depends on
 * a guarantee asks for it here instead of assuming it from the route it can
 * reach, because the guarantee that matters most — `Idempotency-Key` on Start
 * Call — is the one an older deployment fails silently: it ignores the header
 * and dials again on every retry.
 */
export const PUBLIC_API_CAPABILITIES = {
  /** `GET /v1/ai-voice-agents/:id`. */
  agentDetail: true,
  /** `/v1/contacts`. */
  contacts: true,
  /** `/v1/calls`, including the recording. */
  calls: true,
  /**
   * Start Call honors `Idempotency-Key`: a repeat answers with the original
   * call, and a key whose first attempt failed before dialing is refused with
   * `409 idempotency_key_failed` instead of being answered as a success
   * (HOOK-008).
   */
  idempotentCalls: true,
  /**
   * Start Call may answer `202` with status `queued` when the call has to wait
   * for provider capacity, and `POST /v1/ai-voice-agents/calls/:id/cancel`
   * withdraws such a call. The statuses `queued`, `cancelled` and `expired`
   * exist; none of them has dialed anything (CPS-006).
   */
  queuedCalls: true,
} as const;

/**
 * A route an older deployment does not have answers `404`, which is how a
 * client learns that it cannot rely on any of the above.
 */
@Public()
@UseGuards(CustomIntegrationApiKeyGuard, PublicApiRateLimitGuard)
@Controller("v1/capabilities")
export class PublicCapabilitiesController {
  @Get()
  get() {
    return {
      apiVersion: PUBLIC_API_VERSION,
      capabilities: PUBLIC_API_CAPABILITIES,
    };
  }
}
