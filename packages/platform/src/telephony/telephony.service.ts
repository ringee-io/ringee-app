import { Injectable } from "@nestjs/common";
import { TelephonyCountryRate } from "./interfaces/telephony.rate";
import { TelephonyService as TelephonyServiceInterface } from "./interfaces/telephony.service";
import { TelnyxService } from "./telnyx";
import {
  AddressValidationInput,
  AddressValidationResult,
  CostInformation,
  SearchAvailableParams,
  PurchaseNumbers,
  AssignedNumber,
  AvailableNumber,
  NumberOrderRequirements,
  RegulatoryRequirementsQuery,
  RegulatoryRequirementsResult,
  RegulatoryRequirementValue,
  TelnyxAddressInput,
  UploadedDocument,
} from "./interfaces/available.number";

@Injectable()
export class TelephonyService implements TelephonyServiceInterface {
  constructor(private readonly telnyxService: TelnyxService) {}

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

  listVerifiedNumbers(): Promise<
    Array<{ phoneNumber: string; verified: boolean }>
  > {
    return this.getServiceProvider().listVerifiedNumbers();
  }

  deleteVerifiedNumber(phoneNumber: string): Promise<void> {
    return this.getServiceProvider().deleteVerifiedNumber(phoneNumber);
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

  getAvailableNumberCost(phoneNumber: string): Promise<CostInformation> {
    return this.getServiceProvider().getAvailableNumberCost(phoneNumber);
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

  setMessagingProfile(
    phoneNumber: string,
    messagingProfileId: string,
  ): Promise<string | null> {
    return this.getServiceProvider().setMessagingProfile(
      phoneNumber,
      messagingProfileId,
    );
  }

  getRegulatoryRequirements(
    query: RegulatoryRequirementsQuery,
  ): Promise<RegulatoryRequirementsResult> {
    return this.getServiceProvider().getRegulatoryRequirements(query);
  }

  getNumberOrderRequirements(
    numberOrderPhoneNumberId: string,
  ): Promise<NumberOrderRequirements> {
    return this.getServiceProvider().getNumberOrderRequirements(
      numberOrderPhoneNumberId,
    );
  }

  uploadDocument(file: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<UploadedDocument> {
    return this.getServiceProvider().uploadDocument(file);
  }

  validateAddress(
    input: AddressValidationInput,
  ): Promise<AddressValidationResult> {
    return this.getServiceProvider().validateAddress(input);
  }

  createAddress(input: TelnyxAddressInput): Promise<{ addressId: string }> {
    return this.getServiceProvider().createAddress(input);
  }

  submitNumberOrderRequirements(
    numberOrderPhoneNumberId: string,
    requirements: RegulatoryRequirementValue[],
  ): Promise<NumberOrderRequirements> {
    return this.getServiceProvider().submitNumberOrderRequirements(
      numberOrderPhoneNumberId,
      requirements,
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

  startStreaming(
    callControlId: string,
    streamUrl: string,
    track?: "both_tracks" | "inbound_track" | "outbound_track",
  ): Promise<void> {
    return this.getServiceProvider().startStreaming(
      callControlId,
      streamUrl,
      track,
    );
  }

  stopStreaming(callControlId: string): Promise<void> {
    return this.getServiceProvider().stopStreaming(callControlId);
  }

  downloadRecording(url: string): Promise<ArrayBuffer> {
    return this.getServiceProvider().downloadRecording(url);
  }

  playbackStart(callControlId: string, audioUrl: string): Promise<void> {
    return this.getServiceProvider().playbackStart(callControlId, audioUrl);
  }

  sendMessage(params: {
    from: string;
    to: string;
    text?: string;
    mediaUrls?: string[];
    messagingProfileId?: string;
    type?: "SMS" | "MMS";
    webhookUrl?: string;
    webhookFailoverUrl?: string;
  }): Promise<{ id: string; messagingProfileId?: string; raw: any }> {
    return this.getServiceProvider().sendMessage(params);
  }

  getPhoneNumberFeatures(phoneNumber: string): Promise<{
    sms?: boolean;
    mms?: boolean;
    voice?: boolean;
    fax?: boolean;
    hdVoice?: boolean;
    internationalSms?: boolean;
    emergency?: boolean;
    raw?: any;
  }> {
    return this.getServiceProvider().getPhoneNumberFeatures(phoneNumber);
  }
}
