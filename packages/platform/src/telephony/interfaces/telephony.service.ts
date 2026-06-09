import { TelephonyRateService } from "./telephony.rate.service";
import { TelephonyNumbersService } from "./telephony.numbers.service";
import { TelephonyCallerIdService } from "./telephony.caller.id.service";

export type TelephonyService = {
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
  startRecording(callControlId: string): Promise<void>;
  stopRecording(callControlId: string): Promise<void>;
  startStreaming(
    callControlId: string,
    streamUrl: string,
    track?: "both_tracks" | "inbound_track" | "outbound_track",
  ): Promise<void>;
  stopStreaming(callControlId: string): Promise<void>;
  downloadRecording(url: string): Promise<ArrayBuffer>;
  playbackStart(callControlId: string, audioUrl: string): Promise<void>;
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
} & TelephonyRateService &
  TelephonyNumbersService &
  TelephonyCallerIdService;
