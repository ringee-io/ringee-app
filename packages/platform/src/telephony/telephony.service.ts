import { Injectable } from "@nestjs/common";
import { TelephonyCountryRate } from "./interfaces/telephony.rate";
import { TelephonyService as TelephonyServiceInterface } from "./interfaces/telephony.service";
import { TelnyxService } from "./telnyx";
import {
  SearchAvailableParams,
  PurchaseNumbers,
  AssignedNumber,
  AvailableNumber,
} from "./interfaces/available.number";

@Injectable()
export class TelephonyService implements TelephonyServiceInterface {
  constructor(private readonly telnyxService: TelnyxService) { }

  submitCallIdVerificationCode(
    phoneNumber: string,
    verificationCode: string,
  ): Promise<{ isVerified: boolean }> {
    return this.getServiceProvider().submitCallIdVerificationCode(
      phoneNumber,
      verificationCode,
    );
  }

  requestCallIdVerification(
    phoneNumber: string,
    method: "sms" | "call",
    extension?: string,
  ): Promise<void> {
    return this.getServiceProvider().requestCallIdVerification(
      phoneNumber,
      method,
      extension,
    );
  }

  getRates(): Promise<TelephonyCountryRate[]> {
    return this.getServiceProvider().getRates();
  }

  getRateByCountry(codeOrName: string): Promise<TelephonyCountryRate | null> {
    return this.getServiceProvider().getRateByCountry(codeOrName);
  }

  private getServiceProvider(provider = "telnyx"): TelephonyServiceInterface {
    switch (provider) {
      default:
        return this.telnyxService;
    }
  }

  searchAvailableNumbers(
    params: SearchAvailableParams,
  ): Promise<AvailableNumber[]> {
    return this.getServiceProvider().searchAvailableNumbers(params);
  }

  purchaseNumbers(phoneNumbers: string[]): Promise<PurchaseNumbers> {
    return this.getServiceProvider().purchaseNumbers(phoneNumbers);
  }

  assignNumberToConnection(
    phoneNumber: string,
    connectionId?: string,
  ): Promise<AssignedNumber> {
    return this.getServiceProvider().assignNumberToConnection(
      phoneNumber,
      connectionId,
    );
  }

  createTelephonyCredential(
    userId: string,
    tag: string = "webrtc",
  ): Promise<{
    sipUsername: string;
    sipPassword: string;
    expiresAt: string;
    connectionId: string;
  }> {
    return this.getServiceProvider().createTelephonyCredential(userId, tag);
  }

  transferCallToUser(
    callControlId: string,
    userId: string,
    creds: {
      sipUsername: string;
      sipPassword: string;
      expiresAt?: string;
      connectionId?: string;
    },
  ): Promise<{ sipUsername: string; sipPassword: string }> {
    return this.getServiceProvider().transferCallToUser(
      callControlId,
      userId,
      creds,
    );
  }

  hangupCall(callControlId: string, commandId?: string): Promise<void> {
    return this.getServiceProvider().hangupCall(callControlId, commandId);
  }

  startRecording(callControlId: string): Promise<void> {
    return this.getServiceProvider().startRecording(callControlId);
  }

  stopRecording(callControlId: string): Promise<void> {
    return this.getServiceProvider().stopRecording(callControlId);
  }

  downloadRecording(url: string): Promise<ArrayBuffer> {
    return this.getServiceProvider().downloadRecording(url);
  }
}
