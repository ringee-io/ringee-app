import { HttpException } from "@nestjs/common";

/**
 * Turns a thrown provider error into a sentence a user can act on.
 *
 * `TelnyxClient.handleError` rethrows the provider's JSON body as an
 * `HttpException`. Nest only copies a *string* response onto `.message`, so an
 * object body leaves `error.message` as the literal `"Http Exception"` — which
 * is what ends up stored on a row or shown in a toast if a caller reads
 * `.message` directly. The real detail is in the body: Telnyx replies with
 * `{ errors: [{ title, detail, source }] }`.
 *
 * Every caller that stores or surfaces a provider failure goes through here, so
 * "why did this fail" reads the same in a log line, on an agent row and in the
 * UI.
 */
export function describeTelnyxError(error: unknown, fallback: string): string {
  const detail = extractDetail(error);
  return detail?.trim() || fallback;
}

function extractDetail(error: unknown): string | null {
  if (error instanceof HttpException) {
    return fromBody(error.getResponse()) ?? nonGenericMessage(error.message);
  }
  if (error instanceof Error) return nonGenericMessage(error.message);
  if (typeof error === "string") return error;
  return fromBody(error);
}

/** Telnyx's error envelope, plus the shapes Nest wraps around it. */
function fromBody(body: unknown): string | null {
  if (typeof body === "string") return nonGenericMessage(body);
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors
      .map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        const text = item.detail ?? item.title;
        if (typeof text !== "string") return null;
        const pointer = (item.source as { pointer?: string } | undefined)
          ?.pointer;
        const field = pointer ? pointer.replace(/^\//, "") : null;
        return field ? `${field}: ${text}` : text;
      })
      .filter((text): text is string => Boolean(text));
    if (messages.length > 0) return messages.join(" · ");
  }

  const message = record.message;
  if (typeof message === "string") return nonGenericMessage(message);
  if (Array.isArray(message)) {
    const lines = message.filter(
      (line): line is string => typeof line === "string",
    );
    if (lines.length > 0) return lines.join(" · ");
  }

  return null;
}

/**
 * `"Http Exception"` and `"Internal server error"` are Nest's own placeholders.
 * Treating them as a description is how an unhelpful error reaches a user, so
 * they are discarded in favour of the caller's fallback.
 */
function nonGenericMessage(message: string | undefined): string | null {
  if (!message) return null;
  const generic = new Set([
    "http exception",
    "internal server error",
    "bad gateway",
    "request failed with status code",
  ]);
  const normalized = message.trim().toLowerCase();
  if (generic.has(normalized)) return null;
  if (normalized.startsWith("request failed with status code")) return null;
  return message;
}
