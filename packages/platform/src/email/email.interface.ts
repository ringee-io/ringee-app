/**
 * One email, as the explicit send path takes it.
 *
 * Every field is honored exactly as given — no reply-to is substituted and no
 * recipient is added — because the callers of this path have already decided
 * who may read the message and who answers it (a meeting confirmation, AGENT-020).
 */
export interface EmailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromAddress?: string;
  replyTo?: string | string[];
  /** Extra headers, e.g. `In-Reply-To` / `References` to thread a follow-up. */
  headers?: Record<string, string>;
  /**
   * Provider-side de-duplication. The provider honors it for a limited window
   * only (a day for Resend), so a durable caller keeps its own record too and
   * never relies on this alone.
   */
  idempotencyKey?: string;
}

/**
 * Whether the provider took an email, said explicitly.
 *
 * `retryable` is the one fact a durable caller needs on a refusal: a transport
 * failure or a rate limit may succeed later, a malformed address never will.
 */
export type EmailSendResult =
  | { accepted: true; providerEmailId: string | null }
  | { accepted: false; error: string; retryable: boolean };

export interface EmailInterface {
  name: string;
  validateEnvKeys: string[];
  /**
   * The original, best-effort send. Kept exactly as existing consumers rely on
   * it: it never throws, and it answers `{ sent: false }` or `{ error }` rather
   * than a typed result (see `wasEmailAccepted`). Its `replyTo` argument is not
   * applied — several callers pass other addresses in that slot — so a caller
   * that needs a specific Reply-To uses `send` instead.
   */
  sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    emailFromName?: string,
    emailFromAddress?: string,
    replyTo?: string,
    cc?: string | string[],
    bcc?: string | string[],
  ): Promise<any>;
  /** The explicit send. Never throws; the result says what happened. */
  send(message: EmailMessage): Promise<EmailSendResult>;
  /**
   * The RFC 5322 Message-ID the provider assigned to an accepted email, which
   * a later email threads under with `In-Reply-To`/`References`. Null when the
   * provider does not report it (yet) — never a guess.
   */
  getMessageId(providerEmailId: string): Promise<string | null>;
}
