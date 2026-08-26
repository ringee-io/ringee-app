import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { ClerkUserRepository } from "@ringee/platform";

/**
 * The one and only source of the backoffice allowlist: BACKOFFICE_SUPER_ADMIN_EMAILS.
 *
 * There is deliberately NO hard-coded fallback. Ringee is a public,
 * self-hostable repository, so a committed default list would make the upstream
 * maintainers super-admins of every deployment. An unset variable therefore
 * means "nobody has backoffice access here", which fails closed.
 *
 * The frontend does not keep its own copy — it asks `GET /api/backoffice/access`
 * (see BackofficeAccessController), so the UI gate and this guard can never
 * drift apart.
 */
export function getSuperAdminEmails(): string[] {
  const raw = apiConfiguration.BACKOFFICE_SUPER_ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verified emails of a Clerk user that appear in the allowlist.
 * Only verified addresses are trusted so an unverified alias cannot impersonate.
 */
export async function resolveSuperAdmin(clerkUserId: string): Promise<boolean> {
  const allowlist = getSuperAdminEmails();
  if (allowlist.length === 0) return false;

  try {
    const clerkUser = await ClerkUserRepository.findById(clerkUserId);
    return clerkUser.emailAddresses
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.toLowerCase())
      .some((email) => allowlist.includes(email));
  } catch {
    return false;
  }
}

/**
 * Route guard for the backoffice (super admin) area. Runs after the global
 * `ClerkAuthGuard` (which populates `request.clerkUserId`). Resolves the Clerk
 * user's verified email addresses and only allows requests whose email is in
 * the allowlist. The frontend email gate is UX only — this is the real
 * enforcement.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clerkUserId: string | undefined = request.clerkUserId;

    if (!clerkUserId) {
      throw new UnauthorizedException("No authenticated user in request");
    }

    if (!(await resolveSuperAdmin(clerkUserId))) {
      throw new ForbiddenException("Backoffice access denied");
    }

    request.isSuperAdmin = true;
    return true;
  }
}

/** Convenience decorator: `@SuperAdminOnly()` on a controller or handler. */
export function SuperAdminOnly() {
  return applyDecorators(UseGuards(SuperAdminGuard));
}
