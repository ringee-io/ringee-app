import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { assertVoiceAgentAccess } from "@ringee/services";

/**
 * Route guard for the authenticated AI Voice Agents API.
 *
 * The global Clerk guard resolves the active organization before this guard
 * runs. Provider-facing webhook and tool controllers stay separate: an
 * authenticated callback for an existing call must continue to work.
 */
@Injectable()
export class VoiceAgentOrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clerkUserId: string | undefined = request.clerkUserId;

    if (!clerkUserId) {
      throw new UnauthorizedException("No authenticated user in request");
    }

    assertVoiceAgentAccess({
      organizationId: request.clerkOrgId ?? null,
    });
    return true;
  }
}
