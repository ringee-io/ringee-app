/**
 * The voice provider's published per-minute list price for an agent
 * conversation, before Ringee's margin.
 *
 * This is for **quoting only** — the public pricing pages. Billing never reads
 * it: an agent call is settled from the provider's own usage records, so a
 * call is charged what the provider actually metered (BILL-020). When the
 * provider changes its list price, update this and regenerate the public
 * pricing snapshot.
 *
 * Source: telnyx.com/pricing/voice-ai (checked 2026-09-15).
 */
export const VOICE_AGENT_LIST_PRICE_PER_MINUTE_USD = {
  /** Conversation engine: orchestration, speech-to-text and text-to-speech. */
  engine: 0.05,
  /**
   * Typical token cost of the provider-hosted "Ringee AI" model. A
   * bring-your-own-key model bills to the customer's own account instead.
   */
  hostedModel: 0.004,
} as const;
