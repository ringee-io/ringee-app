import {
  INBOUND_EVENT_NAMES,
  INBOUND_EVENT_SPECS,
  type EventFieldSpec,
  type InboundEventName,
} from "./event-spec";

/**
 * Validation for the inbound half of the Public API.
 *
 * Driven by {@link INBOUND_EVENT_SPECS}, so the reference an integrator reads
 * and the rules their payload is judged by cannot drift apart: documenting a
 * field is what makes it accepted, and removing one is what makes it rejected.
 *
 * Everything here is pure. The caller validates a whole event before it writes
 * anything, which is what keeps a rejected payload from leaving a half-applied
 * contact behind in Ringee.
 */

/** A well-formed envelope — every field present and the event name known. */
export interface InboundEnvelope {
  event: InboundEventName;
  eventId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export type InboundEnvelopeResult =
  | { ok: true; envelope: InboundEnvelope }
  | { ok: false; errors: string[] };

export interface InboundDataIssues {
  /** Fatal: the event is not applied at all. */
  errors: string[];
  /** Applied anyway, but something the sender wrote had no effect. */
  warnings: string[];
}

/**
 * What a documented `type` string means to the validator. Anything unrecognized
 * is treated as a string, which is what every free-form label in the spec
 * ("string (ISO-8601)") describes.
 */
type FieldKind = "string" | "uuid" | "object" | "number";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many unknown field names a single warning lists before it summarizes. */
const MAX_LISTED_UNKNOWN_FIELDS = 10;

function fieldKind(type: string): FieldKind {
  const normalized = type.toLowerCase();
  if (normalized.startsWith("object")) return "object";
  if (normalized.startsWith("number")) return "number";
  if (normalized.includes("uuid")) return "uuid";
  return "string";
}

function describeKind(kind: FieldKind): string {
  switch (kind) {
    case "object":
      return "an object";
    case "number":
      return "a number";
    case "uuid":
      return "a UUID";
    default:
      return "a string";
  }
}

function matchesKind(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "uuid":
      return typeof value === "string" && UUID_PATTERN.test(value.trim());
    default:
      return typeof value === "string";
  }
}

/** `data.externalId` → `externalId`; anything else is not a `data` field. */
function dataKey(field: EventFieldSpec): string | null {
  return field.name.startsWith("data.")
    ? field.name.slice("data.".length)
    : null;
}

interface EventFieldIndex {
  required: Array<{ key: string; kind: FieldKind }>;
  optional: Array<{ key: string; kind: FieldKind }>;
  known: Set<string>;
}

const FIELD_INDEX: Record<string, EventFieldIndex> = Object.fromEntries(
  INBOUND_EVENT_SPECS.map((spec) => {
    const index = (fields: EventFieldSpec[]) =>
      fields
        .map((field) => {
          const key = dataKey(field);
          return key ? { key, kind: fieldKind(field.type) } : null;
        })
        .filter((entry): entry is { key: string; kind: FieldKind } => !!entry);

    const required = index(spec.requiredFields);
    const optional = index(spec.optionalFields);

    return [
      spec.name,
      {
        required,
        optional,
        known: new Set([...required, ...optional].map((entry) => entry.key)),
      },
    ];
  }),
);

export function isInboundEventName(value: unknown): value is InboundEventName {
  return (
    typeof value === "string" &&
    (INBOUND_EVENT_NAMES as readonly string[]).includes(value)
  );
}

/**
 * Check the shared envelope, reporting every problem at once.
 *
 * One round trip should be enough to learn everything wrong with a request —
 * an integrator fixing a payload one rejection at a time is the slowest way to
 * discover four missing fields.
 */
export function validateInboundEnvelope(body: unknown): InboundEnvelopeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }

  const envelope = body as Record<string, unknown>;
  const errors: string[] = [];

  const event = envelope.event;
  if (typeof event !== "string" || event.trim() === "") {
    errors.push("event is required");
  } else if (!isInboundEventName(event)) {
    errors.push(
      `Unsupported event: ${event}. Supported events: ${INBOUND_EVENT_NAMES.join(", ")}`,
    );
  }

  const eventId = envelope.eventId;
  if (typeof eventId !== "string" || eventId.trim() === "") {
    errors.push("eventId is required");
  }

  const occurredAt = envelope.occurredAt;
  if (typeof occurredAt !== "string" || occurredAt.trim() === "") {
    errors.push("occurredAt is required");
  }

  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push("data must be an object");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    envelope: {
      event: event as InboundEventName,
      eventId: (eventId as string).trim(),
      occurredAt: occurredAt as string,
      data: data as Record<string, unknown>,
    },
  };
}

/**
 * Check one event's `data` against its spec.
 *
 * A missing or mistyped **required** field is fatal. A mistyped optional field
 * is not: Ringee has always ignored those, and failing a whole contact sync
 * over a stray `null` would be a worse trade than syncing the rest. What
 * changes is that the sender is now told, instead of watching a field silently
 * vanish.
 *
 * The exception is an id: a malformed UUID is always fatal, because it changes
 * what the event *does* rather than what it stores — dropping it would quietly
 * skip the campaign the sender asked for.
 */
export function validateInboundEventData(
  event: InboundEventName,
  data: Record<string, unknown>,
): InboundDataIssues {
  const index = FIELD_INDEX[event];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!index) return { errors, warnings };

  for (const { key, kind } of index.required) {
    const value = data[key];
    if (value === undefined || value === null) {
      errors.push(`data.${key} is required`);
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      errors.push(`data.${key} is required`);
      continue;
    }
    if (!matchesKind(value, kind)) {
      errors.push(`data.${key} must be ${describeKind(kind)}`);
    }
  }

  for (const { key, kind } of index.optional) {
    const value = data[key];

    // Omitting a field and blanking it are the same request: leave it alone.
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    if (matchesKind(value, kind)) continue;

    if (kind === "uuid") {
      errors.push(`data.${key} must be ${describeKind(kind)}`);
    } else {
      warnings.push(
        `data.${key} was ignored: expected ${describeKind(kind)}, received ${typeName(value)}`,
      );
    }
  }

  const unknown = Object.keys(data).filter((key) => !index.known.has(key));
  if (unknown.length > 0) {
    warnings.push(
      `Unknown ${event} fields were ignored: ${summarize(unknown)}. Check them for typos.`,
    );
  }

  return { errors, warnings };
}

function typeName(value: unknown): string {
  if (Array.isArray(value)) return "an array";
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return "a string";
    case "number":
      return "a number";
    case "boolean":
      return "a boolean";
    case "object":
      return "an object";
    default:
      return typeof value;
  }
}

function summarize(names: string[]): string {
  if (names.length <= MAX_LISTED_UNKNOWN_FIELDS) return names.join(", ");
  const listed = names.slice(0, MAX_LISTED_UNKNOWN_FIELDS).join(", ");
  return `${listed} and ${names.length - MAX_LISTED_UNKNOWN_FIELDS} more`;
}
