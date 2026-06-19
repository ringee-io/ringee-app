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
 * Hard-coded fallback allowlist for the internal super-admin (backoffice) area.
 * Used when BACKOFFICE_SUPER_ADMIN_EMAILS is not set so the module works out of
 * the box. Keep in sync with the frontend list in
 * apps/frontend/src/features/backoffice/lib/super-admins.ts.
 */
export const DEFAULT_SUPER_ADMIN_EMAILS = [
  "edisonpadilla.dev@gmail.com",
  "ringee.io@gmail.com",
  "edisonjpp@gmail.com",
];

/** Resolve the effective allowlist (env override ∪ default), lower-cased. */
export function getSuperAdminEmails(): string[] {
  const raw = apiConfiguration.BACKOFFICE_SUPER_ADMIN_EMAILS;
  const fromEnv = raw
    ? raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return fromEnv.length > 0
    ? fromEnv
    : DEFAULT_SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase());
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

    const allowlist = getSuperAdminEmails();

    let emails: string[] = [];
    try {
      const clerkUser = await ClerkUserRepository.findById(clerkUserId);
      emails = clerkUser.emailAddresses
        // Only trust verified emails so an unverified alias can't impersonate.
        .filter((e) => e.verification?.status === "verified")
        .map((e) => e.emailAddress.toLowerCase());
    } catch {
      throw new ForbiddenException("Backoffice access denied");
    }

    const isSuperAdmin = emails.some((email) => allowlist.includes(email));
    if (!isSuperAdmin) {
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
