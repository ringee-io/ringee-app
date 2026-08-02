import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { SdkSessionService } from "@ringee/services";

/**
 * Authenticates SDK calls that require a verified agent. Reads the bearer
 * session and `Origin`, re-validates the agent live (integration active, user
 * not blocked, still a member, `canCall`), and attaches the result to
 * `req.sdkAgent`. Controllers using this guard must also be `@Public()` so the
 * global Clerk guard steps aside.
 */
@Injectable()
export class SdkSessionGuard implements CanActivate {
  constructor(private readonly sessions: SdkSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const agent = await this.sessions.authenticate(
      req.headers?.authorization,
      req.headers?.origin,
    );
    req.sdkAgent = agent;
    return true;
  }
}
