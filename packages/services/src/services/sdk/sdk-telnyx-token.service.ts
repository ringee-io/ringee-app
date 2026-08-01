import { Injectable } from "@nestjs/common";
import { TelephonyService } from "@ringee/platform";

/**
 * Mints the short-lived Telnyx WebRTC credential the SDK uses to place calls.
 *
 * This is a thin pass-through to the SAME `createTelephonyCredential` the web
 * app and extension use — it returns an ephemeral SIP login/password (~1h TTL),
 * never a permanent credential. The public SDK keeps this in memory only and
 * never exposes it. Naming note: the public API calls this the "telnyxToken";
 * the transport is a SIP credential, not a JWT.
 */
export interface SdkTelnyxCredential {
  sipUsername: string;
  sipPassword: string;
  expiresAt: string;
  connectionId: string;
}

@Injectable()
export class SdkTelnyxTokenService {
  constructor(private readonly telephony: TelephonyService) {}

  issue(userId: string): Promise<SdkTelnyxCredential> {
    return this.telephony.createTelephonyCredential(userId, "sdk-webrtc");
  }
}
