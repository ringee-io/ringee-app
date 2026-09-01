import { Injectable } from "@nestjs/common";
import type {
  CallDirection,
  TelephonyConversationDetails,
  TelephonyConversationInsight,
  TelephonyCustomHeader,
  TelephonyEvent,
  TelephonyEventType,
} from "../interfaces/telephony.event";
import type { TelnyxWebhookEvent } from "./telnyx.webhook.types";

/**
 * Telnyx → Ringee event translation. The single place Telnyx's inbound
 * vocabulary is understood; everything downstream speaks `TelephonyEventType`.
 */

/**
 * Note the two collapses:
 *  - `call.machine.premium.greeting.ended` folds into
 *    `call.machine.greeting.ended`. It is the same domain fact on a different
 *    detection tier, and handlers previously had to list both.
 *  - `streaming.failed` becomes `call.streaming.failed`, so every event Ringee
 *    acts on is namespaced under the call it belongs to.
 */
const TELNYX_EVENT_MAP: Record<string, TelephonyEventType> = {
  "call.initiated": "call.initiated",
  "call.answered": "call.answered",
  "call.hangup": "call.hangup",
  "call.cost": "call.cost",
  "call.recording.saved": "call.recording.saved",
  "call.recording.error": "call.recording.error",
  "call.transcription": "call.transcription",
  "call.machine.detection.ended": "call.machine.detection.ended",
  "call.machine.greeting.ended": "call.machine.greeting.ended",
  "call.machine.premium.greeting.ended": "call.machine.greeting.ended",
  "call.playback.started": "call.playback.started",
  "call.playback.ended": "call.playback.ended",
  "streaming.failed": "call.streaming.failed",
  "call.conversation.ended": "call.conversation.ended",
  "call.conversation_insights.generated": "call.conversation.insights",
};

/** Telnyx reports `inbound`/`incoming` and `outbound`/`outgoing`. */
function normalizeDirection(raw: unknown): CallDirection | null {
  if (typeof raw !== "string") return null;
  const value = raw.toLowerCase();
  if (value === "inbound" || value === "incoming") return "inbound";
  if (value === "outbound" || value === "outgoing") return "outbound";
  return null;
}

function normalizeDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw ? raw : null;
}

function num(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Telnyx reports insights as `{ insight_id, result }`. Entries without an id
 * cannot be mapped back to the field that asked for them, so they are dropped
 * rather than guessed at.
 */
function normalizeInsights(raw: unknown): TelephonyConversationInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const row = entry as { insight_id?: unknown; result?: unknown };
    const insightId = str(row?.insight_id);
    if (!insightId) return [];
    const result =
      typeof row.result === "string" ? row.result : JSON.stringify(row.result);
    return [{ insightId, result }];
  });
}

/**
 * The two AI-conversation events fill in different halves of the same fact:
 * `call.conversation.ended` carries the conversation and its duration,
 * `call.conversation_insights.generated` carries the analysis results. Both
 * normalize into one shape so the domain reads a single field.
 */
function normalizeConversation(
  type: TelephonyEventType,
  payload: Record<string, unknown>,
): TelephonyConversationDetails | null {
  if (
    type !== "call.conversation.ended" &&
    type !== "call.conversation.insights"
  ) {
    return null;
  }
  return {
    conversationId: str(payload.conversation_id),
    assistantId: str(payload.assistant_id),
    durationSec: num(payload.duration_sec),
    endReason: str(payload.reason),
    insightGroupId: str(payload.insight_group_id),
    insights: normalizeInsights(payload.results),
  };
}

/**
 * Telnyx delivers custom headers as `{ name, value }` objects. SIP header names
 * are case-insensitive, so consumers compare lower-cased — the values are
 * passed through untouched.
 */
function normalizeCustomHeaders(raw: unknown): TelephonyCustomHeader[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const name = str((entry as { name?: unknown })?.name);
    const value = (entry as { value?: unknown })?.value;
    return name && typeof value === "string" ? [{ name, value }] : [];
  });
}

@Injectable()
export class TelnyxEventNormalizer {
  /**
   * Returns `null` when the event carries no `call_control_id` — there is no
   * call to act on, so it cannot be routed and is dropped by the caller.
   */
  normalize(event: TelnyxWebhookEvent): TelephonyEvent | null {
    const payload = (event?.payload ?? {}) as unknown as Record<
      string,
      unknown
    >;
    const callControlId = str(payload.call_control_id);
    if (!callControlId) return null;

    const providerEventType = event.event_type ?? "";
    const type = TELNYX_EVENT_MAP[providerEventType] ?? "unknown";

    return {
      type,
      provider: "telnyx",
      providerEventType,
      callControlId,
      callSessionId: str(payload.call_session_id),
      callLegId: str(payload.call_leg_id),
      clientState: str(payload.client_state),
      direction: normalizeDirection(payload.direction),
      from: str(payload.from),
      to: str(payload.to),
      // The envelope's `occurred_at` is required and is the provider's own
      // event time; the payload fields are per-event and often absent, so
      // reading them first silently dropped the timestamp.
      occurredAt:
        normalizeDate(event?.occurred_at) ??
        normalizeDate(payload.occurred_at) ??
        normalizeDate(payload.start_time),
      startedAt: normalizeDate(payload.start_time),
      customHeaders: normalizeCustomHeaders(payload.custom_headers),
      conversation: normalizeConversation(type, payload),
      payload,
    };
  }
}
