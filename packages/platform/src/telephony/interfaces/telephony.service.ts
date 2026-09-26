import {
  CarrierConnectionService,
  DeskPhoneInboundTransfer,
} from "./carrier-connection";
import { TelephonyRateService } from "./telephony.rate.service";
import { TelephonyNumbersService } from "./telephony.numbers.service";
import { TelephonyCallerIdService } from "./telephony.caller.id.service";

export type TelephonyService = {
  /**
   * Ring a desk phone with an inbound call that is waiting on the Call Control
   * application. Throws `CarrierConnectionError` when the provider refuses.
   */
  connectInboundToDeskPhone(
    callControlId: string,
    params: DeskPhoneInboundTransfer,
  ): Promise<void>;
  createTelephonyCredential: (
    userId: string,
    tag: string,
  ) => Promise<{
    sipUsername: string;
    sipPassword: string;
    expiresAt: string;
    connectionId: string;
  }>;
  transferCallToUser(
    callControlId: string,
    userId: string,
    creds: {
      sipUsername: string;
      sipPassword: string;
      expiresAt?: string;
      connectionId?: string;
    },
  ): Promise<{ sipUsername: string; sipPassword: string }>;
  hangupCall(callControlId: string, commandId?: string): Promise<void>;
  allowDeskPhoneInternalCalls(connectionId: string): Promise<void>;
  answerInboundCall(callControlId: string, commandId: string): Promise<void>;

  bridgeCalls(
    callControlId: string,
    otherCallControlId: string,
    commandId: string,
  ): Promise<void>;
  dialInboundEndpoint(params: {
    sipUsername: string;
    from: string;
    correlation: string;
    commandId: string;
    timeoutSecs: number;
  }): Promise<{
    callControlId: string;
    callLegId: string | null;
    callSessionId: string | null;
  }>;
  /**
   * Ask the provider whether a leg is still up. `null` means "could not tell"
   * (provider unreachable / unexpected response) and must NOT be read as "the
   * call ended" — callers decide what to do with an unknown answer.
   */
  isCallAlive(callControlId: string): Promise<boolean | null>;
  startRecording(callControlId: string): Promise<void>;
  stopRecording(callControlId: string): Promise<void>;
  startStreaming(
    callControlId: string,
    streamUrl: string,
    track?: "both_tracks" | "inbound_track" | "outbound_track",
  ): Promise<void>;
  stopStreaming(callControlId: string): Promise<void>;
  downloadRecording(url: string): Promise<ArrayBuffer>;
  playbackStart(
    callControlId: string,
    audioUrl: string,
    clientState?: Record<string, unknown>,
  ): Promise<void>;
  /**
   * Originate an outbound call server-side. Used by voicemail drops, which
   * dial the prospect with answering-machine detection on and play an audio
   * asset into the greeting instead of connecting a human agent.
   */
  dial(params: {
    to: string;
    from: string;
    connectionId?: string;
    clientState?: Record<string, unknown>;
    /**
     * `greeting_end` waits for the machine's greeting to finish before Telnyx
     * emits `call.machine.greeting.ended` — the cue to start playback.
     */
    answeringMachineDetection?:
      | "disabled"
      | "detect"
      | "detect_beep"
      | "detect_words"
      | "greeting_end"
      | "premium";
    /** Seconds to keep ringing before giving up. */
    timeoutSecs?: number;
    /** Hard cap (seconds) after which the provider auto-ends the call. */
    timeLimitSecs?: number;
  }): Promise<{
    callControlId: string;
    callSessionId: string | null;
    callLegId: string | null;
  }>;
  sendMessage(params: {
    from: string;
    to: string;
    text?: string;
    mediaUrls?: string[];
    messagingProfileId?: string;
    type?: "SMS" | "MMS";
    webhookUrl?: string;
    webhookFailoverUrl?: string;
  }): Promise<{ id: string; messagingProfileId?: string; raw: any }>;
  getPhoneNumberFeatures(phoneNumber: string): Promise<{
    sms?: boolean;
    mms?: boolean;
    voice?: boolean;
    fax?: boolean;
    hdVoice?: boolean;
    internationalSms?: boolean;
    emergency?: boolean;
    raw?: any;
  }>;
} & CarrierConnectionService &
  TelephonyRateService &
  TelephonyNumbersService &
  TelephonyCallerIdService;
