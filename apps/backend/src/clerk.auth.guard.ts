import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "@ringee/platform";
import { getAuth } from "@clerk/express";
import { OrganizationService } from "@ringee/services";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly organizationService: OrganizationService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const { isAuthenticated, orgId, orgRole, userId } = getAuth(request);

    if (!isAuthenticated) {
      throw new UnauthorizedException("Unauthorized");
    }

    if (orgId) {
      const org = await this.organizationService.getByClerkId(orgId);

      if (!org) {
        throw new UnauthorizedException("Unauthorized");
      }

      request.clerkOrgId = org?.id;
      request.orgRole = orgRole || null;
    }

    request.clerkUserId = userId;

    return isAuthenticated;
  }
}
