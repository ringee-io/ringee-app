/**
 * Whether the provider took an email. `ResendProvider.sendEmail` never throws:
 * it answers `{ error }` when Resend refused the message and `{ sent: false }`
 * when the call itself failed, so a caller that must not lose an email has to
 * read the answer instead of awaiting it.
 */
export function wasEmailAccepted(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  if ("sent" in result && result.sent === false) return false;
  if ("error" in result && result.error) return false;
  return true;
}
