import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { assertVoiceAgentAccess } from "@ringee/services";

/**
 * Route guard for the authenticated AI Voice Agents API (AGENT-011).
 *
 * It asks the one access policy (`voiceAgentAccess`) about the authenticated
 * workspace: the organization the global Clerk guard resolved, or — with no
 * active organization — the caller's own personal workspace, identified by the
 * Ringee user id from the auth layer, never by anything the client sends.
 * Services repeat the same rule for every operation; this guard also covers
 * catalogue and credential routes that need no ownership context of their own.
 *
 * Provider-facing webhook and tool controllers stay separate: an authenticated
 * callback for an existing call must continue to work.
 */
@Injectable()
export class VoiceAgentAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clerkUserId: string | undefined = request.clerkUserId;

    if (!clerkUserId) {
      throw new UnauthorizedException("No authenticated user in request");
    }

    const organizationId: string | null = request.clerkOrgId ?? null;
    // An organization's answer needs no user; a personal workspace's is its
    // owner's enrollment, so only then is the Ringee user resolved.
    assertVoiceAgentAccess(
      organizationId
        ? { organizationId }
        : { userId: await ringeeUserIdOf(request), organizationId: null },
    );
    return true;
  }
}

async function ringeeUserIdOf(request: {
  resolveRingeeUser?: () => Promise<{ ringeeUserId?: string }>;
}): Promise<string> {
  const resolved =
    typeof request.resolveRingeeUser === "function"
      ? await request.resolveRingeeUser()
      : null;
  if (!resolved?.ringeeUserId) {
    throw new UnauthorizedException("No authenticated user in request");
  }
  return resolved.ringeeUserId;
}
