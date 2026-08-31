/**
 * Reading an API failure back into something worth showing a person.
 *
 * `ApiError.message` is whatever the server put in `message`, and for a
 * validation failure that is an *array* — assigning it to `Error.message`
 * stringifies it into `"a,b,c"`. Everything here exists so a component never
 * has to know that: it asks for a sentence, or for the map of field errors.
 */

interface ApiErrorLike {
  status?: number;
  data?: unknown;
  message?: unknown;
}

/** One readable sentence for a toast or an alert. */
export function describeApiError(error: unknown, fallback: string): string {
  const body = (error as ApiErrorLike)?.data;
  const status = (error as ApiErrorLike)?.status;

  const fromBody = messageFrom(body);
  if (fromBody) return fromBody;

  const raw = (error as ApiErrorLike)?.message;
  const fromMessage = messageFrom(raw) ?? messageFrom({ message: raw });
  if (fromMessage) return fromMessage;

  if (status === 401 || status === 403) {
    return 'You do not have access to do that.';
  }
  if (status === 404) return 'That is no longer there.';
  if (status && status >= 500) {
    return 'Ringee could not complete that. Try again in a moment.';
  }
  return fallback;
}

/**
 * `path → sentence` for the fields the server rejected, as
 * `validationExceptionFactory` sends them. Paths are dotted and indexed
 * (`extractionFields.0.key`), matching what the client posted.
 */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  const body = (error as ApiErrorLike)?.data as
    | { fields?: Record<string, unknown> }
    | undefined;
  const fields = body?.fields;
  if (!fields || typeof fields !== 'object') return {};

  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(fields)) {
    if (typeof message === 'string') out[path] = message;
  }
  return out;
}

function messageFrom(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null;
  if (Array.isArray(body)) {
    const lines = body.filter((l): l is string => typeof l === 'string');
    return lines.length > 0 ? lines.join(' · ') : null;
  }
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const message = record.message;
  if (typeof message === 'string') {
    // Nest's own placeholders say nothing; the caller's fallback beats them.
    const generic = ['internal server error', 'http exception', 'bad request'];
    return generic.includes(message.trim().toLowerCase()) ? null : message;
  }
  if (Array.isArray(message)) {
    const lines = message.filter((l): l is string => typeof l === 'string');
    return lines.length > 0 ? lines.join(' · ') : null;
  }
  if (typeof record.error === 'string' && record.error !== 'Bad Request') {
    return record.error;
  }
  return null;
}
