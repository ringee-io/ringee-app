import {
  createTelnyxClient,
  placeCall,
  muteCall,
  holdCall,
  hangupCall,
  sendDtmf,
  onCallUpdate,
  mapTelnyxState,
  TELNYX_EVENTS,
  type Call,
} from "@ringee/dialer-core/engine";
import { mapEngineState } from "./telnyx-state-mapper";
import { RingeeError } from "../errors";
import type { DialerState } from "../types";

export interface TelnyxCredential {
  sipUsername: string;
  sipPassword: string;
  expiresAt: string;
  connectionId: string;
}

export interface PlaceCallParams {
  destination: string;
  callerId: string;
  userId: string;
  organizationId?: string;
  /** Signed correlation token echoed as `X-Ringee-Call-Id`. */
  correlationToken: string;
}

export interface TelnyxAdapterCallbacks {
  onStateChange: (state: DialerState, call: Call) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionError: (error: RingeeError) => void;
}

/** The concrete Telnyx client type, derived from the engine so this package
 * never imports `@telnyx/webrtc` directly (the engine is the single importer). */
type TelnyxClient = ReturnType<typeof createTelnyxClient>;

const READY_TIMEOUT_MS = 15_000;

/**
 * The ONE place in the SDK that talks to Telnyx — and it does so only through
 * the shared `@ringee/dialer-core` engine (the single monorepo-wide importer of
 * `@telnyx/webrtc`). Everything above this layer speaks Ringee's public
 * vocabulary; raw Telnyx state and objects never escape.
 */
export class TelnyxAdapter {
  private client: TelnyxClient | null = null;
  private currentCall: Call | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastState: DialerState = "uninitialized";

  constructor(
    private readonly callbacks: TelnyxAdapterCallbacks,
    private readonly debug = false,
  ) {}

  /** Connect the WebRTC client and resolve once it is `ready`. */
  connect(credential: TelnyxCredential): Promise<void> {
    this.teardownClient();

    const client = createTelnyxClient({
      login: credential.sipUsername,
      password: credential.sipPassword,
      debug: this.debug,
    });
    this.client = client;

    this.unsubscribe = onCallUpdate(client, (call) => this.handleCall(call));

    client.on(TELNYX_EVENTS.error, () => {
      this.callbacks.onConnectionError(
        new RingeeError(
          "TELNYX_CONNECTION_FAILED",
          "The calling connection failed.",
        ),
      );
    });

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new RingeeError(
            "TELNYX_CONNECTION_FAILED",
            "Timed out connecting to the calling service.",
          ),
        );
      }, READY_TIMEOUT_MS);

      client.on(TELNYX_EVENTS.ready, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });

      try {
        void client.connect();
      } catch {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new RingeeError(
            "TELNYX_CONNECTION_FAILED",
            "Could not start the calling connection.",
          ),
        );
      }
    });
  }

  newCall(params: PlaceCallParams): Call {
    if (!this.client) {
      throw new RingeeError(
        "TELNYX_CONNECTION_FAILED",
        "The calling connection is not ready.",
      );
    }
    const call = placeCall({
      client: this.client,
      destination: params.destination,
      callerId: params.callerId,
      userId: params.userId,
      organizationId: params.organizationId,
      extraHeaders: [
        { name: "X-Ringee-Call-Id", value: params.correlationToken },
      ],
      debug: this.debug,
    });
    this.currentCall = call;
    return call;
  }

  hangup(): Promise<void> {
    return hangupCall(this.currentCall);
  }

  mute(): Promise<void> {
    return muteCall(this.currentCall, true);
  }

  unmute(): Promise<void> {
    return muteCall(this.currentCall, false);
  }

  hold(): Promise<void> {
    return holdCall(this.currentCall, true);
  }

  resume(): Promise<void> {
    return holdCall(this.currentCall, false);
  }

  sendDigits(digits: string): void {
    for (const digit of digits) sendDtmf(this.currentCall, digit);
  }

  hasActiveCall(): boolean {
    return !!this.currentCall;
  }

  disconnect(): void {
    this.teardownClient();
  }

  private handleCall(call: Call): void {
    this.currentCall = call;
    const engineState = mapTelnyxState(call.state);
    const publicState = mapEngineState(engineState);

    const remoteStream = (call as Call & { remoteStream?: MediaStream })
      .remoteStream;
    if (remoteStream) this.callbacks.onRemoteStream(remoteStream);

    if (publicState !== this.lastState) {
      this.lastState = publicState;
    }
    this.callbacks.onStateChange(publicState, call);

    if (publicState === "ended" || publicState === "error") {
      this.currentCall = null;
    }
  }

  private teardownClient(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.client) {
      try {
        void this.client.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.client = null;
    this.currentCall = null;
    this.lastState = "uninitialized";
  }
}
