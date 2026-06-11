import { HttpException, Injectable, Logger } from "@nestjs/common";
import { TelephonyCountryRate } from "../interfaces/telephony.rate";
import { TelnyxClient } from "./telnyx.client";
import {
  AssignedNumber,
  AvailableNumber,
  PurchaseNumbers,
  SearchAvailableParams,
} from "../interfaces/available.number";
import { apiConfiguration } from "@ringee/configuration";
import { TelephonyService } from "../interfaces/telephony.service";
import Telnyx from "telnyx";
import { AvailablePhoneNumberListParams } from "telnyx/resources/available-phone-numbers";

const telnyx = new Telnyx({
  baseURL: "https://api.telnyx.com/v2",
  apiKey: apiConfiguration.TELNYX_API_KEY,
});

process.env.NUMBER_PROFIT_MARGIN = "1.0";

@Injectable()
export class TelnyxService implements TelephonyService {
  private readonly logger = new Logger(TelnyxService.name);

  constructor(private readonly telnyxClient: TelnyxClient) {}

  private applyNumberProfitMargin(cost: number): number {
    const rawMargin = process.env.NUMBER_PROFIT_MARGIN;
    const profitMargin = rawMargin ? parseFloat(rawMargin) : 0;

    if (!Number.isFinite(cost)) return 0;

    // Numbers that cost exactly $1 are priced at a flat $3, skipping the margin.
    if (cost === 1) return 3;

    if (!Number.isFinite(profitMargin)) return parseFloat(cost.toFixed(4));

    const finalCost = cost * (1 + profitMargin);
    return parseFloat(finalCost.toFixed(4));
  }

  async requestCallIdVerification(
    phoneNumber: string,
    method: "sms" | "call",
    extension?: string,
  ): Promise<void> {
    try {
      const payload = {
        phone_number: phoneNumber,
        verification_method: method,
        ...(extension ? { extension } : {}),
      };

      const { errors } = await this.telnyxClient.post(
        "/verified_numbers",
        payload,
      );

      if (errors?.length) {
        this.logger.error("Telnyx verification failed", errors);
        throw new HttpException(
          errors[0].detail || "Telnyx verification error",
          422,
        );
      }

      this.logger.log(
        `Verification requested for ${phoneNumber} via ${method.toUpperCase()}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Error requesting Caller ID verification: ${err.message}`,
      );

      throw new HttpException(
        err?.response?.data?.message || "Failed to request verification",
        err?.status || 500,
      );
    }
  }

  async submitCallIdVerificationCode(
    phoneNumber: string,
    verificationCode: string,
  ): Promise<{ isVerified: boolean }> {
    try {
      const url = `/verified_numbers/${encodeURIComponent(phoneNumber)}/actions/verify`;

      const { data, errors } = await this.telnyxClient.post(url, {
        verification_code: verificationCode,
      });

      if (errors?.length) {
        throw new HttpException(errors[0].detail, 422);
      }

      this.logger.log(`Caller ID ${phoneNumber} verified successfully.`);

      const isVerified =
        data?.record_type === "verified_number" && !!data?.verified_at;

      return { isVerified };
    } catch (error: any) {
      this.logger.error(`Verification failed for ${phoneNumber}`, error);

      throw new HttpException(
        error?.response?.data?.message ||
          "Invalid or expired verification code",
        error?.status || 400,
      );
    }
  }

  async searchAvailableNumbers(
    params: SearchAvailableParams,
  ): Promise<AvailableNumber[]> {
    try {
      const filters = {
        country_code: params.countryCode,
        limit: params.limit,
      } as AvailablePhoneNumberListParams.Filter;

      if (params.numberType) {
        filters.phone_number_type = params.numberType;
      }

      if (params.areaCode) {
        filters.national_destination_code = params.areaCode;
      }

      if (params.features && params.features.length > 0) {
        filters.features =
          params.features as AvailablePhoneNumberListParams.Filter["features"];
      }

      const { data: numbersList } = await telnyx.availablePhoneNumbers.list({
        filter: filters,
      });

      return (numbersList || []).map((item: any) => {
        const features = Array.isArray(item.features)
          ? item.features.map((feature: any) => feature.name)
          : [];

        const regionInformation = Array.isArray(item.region_information)
          ? item.region_information
          : [];

        const getRegionName = (regionType: string): string =>
          regionInformation.find(
            (region: any) => region.region_type === regionType,
          )?.region_name || "";

        const monthlyCost = Number(item?.cost_information?.monthly_cost || 0);
        const upfrontCost = Number(item?.cost_information?.upfront_cost || 0);

        return {
          phoneNumber: item.phone_number,
          countryCode: getRegionName("country_code"),
          locality: getRegionName("location"),
          region: getRegionName("state"),
          numberType: item.phone_number_type,
          costInformation: {
            currency: item?.cost_information?.currency || "USD",
            monthlyCost: this.applyNumberProfitMargin(monthlyCost),
            upfrontCost: this.applyNumberProfitMargin(upfrontCost),
          },
          capabilities: {
            sms: features.includes("sms"),
            voice: features.includes("voice"),
            fax: features.includes("fax"),
            hdVoice: features.includes("hd_voice"),
            internationalSms: features.includes("international_sms"),
            emergency: features.includes("emergency"),
            mms: features.includes("mms"),
          },
        };
      });
    } catch (error: any) {
      this.logger.error("Error searching available numbers", error);
      return [];
    }
  }

