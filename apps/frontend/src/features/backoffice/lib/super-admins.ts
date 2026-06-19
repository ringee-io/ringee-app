/**
 * Email allowlist for the internal super-admin (backoffice) area. This is the
 * UX gate only — real enforcement is the backend SuperAdminGuard. Keep in sync
 * with DEFAULT_SUPER_ADMIN_EMAILS in
 * apps/backend/src/api/guards/super-admin.guard.ts.
 */
export const SUPER_ADMIN_EMAILS = [
  'edisonpadilla.dev@gmail.com',
  'ringee.io@gmail.com',
  'edisonjpp@gmail.com',
  'publica.do.oficial@gmail.com',
  "edison.padilla@coderio.com"
];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

/** True when any of the given emails is in the allowlist. */
export function hasSuperAdminEmail(
  emails: (string | null | undefined)[]
): boolean {
  return emails.some((e) => isSuperAdminEmail(e));
}
