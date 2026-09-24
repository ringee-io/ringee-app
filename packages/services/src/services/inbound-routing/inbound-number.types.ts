import type { NumberInboundMode } from "@ringee/database";
import type { InboundNumberRef } from "./inbound-routing.types";

/**
 * A called number, normalized across the two models Ringee stores numbers in
 * (`NumberPurchased` and `ExternalPhoneNumber`). The routing layer works on
 * this shape alone, which is what lets one resolver serve every carrier.
 */
export interface InboundNumberRecord {
  ref: InboundNumberRef;
  phoneNumber: string;
  /**
   * The workspace that owns the number — read off the number row, never from
   * anything a caller, a client or a carrier sent.
   */
  organizationId: string | null;
  /**
   * The number's own owner. A Ringee DID always has one; a BYOC DID belongs to
   * the organization and has none, so its call is attributed to the member the
   * destination names.
   */
  ownerUserId: string | null;
  /** Ringee DIDs only: the inbound mode that existed before routes did. */
  legacyMode: NumberInboundMode | null;
  /** The desk phone the number is pinned to, before routes existed. */
  legacySipDeviceId: string | null;
}
