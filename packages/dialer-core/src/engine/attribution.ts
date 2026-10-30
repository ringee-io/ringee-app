/**
 * Pure call-attribution helpers — deliberately free of any `@telnyx/webrtc`
 * import so they can run in plain Node (tests) and be shared without dragging
 * the WebRTC SDK into non-call contexts.
 */
export interface CallAttribution {
  callerId: string;
  userId: string;
  organizationId?: string;
  /**
   * The server-signed authorization the dial's pre-flight returned. When
   * present it is what the server attributes the call by; the user and
   * organization headers are only read from clients that do not send it.
   */
  dialToken?: string;
}

/** The SIP header carrying {@link CallAttribution.dialToken}. */
export const DIAL_TOKEN_HEADER = "X-Ringee-Dial-Token";

/**
 * Build the SIP custom headers that attribute a call to a user/org and present
 * the resolved caller ID. Shared so call records land identically whether the
 * call came from the web app or the extension.
 */
export function buildCallHeaders(
  attribution: CallAttribution,
): { name: string; value: string }[] {
  const { callerId, userId, organizationId, dialToken } = attribution;
  const sip = `sip:${callerId}@sip.telnyx.com`;
  return [
    { name: "From", value: sip },
    { name: "P-Asserted-Identity", value: sip },
    { name: "P-Preferred-Identity", value: sip },
    { name: "X-User-Id", value: userId },
    ...(organizationId
      ? [{ name: "X-Organization-Id", value: organizationId }]
      : []),
    ...(dialToken ? [{ name: DIAL_TOKEN_HEADER, value: dialToken }] : []),
  ];
}
