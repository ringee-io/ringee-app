/**
 * Ringee's own vocabulary for inbound telephony events.
 *
 * Outbound commands have always gone through `TelephonyService`, but inbound
 * webhooks used to reach the domain as raw Telnyx payloads — the provider
 * abstraction was one-way. This is the other half: a carrier adapter translates
 * its webhooks into these shapes, and the domain switches on `TelephonyEventType`
 * rather than on a vendor's event names.
 *
 * The browser side has had this for a while (`@ringee/dialer-core`'s
 * `state-map.ts`); this is its server-side counterpart.
 *
 * Adding a carrier means writing a translator, not touching `CallService`.
 */

export type CallDirection = "inbound" | "outbound";

/** A custom SIP header as carriers report them. */
export interface TelephonyCustomHeader {
  name: string;
  value: string;
}

/**
 * Carrier-neutral event names.
 *
 * Several of these deliberately collapse provider variants — Telnyx's
 * `call.machine.premium.greeting.ended` is the same domain fact as
 * `call.machine.greeting.ended`, and the domain should not care which detection
 * tier an account is on. `unknown` is a normal outcome, not an error: a carrier
 * emits far more events than Ringee acts on, and they are logged and dropped.
 */
export type TelephonyEventType =
  | "call.initiated"
  | "call.answered"
  | "call.hangup"
  | "call.cost"
  | "call.recording.saved"
  | "call.recording.error"
  | "call.transcription"
  | "call.machine.detection.ended"
  | "call.machine.greeting.ended"
  | "call.playback.started"
  | "call.playback.ended"
  | "call.streaming.failed"
  | "call.conversation.ended"
  | "call.conversation.insights"
  | "unknown";

/** One analysis result produced for a finished AI conversation. */
export interface TelephonyConversationInsight {
  /** The provider's id for the insight definition that produced this result. */
  insightId: string;
  /** Free text, or a JSON string when the insight declares a schema. */
  result: string;
}

/**
 * The AI-conversation half of a call, lifted out of the provider payload.
 *
 * Present on `call.conversation.*` events and null everywhere else. It is
 * carried on the common event rather than read back out of `payload` because
 * two different provider events fill in different halves of it, and the domain
 * should not learn either shape.
 */
export interface TelephonyConversationDetails {
  /** Provider handle for the conversation this call produced. */
  conversationId: string | null;
  /** Provider handle for the assistant that ran it. */
  assistantId: string | null;
  /** Connected seconds as the provider measured them. */
  durationSec: number | null;
  /** Why the conversation ended, e.g. "customer_disconnect". */
  endReason: string | null;
  insightGroupId: string | null;
  insights: TelephonyConversationInsight[];
}

/**
 * A provider event, normalized.
 *
 * `payload` is the untouched provider body. It is still here because event
 * bodies differ far more than event names do (cost parts, recording URLs,
 * transcription segments), and normalizing all of that at once would be a
 * rewrite of the call lifecycle rather than a boundary. Read the normalized
 * fields where they exist; reach into `payload` only for the provider-shaped
 * details a handler genuinely needs.
 */
export interface TelephonyEvent<TPayload = unknown> {
  /** Carrier-neutral name. Switch on this. */
  type: TelephonyEventType;
  /** Which adapter produced this event. */
  provider: string;
  /** The provider's own event name — for logs, audit and unknown events. */
  providerEventType: string;
  /** Provider handle for the call leg. Events without one are not delivered. */
  callControlId: string;
  callSessionId: string | null;
  callLegId: string | null;
  /** Opaque state the dial attached to the leg, base64 as the provider sent it. */
  clientState: string | null;
  direction: CallDirection | null;
  from: string | null;
  to: string | null;
  /** When the provider emitted the event. */
  occurredAt: Date | null;
  /** When the call leg started, when the event reports it. */
  startedAt: Date | null;
  /**
   * Custom SIP headers carried on the leg. Ringee uses these to correlate a
   * browser-placed SDK leg with the `Call` row created at authorize time.
   */
  customHeaders: TelephonyCustomHeader[];
  /** Set on `call.conversation.*` events, null on every other event. */
  conversation: TelephonyConversationDetails | null;
  /** Untouched provider body. */
  payload: TPayload;
}