  async purchaseNumbers(phoneNumbers: string[]): Promise<PurchaseNumbers> {
    const payload = {
      phone_numbers: phoneNumbers.map((number) => ({ phone_number: number })),
      billing_group_id: "0885e7e9-7cb4-4de9-91cd-1c19c5c4cb4d",
      auto_renew: true,
    };

    const { data } = await this.telnyxClient.post("/number_orders", payload);

    const response = {
      billingGroupId: data.billing_group_id,
      orderId: data.id,
      phoneNumbersCount: data.phone_numbers_count,
      status: data.status,
      provider: "telnyx",
      phoneNumbers: data.phone_numbers.map((number: any) => ({
        id: number.id,
        status: number.status,
        phoneNumber: number.phone_number,
        phoneNumberType: number.phone_number_type,
        countryCode: number.country_code,
        requirementsStatus: number.requirements_status,
        requirementsMet: number.requirements_met,
        connectionId: "",
        connectionName: "",
        billingGroupId: data.billing_group_id,
      })),
    };

    for (const phoneNumber of response.phoneNumbers) {
      const assignedNumber = await this.assignNumberToConnection(
        phoneNumber.phoneNumber,
      );

      phoneNumber.connectionId = assignedNumber.connectionId;
      phoneNumber.connectionName = assignedNumber.connectionName;
    }

    return response;
  }

  async assignNumberToConnection(
    phoneNumber: string,
    connectionId?: string,
  ): Promise<AssignedNumber> {
    const payload = {
      connection_id: connectionId ?? apiConfiguration.TELNYX_CONNECTION_ID,
    };

    const { data } = await this.telnyxClient.patch(
      `/phone_numbers/${phoneNumber}`,
      payload,
    );

    return {
      id: data.id,
      status: data.status,
      phoneNumber: data.phone_number,
      phoneNumberType: data.phone_number_type,
      countryCode: data.country_code,
      connectionId: data.connection_id,
      connectionName: data.connection_name,
      billingGroupId: data.billing_group_id,
    };
  }

  async getRates(): Promise<TelephonyCountryRate[]> {
    throw new Error("Not implemented");
  }

  async getRateByCountry(
    codeOrName: string,
  ): Promise<TelephonyCountryRate | null> {
    void codeOrName;
    throw new Error("Not implemented");
  }

  async createTelephonyCredential(
    userId: string,
    tag: string = "webrtc",
  ): Promise<{
    sipUsername: string;
    sipPassword: string;
    expiresAt: string;
    connectionId: string;
  }> {
    try {
      const payload = {
        connection_id: apiConfiguration.TELNYX_CONNECTION_ID,
        name: `frontend-${userId}`,
        tag,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };

      const { data } = await this.telnyxClient.post(
        "/telephony_credentials",
        payload,
      );

      const cred = data || {};

      return {
        sipUsername: cred.sip_username,
        sipPassword: cred.sip_password,
        expiresAt: cred.expires_at,
        connectionId: cred.resource_id?.replace("connection:", "") || "",
      };
    } catch (error: any) {
      this.logger.error("Error creating Telnyx credential", error);

      throw new HttpException(
        error?.response?.data?.errors?.[0]?.detail ||
          "Failed to create Telnyx credential",
        error?.response?.status || 500,
      );
    }
  }

  async transferCallToUser(
    callControlId: string,
    userId: string,
    creds: {
      sipUsername: string;
      sipPassword: string;
      expiresAt?: string;
      connectionId?: string;
    },
  ): Promise<{ sipUsername: string; sipPassword: string }> {
    try {
      const destination = `sip:${creds.sipUsername}@sip.telnyx.com`;

      await this.telnyxClient.post(`/calls/${callControlId}/actions/transfer`, {
        to: destination,
        client_state: Buffer.from(
          JSON.stringify({
            userId,
            sip: creds.sipUsername,
          }),
        ).toString("base64"),
      });

      this.logger.log(
        `Call ${callControlId} transferred to ${destination} for userId=${userId}`,
      );

      return {
        sipUsername: creds.sipUsername,
        sipPassword: creds.sipPassword,
      };
    } catch (error: any) {
      this.logger.error(
        `Error transferring call ${callControlId} to user ${userId}`,
        error?.response?.data || error?.message,
      );

      throw new HttpException(
        error?.response?.data?.errors?.[0]?.detail ||
          "Error transferring call to WebRTC",
        error?.response?.status || 500,
      );
    }
  }

