import { redactSensitiveText, sanitizeUrl } from "./sanitize";

/**
 * A last pass over an `$exception` event built by the SDK: source context
 * lines and local variables are dropped, messages and frame paths sanitized.
 */
export function scrubExceptionEvent<
  T extends { properties?: Record<string, unknown> },
>(event: T): T {
  const properties = { ...(event.properties ?? {}) };
  const list = properties.$exception_list;
  if (Array.isArray(list)) {
    properties.$exception_list = list.map((entry: unknown) => {
      if (!entry || typeof entry !== "object") return entry;
      const exception = { ...(entry as Record<string, unknown>) };
      if (typeof exception.value === "string") {
        exception.value = redactSensitiveText(exception.value);
      }
      const stacktrace = exception.stacktrace as
        | { frames?: unknown[] }
        | undefined;
      if (stacktrace && Array.isArray(stacktrace.frames)) {
        exception.stacktrace = {
          ...stacktrace,
          frames: stacktrace.frames.map((frame) => scrubFrame(frame)),
        };
      }
      return exception;
    });
  }
  for (const key of ["$current_url", "$pathname", "$referrer"]) {
    if (typeof properties[key] === "string") {
      properties[key] = sanitizeUrl(properties[key] as string);
    }
  }
  return { ...event, properties };
}

function scrubFrame(frame: unknown): unknown {
  if (!frame || typeof frame !== "object") return frame;
  const {
    context_line: _contextLine,
    pre_context: _preContext,
    post_context: _postContext,
    vars: _vars,
    ...rest
  } = frame as Record<string, unknown>;
  for (const key of ["filename", "abs_path"]) {
    const value = rest[key];
    if (typeof value === "string") rest[key] = value.replace(/\?.*$/, "");
  }
  return rest;
}
