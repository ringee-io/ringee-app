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

@Injectable()
export class TelnyxService implements TelephonyService {
  private readonly logger = new Logger(TelnyxService.name);

  constructor(private readonly telnyxClient: TelnyxClient) { }

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
        this.logger.error(`Telnyx verification failed`, errors);
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
        err.response?.data?.message || "Failed to request verification",
        err.status || 500,
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

      return {
        isVerified,
      };
    } catch (error: any) {
      this.logger.error(`Verification failed for ${phoneNumber}`, error);

      throw new HttpException(
        error?.response?.data?.message ||
        "Invalid or expired verification code",
        error?.status || 400,
      );
    }
  }

  addProfitsToCosts(costs: number): number {
    const profitMargin = process.env.NUMBER_PROFIT_MARGIN ? parseFloat(process.env.NUMBER_PROFIT_MARGIN) : 0;
    return costs + (costs * profitMargin);
  }

  async searchAvailableNumbers(
    params: SearchAvailableParams,
  ): Promise<AvailableNumber[]> {
    try {
      const filters = {
        country_code: params.countryCode,
        limit: params.limit,
      } as AvailablePhoneNumberListParams.Filter;

      if (params.numberType) filters.phone_number_type = params.numberType;
      if (params.areaCode) filters.national_destination_code = params.areaCode;

      const { data: numbersList } = await telnyx.availablePhoneNumbers.list({
        filter: filters,
      });

      return (numbersList || []).map((item: any) => {
        const features = item.features.map((feature: any) => feature.name);

        return {
          phoneNumber: item.phone_number,
          countryCode:
            item.region_information.find(
              (region: any) => region.region_type === "country_code",
            )?.region_name || "",
          locality:
            item.region_information.find(
              (region: any) => region.region_type === "location",
            )?.region_name || "",
          region:
            item.region_information.find(
              (region: any) => region.region_type === "state",
            )?.region_name || "",
          numberType: item.phone_number_type,
          costInformation: {
            currency: item.cost_information.currency,
            monthlyCost: this.addProfitsToCosts(
              item.cost_information.monthly_cost,
            ),
            upfrontCost: this.addProfitsToCosts(
              item.cost_information.upfront_cost,
            ),
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
      this.logger.error(`Error searching available numbers`, error);
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
      phoneNumbers: data.phone_numbers.map((number: any) => {
        return {
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
        };
      }),
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
        expires_at: new Date(Date.now() + 60 * 60 * 10000).toISOString(), // +1h
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
      this.logger.error("❌ Error creating Telnyx credential", error);
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
        `📞 Llamada ${callControlId} transferida a ${destination} para userId=${userId}`,
      );

      return {
        sipUsername: creds.sipUsername,
        sipPassword: creds.sipPassword,
      };
    } catch (error: any) {
      console.error(JSON.stringify(error?.response?.errors, null, 2));
      this.logger.error(
        `❌ Error al transferir la llamada ${callControlId} → ${userId}`,
        error.response?.data || error.message,
      );

      throw new HttpException(
        error?.response?.data?.errors?.[0]?.detail ||
        "Error al transferir llamada a WebRTC",
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
    await telnyx.calls.actions.stopRecording(
      callControlId,
      {},
    );
  }

  async downloadRecording(url: string): Promise<ArrayBuffer> {
    return this.telnyxClient.download(url);
  }
}