  async hangupCall(callControlId: string, commandId?: string): Promise<void> {
    await this.telnyxClient.post(`/calls/${callControlId}/actions/hangup`, {
      client_state: Buffer.from("hangup").toString("base64"),
      command_id: commandId || crypto.randomUUID(),
    });
  }

  async startRecording(callControlId: string): Promise<void> {
    await telnyx.calls.actions.startRecording(callControlId, {
      format: "mp3",
      channels: "dual",
    });
  }

  async stopRecording(callControlId: string): Promise<void> {
    await telnyx.calls.actions.stopRecording(callControlId, {});
  }

  async downloadRecording(url: string): Promise<ArrayBuffer> {
    return this.telnyxClient.download(url);
  }

  /**
   * Start Telnyx Media Streaming for a live call. Telnyx dials `streamUrl`
   * (our WebSocket bridge) and pushes PCMU/8kHz audio frames for the requested
   * track(s). This is independent of recording — realtime transcription does
   * not require a recording to be active.
   */
  async startStreaming(
    callControlId: string,
    streamUrl: string,
    track: "both_tracks" | "inbound_track" | "outbound_track" = "both_tracks",
  ): Promise<void> {
    try {
      await this.telnyxClient.post(
        `/calls/${callControlId}/actions/streaming_start`,
        {
          stream_url: streamUrl,
          stream_track: track,
          command_id: crypto.randomUUID(),
          client_state: Buffer.from(
            JSON.stringify({ action: "media_stream" }),
          ).toString("base64"),
        },
      );
    } catch (error: any) {
      // Surface Telnyx's real validation detail (otherwise it's masked as a
      // generic "Http Exception" upstream).
      const body = error?.getResponse?.() ?? error?.response?.data;
      this.logger.error(
        `Telnyx streaming_start failed for ${callControlId} (stream_url=${streamUrl}): ${JSON.stringify(
          body,
        )}`,
      );
      throw error;
    }
  }

  async stopStreaming(callControlId: string): Promise<void> {
    await this.telnyxClient.post(
      `/calls/${callControlId}/actions/streaming_stop`,
      { command_id: crypto.randomUUID() },
    );
  }

  async playbackStart(callControlId: string, audioUrl: string): Promise<void> {
    await this.telnyxClient.post(
      `/calls/${callControlId}/actions/playback_start`,
      {
        audio_url: audioUrl,
        client_state: Buffer.from(
          JSON.stringify({ action: "voicemail_drop" }),
        ).toString("base64"),
        command_id: crypto.randomUUID(),
      },
    );
  }

  // ────────────────────────────────────────────────────────────
  // Messaging (SMS / MMS)
  // ────────────────────────────────────────────────────────────

  async sendMessage(params: {
    from: string;
    to: string;
    text?: string;
    mediaUrls?: string[];
    messagingProfileId?: string;
    type?: "SMS" | "MMS";
    webhookUrl?: string;
    webhookFailoverUrl?: string;
  }): Promise<{
    id: string;
    messagingProfileId?: string;
    raw: any;
  }> {
    const body: Record<string, any> = {
      from: params.from,
      to: params.to,
      type: params.type ?? (params.mediaUrls?.length ? "MMS" : "SMS"),
      use_profile_webhooks: true,
    };

    if (params.text) body.text = params.text;
    if (params.mediaUrls?.length) body.media_urls = params.mediaUrls;
    if (params.messagingProfileId) {
      body.messaging_profile_id = params.messagingProfileId;
    }
    if (params.webhookUrl) body.webhook_url = params.webhookUrl;
    if (params.webhookFailoverUrl) {
      body.webhook_failover_url = params.webhookFailoverUrl;
    }

    const { data } = await this.telnyxClient.post("/messages", body);
    return {
      id: data?.id,
      messagingProfileId: data?.messaging_profile_id,
      raw: data,
    };
  }

  async getPhoneNumberFeatures(phoneNumber: string): Promise<{
    sms?: boolean;
    mms?: boolean;
    voice?: boolean;
    fax?: boolean;
    hdVoice?: boolean;
    internationalSms?: boolean;
    emergency?: boolean;
    raw?: any;
  }> {
    try {
      const encoded = encodeURIComponent(phoneNumber);
      const { data } = await this.telnyxClient.get(`/phone_numbers/${encoded}`);
      const features: string[] = Array.isArray(data?.features)
        ? data.features.map((f: any) => (typeof f === "string" ? f : f?.name))
        : [];
      return {
        sms: features.includes("sms"),
        mms: features.includes("mms"),
        voice: features.includes("voice"),
        fax: features.includes("fax"),
        hdVoice: features.includes("hd_voice"),
        internationalSms: features.includes("international_sms"),
        emergency: features.includes("emergency"),
        raw: data,
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to read Telnyx features for ${phoneNumber}: ${error?.message}`,
      );
      return {};
    }
  }
}
