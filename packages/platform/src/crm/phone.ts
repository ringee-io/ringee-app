const DIGITS_ONLY = /[^\d+]/g;

export function normalizePhoneE164(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[\s()\-\.]/g, "");
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(DIGITS_ONLY, "");
    if (digits.length < 6 || digits.length > 15) return null;
    return `+${digits}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return `+${digits}`;
}

export function phoneSuffix(e164: string, length = 9): string {
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-length);
}

export function phoneMatchesSuffix(a: string, b: string, length = 9): boolean {
  return phoneSuffix(a, length) === phoneSuffix(b, length);
}
