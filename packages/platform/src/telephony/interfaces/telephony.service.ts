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
  downloadRecording(url: string): Promise<ArrayBuffer>;
} & TelephonyRateService &
  TelephonyNumbersService &
  TelephonyCallerIdService;
