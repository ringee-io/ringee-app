import { apiServer } from '@ringee/frontend-shared/lib/api.server';

/**
 * Backoffice access, resolved by the API.
 *
 * The dashboard deliberately keeps NO copy of the allowlist. The backend's
 * `SuperAdminGuard` and this gate read the same source
 * (`BACKOFFICE_SUPER_ADMIN_EMAILS`), so they cannot drift — an earlier
 * hard-coded list on each side had already fallen out of sync.
 *
 * This is a UX gate only; the real enforcement is `SuperAdminGuard` on every
 * backoffice route.
 */
export async function fetchIsSuperAdmin(): Promise<boolean> {
  try {
    const res = await apiServer.get<{ isSuperAdmin: boolean }>(
      '/backoffice/access'
    );
    return !!res?.isSuperAdmin;
  } catch {
    // Fail closed: an unreachable API must not open the backoffice.
    return false;
  }
}
