import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

/** Metadata key marking a handler as readable by org members despite OrgAdminGuard. */
export const ALLOW_ORG_MEMBER_KEY = "allowOrgMember";

/**
 * Escape hatch for `@OrgAdminOnly()` applied at the controller level: marks an
 * individual handler (typically a read endpoint) as still allowed for org
 * members. Use on member-readable GETs of an otherwise admin-only controller.
 */
export const AllowOrgMember = () => SetMetadata(ALLOW_ORG_MEMBER_KEY, true);

/**
 * Route guard for admin-only features.
 *
 * Mirrors the frontend `useOrgRole().canAccessAdminFeatures` rule:
 * - Users with NO active organization (freelancers) are unrestricted.
 * - Inside an organization, only `org:admin` may pass; `org:member` is denied,
 *   unless the handler is marked `@AllowOrgMember()`.
 *
 * Relies on `request.clerkOrgId` / `request.orgRole` being populated by the
 * global `ClerkAuthGuard` (which runs before route-scoped guards).
 */
@Injectable()
export class OrgAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowMember = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ORG_MEMBER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowMember) return true;

    const request = context.switchToHttp().getRequest();
    const hasOrg = !!request.clerkOrgId;
    if (!hasOrg) return true;
    if (request.orgRole === "org:admin") return true;
    throw new ForbiddenException(
      "This feature is restricted to organization admins",
    );
  }
}

/**
 * Convenience decorator: `@OrgAdminOnly()` on a controller or handler.
 */
export function OrgAdminOnly() {
  return applyDecorators(UseGuards(OrgAdminGuard));
}
