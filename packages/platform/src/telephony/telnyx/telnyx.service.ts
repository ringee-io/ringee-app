import { HttpException, Injectable, Logger } from "@nestjs/common";
import { TelephonyCountryRate } from "../interfaces/telephony.rate";
import { TelnyxClient } from "./telnyx.client";
import {
  AddressValidationInput,
  AddressValidationResult,
  AssignedNumber,
  AvailableNumber,
  CostInformation,
  NumberOrderRequirementItem,
  NumberOrderRequirements,
  PurchaseNumbers,
  RegulatoryRequirement,
  RegulatoryRequirementsQuery,
  RegulatoryRequirementsResult,
  RegulatoryRequirementValue,
  SearchAvailableParams,
  TelnyxAddressInput,
  UploadedDocument,
} from "../interfaces/available.number";
import { apiConfiguration } from "@ringee/configuration";
import { TelephonyService } from "../interfaces/telephony.service";
import Telnyx from "telnyx";
import { AvailablePhoneNumberListParams } from "telnyx/resources/available-phone-numbers";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const telnyx = new Telnyx({
  baseURL: "https://api.telnyx.com/v2",
  apiKey: apiConfiguration.TELNYX_API_KEY,
});

process.env.NUMBER_PROFIT_MARGIN = "1.0";

/**
 * Normalizes a phone number to strict E.164 for Telnyx. Strips spaces, dashes
 * and parentheses; returns `undefined` when the result isn't a valid E.164
 * number (leading `+` and 7–15 digits) so the caller can omit the optional
 * field instead of having Telnyx reject the whole request.
 */
function sanitizeE164(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d+]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : undefined;
}

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

  async listVerifiedNumbers(): Promise<
    Array<{ phoneNumber: string; verified: boolean }>
  > {
    const { data } = await this.telnyxClient.get<{
      data?: Array<{ phone_number: string; verified_at?: string | null }>;
    }>("/verified_numbers");

    return (data ?? []).map((record) => ({
      phoneNumber: record.phone_number,
      verified: !!record.verified_at,
    }));
  }

  async deleteVerifiedNumber(phoneNumber: string): Promise<void> {
    try {
      await this.telnyxClient.delete(
        `/verified_numbers/${encodeURIComponent(phoneNumber)}`,
      );
      this.logger.log(`Verified number ${phoneNumber} deleted from Telnyx.`);
    } catch (error: any) {
      // A 404 means Telnyx already has no such verified number — treat the
      // local delete as the source of truth and don't block on the carrier.
      if (error?.status === 404 || error?.response?.status === 404) {
        this.logger.warn(
          `Verified number ${phoneNumber} not found on Telnyx; skipping.`,
        );
        return;
      }
      this.logger.error(
        `Failed to delete verified number ${phoneNumber}`,
        error,
      );
      throw error;
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

  /**
   * Authoritative, server-side price for a single available number. Re-queries
   * Telnyx for THIS number's real cost and applies the same profit margin as
   * `searchAvailableNumbers`, so the recurring price can never be supplied (or
   * tampered with) by the client at checkout time. Throws if the number can no
   * longer be found/priced, so an un-priceable number never reaches Stripe.
   */
  async getAvailableNumberCost(phoneNumber: string): Promise<CostInformation> {
    const parsed = parsePhoneNumberFromString(phoneNumber.trim());
    if (!parsed) {
      throw new HttpException(
        "A valid phone number is required to price it",
        400,
      );
    }

    // Telnyx's available-number pattern is national, not E.164. Passing the
    // country calling code as part of `ends_with` makes valid international
    // numbers (for example +44 numbers) fail with "Invalid request filter".
    // Parse the E.164 value so Telnyx receives the national number plus its
    // separate ISO country filter, then still require an exact E.164 match
    // below so a broad/best-effort result can never be priced accidentally.
    const filter: AvailablePhoneNumberListParams.Filter = {
      phone_number: { ends_with: parsed.nationalNumber },
      ...(parsed.country ? { country_code: parsed.country } : {}),
    };

    let numbersList;
    try {
      ({ data: numbersList } = await telnyx.availablePhoneNumbers.list({
        filter,
      }));
    } catch (error: unknown) {
      const providerError = error as {
        status?: number;
        response?: { status?: number };
        error?: { code?: string };
        errors?: Array<{ code?: string }>;
      };
      const providerStatus =
        providerError.status ?? providerError.response?.status;
      const providerCode =
        providerError.error?.code ?? providerError.errors?.[0]?.code;
      this.logger.warn(
        `Could not price ${parsed.number} via Telnyx ` +
          `(status ${providerStatus ?? "unknown"}, code ${providerCode ?? "unknown"})`,
      );

      if (providerStatus === 400 || providerStatus === 404) {
        throw new HttpException(
          `Number ${parsed.number} is no longer available; cannot determine its price`,
          409,
        );
      }

      throw new HttpException(
        "Unable to verify the phone number price with the provider",
        502,
      );
    }

    const digits = parsed.number.replace(/\D/g, "");

    const match = (numbersList || []).find(
      (item: any) =>
        (item?.phone_number || "").replace(/[^\d]/g, "") === digits,
    );

    if (!match) {
      this.logger.warn(
        `Could not price ${phoneNumber}: not present in Telnyx available numbers`,
      );
      throw new HttpException(
        `Number ${phoneNumber} is no longer available; cannot determine its price`,
        409,
      );
    }

    const monthlyCost = Number(match?.cost_information?.monthly_cost || 0);
    const upfrontCost = Number(match?.cost_information?.upfront_cost || 0);

    return {
      currency: (match?.cost_information?.currency as "USD") || "USD",
      monthlyCost: this.applyNumberProfitMargin(monthlyCost),
      upfrontCost: this.applyNumberProfitMargin(upfrontCost),
    };
  }

  async purchaseNumbers(phoneNumbers: string[]): Promise<PurchaseNumbers> {
    const payload = {
      phone_numbers: phoneNumbers.map((number) => ({ phone_number: number })),
      billing_group_id: "0885e7e9-7cb4-4de9-91cd-1c19c5c4cb4d",
      auto_renew: true,
    };

    const { data } = await this.telnyxClient.post("/number_orders", payload);

    const response: PurchaseNumbers = {
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
        regulatoryRequirements: this.mapRegulatoryRequirements(
          number.regulatory_requirements,
        ),
        connectionId: "",
        connectionName: "",
        billingGroupId: data.billing_group_id,
      })),
    };

    for (const phoneNumber of response.phoneNumbers) {
      // Numbers from countries that require document verification come back
      // with `requirements_met === false` and stay in a pending order until the
      // documents are submitted and approved. They are NOT yet provisioned, so
      // assigning them to a connection (PATCH /phone_numbers/{number}) would
      // 404. Skip assignment for those; the caller persists them as `pending`.
      if (phoneNumber.requirementsMet === false) {
        this.logger.warn(
          `Number ${phoneNumber.phoneNumber} (order ${response.orderId}) requires regulatory verification ` +
            `(${phoneNumber.regulatoryRequirements.length} requirement(s)); leaving unassigned until requirements are met.`,
        );
        continue;
      }

      const assignedNumber = await this.assignNumberToConnection(
        phoneNumber.phoneNumber,
      );

      phoneNumber.connectionId = assignedNumber.connectionId;
      phoneNumber.connectionName = assignedNumber.connectionName;
    }

    return response;
  }

  /**
   * Releases a purchased DID back to Telnyx. Numbers are billed monthly for as
   * long as they exist on the account (they are ordered with `auto_renew`), so
   * a number whose Ringee subscription ended must be deleted here or Ringee
   * keeps paying for it forever.
   *
   * The `/phone_numbers/{id}` path accepts either the Telnyx phone number id or
   * the E.164 number — callers pass the number, because `providerNumberId` on
   * our side is a *number order* id, not a phone number id.
   */
  async deletePhoneNumber(phoneNumber: string): Promise<void> {
    try {
      await this.telnyxClient.delete(
        `/phone_numbers/${encodeURIComponent(phoneNumber)}`,
      );
      this.logger.log(`Phone number ${phoneNumber} released on Telnyx.`);
    } catch (error: any) {
      // Already gone at the carrier (never provisioned, or a replayed
      // cancellation): nothing left to bill, so let the local delete proceed.
      if (error?.status === 404 || error?.response?.status === 404) {
        this.logger.warn(
          `Phone number ${phoneNumber} not found on Telnyx; skipping release.`,
        );
        return;
      }
      this.logger.error(
        `Failed to release phone number ${phoneNumber} on Telnyx`,
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  private mapRegulatoryRequirements(raw: any): RegulatoryRequirement[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((req: any) => ({
      id: req?.requirement_id ?? req?.id,
      name: req?.name ?? req?.requirement_id ?? req?.id ?? "Requirement",
      description: req?.description,
      fieldType: req?.field_type ?? req?.type ?? "textual",
      acceptanceCriteria: req?.acceptance_criteria ?? null,
      example: req?.example ?? null,
    }));
  }

  async getRegulatoryRequirements(
    query: RegulatoryRequirementsQuery,
  ): Promise<RegulatoryRequirementsResult> {
    const phoneNumberType = query.phoneNumberType ?? "local";
    const action = query.action ?? "ordering";

    const params = new URLSearchParams({
      "filter[country_code]": query.countryCode,
      "filter[phone_number_type]": phoneNumberType,
      "filter[action]": action,
    });

    try {
      const { data } = await this.telnyxClient.get(
        `/requirements?${params.toString()}`,
      );

      const records: any[] = Array.isArray(data) ? data : [];
      const requirements: RegulatoryRequirement[] = [];
      const seen = new Set<string>();

      for (const record of records) {
        const types: any[] = Array.isArray(record?.requirement_types)
          ? record.requirement_types
          : [];

        for (const type of types) {
          // Entries may be full objects or bare requirement-type id strings.
          const id = typeof type === "string" ? type : (type?.id ?? type?.uuid);
          if (!id || seen.has(id)) continue;
          seen.add(id);

          requirements.push({
            id,
            name: typeof type === "string" ? id : (type?.name ?? id),
            description:
              typeof type === "string" ? undefined : type?.description,
            fieldType:
              typeof type === "string"
                ? "textual"
                : (type?.type ?? type?.field_type ?? "textual"),
            acceptanceCriteria:
              typeof type === "string"
                ? null
                : (type?.acceptance_criteria ?? null),
            example: typeof type === "string" ? null : (type?.example ?? null),
          });
        }
      }

      return {
        countryCode: query.countryCode,
        phoneNumberType,
        action,
        requirementsMet: requirements.length === 0,
        requirements,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch regulatory requirements for ${query.countryCode}/${phoneNumberType}: ${error?.message}`,
      );
      throw error;
    }
  }

  async getNumberOrderRequirements(
    numberOrderPhoneNumberId: string,
  ): Promise<NumberOrderRequirements> {
    const { data } = await this.telnyxClient.get(
      `/number_order_phone_numbers/${numberOrderPhoneNumberId}`,
    );

    const countryCode: string = data?.country_code ?? "";
    const phoneNumberType: string = data?.phone_number_type ?? "local";

    // Enrich the bare requirement ids attached to this number with the
    // human-readable details for the country/type combination so the UI can be
    // descriptive about what each document/field is.
    const details = new Map<string, RegulatoryRequirement>();
    if (countryCode) {
      try {
        const catalog = await this.getRegulatoryRequirements({
          countryCode,
          phoneNumberType:
            phoneNumberType as RegulatoryRequirementsQuery["phoneNumberType"],
          action: "ordering",
        });
        for (const req of catalog.requirements) details.set(req.id, req);
      } catch (err: any) {
        this.logger.warn(
          `Could not enrich requirement details for ${countryCode}/${phoneNumberType}: ${err?.message}`,
        );
      }
    }

    const rawReqs: any[] = Array.isArray(data?.regulatory_requirements)
      ? data.regulatory_requirements
      : [];

    const requirements: NumberOrderRequirementItem[] = rawReqs.map((req) => {
      const id: string = req?.requirement_id ?? req?.field_type ?? "";
      const detail = details.get(id);
      return {
        id,
        name: detail?.name ?? req?.name ?? id,
        description: detail?.description,
        fieldType: detail?.fieldType ?? req?.field_type ?? "textual",
        acceptanceCriteria: detail?.acceptanceCriteria ?? null,
        example: detail?.example ?? null,
        status: req?.status ?? null,
        reason:
          req?.reason ??
          req?.declined_reason ??
          req?.rejection_reason ??
          req?.requirement_status_reason ??
          null,
        fieldValue: req?.field_value ?? null,
      };
    });

    return {
      numberOrderPhoneNumberId: data?.id ?? numberOrderPhoneNumberId,
      phoneNumber: data?.phone_number ?? "",
      countryCode,
      phoneNumberType,
      requirementsStatus: data?.requirements_status ?? "pending",
      requirementsMet: !!data?.requirements_met,
      requirements,
    };
  }

  async uploadDocument(file: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<UploadedDocument> {
    const data = await this.telnyxClient.uploadFile("/documents", file);
    const documentId: string = data?.data?.id ?? data?.id;

    if (!documentId) {
      throw new HttpException("Telnyx did not return a document id", 502);
    }

    return { documentId, filename: file.filename };
  }

  /**
   * Validates an address against Telnyx's address validator
   * (`POST /addresses/actions/validate`). Returns whether it's deliverable plus
   * Telnyx's normalized "suggested" version, which the UI can offer to apply.
   */
  async validateAddress(
    input: AddressValidationInput,
  ): Promise<AddressValidationResult> {
    const payload: Record<string, unknown> = {
      country_code: input.countryCode,
      postal_code: input.postalCode,
      street_address: input.streetAddress,
      administrative_area: input.administrativeArea,
      extended_address: input.extendedAddress,
      locality: input.locality,
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined || payload[key] === "") {
        delete payload[key];
      }
    }

    // Telnyx returns the validation result for an *invalid* address with a
    // non-2xx status: the `{ data: { result, suggested } }` payload sits next to
    // a top-level `errors` array. Recover that body from the thrown exception
    // instead of surfacing it as a failure, so the UI can show the verdict.
    let body: any;
    try {
      body = await this.telnyxClient.post(
        "/addresses/actions/validate",
        payload,
      );
    } catch (err) {
      body = err instanceof HttpException ? err.getResponse() : undefined;
      if (!body || typeof body !== "object" || !("data" in body)) {
        throw err;
      }
    }

    const data = body?.data;
    const s = data?.suggested;
    const suggested = s
      ? {
          streetAddress: s.street_address,
          extendedAddress: s.extended_address,
          locality: s.locality,
          administrativeArea: s.administrative_area,
          postalCode: s.postal_code,
          countryCode: s.country_code,
        }
      : undefined;

    return {
      result: data?.result === "valid" ? "valid" : "invalid",
      suggested,
      errors: (body?.errors ?? []).map((e: Record<string, any>) => ({
        field: e?.source?.pointer
          ? String(e.source.pointer).replace(/^\//, "")
          : undefined,
        message: e?.detail || e?.title || undefined,
      })),
    };
  }

  async createAddress(
    input: TelnyxAddressInput,
  ): Promise<{ addressId: string }> {
    if (!input.businessName && !(input.firstName && input.lastName)) {
      throw new HttpException(
        "An address needs either a business name or a first and last name",
        422,
      );
    }

    const payload: Record<string, unknown> = {
      business_name: input.businessName,
      first_name: input.firstName,
      last_name: input.lastName,
      // Telnyx validates the address phone as strict E.164. Strip formatting
      // and drop anything that isn't a valid E.164 number (it's optional) so a
      // national-format value can't fail the whole address/order submission.
      phone_number: sanitizeE164(input.phoneNumber),
      street_address: input.streetAddress,
      extended_address: input.extendedAddress,
      locality: input.locality,
      administrative_area: input.administrativeArea,
      neighborhood: input.neighborhood,
      borough: input.borough,
      postal_code: input.postalCode,
      country_code: input.countryCode,
      // Telnyx is strict about regulatory addresses: ask it to validate so a
      // bad address fails here instead of silently blocking the order.
      validate_address: true,
    };

    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined || payload[key] === "") {
        delete payload[key];
      }
    }

    let data: any;
    try {
      ({ data } = await this.telnyxClient.post("/addresses", payload));
    } catch (err) {
      // When Telnyx rejects the address with field-level "Suggestion" entries,
      // surface a clear, actionable error (code-tagged) so the UI can point the
      // user at the "Validate address" tool instead of a raw provider blob.
      const body =
        err instanceof HttpException ? (err.getResponse() as any) : undefined;
      if (Array.isArray(body?.errors) && body.errors.length > 0) {
        throw new HttpException(
          {
            message:
              "The carrier could not validate this address. Use “Validate address” to review and apply the suggested corrections.",
            code: "ADDRESS_VALIDATION_FAILED",
            errors: body.errors,
          },
          422,
        );
      }
      throw err;
    }

    const addressId: string = data?.id;

    if (!addressId) {
      throw new HttpException("Telnyx did not return an address id", 502);
    }

    return { addressId };
  }

  async submitNumberOrderRequirements(
    numberOrderPhoneNumberId: string,
    requirements: RegulatoryRequirementValue[],
  ): Promise<NumberOrderRequirements> {
    await this.telnyxClient.patch(
      `/number_order_phone_numbers/${numberOrderPhoneNumberId}`,
      {
        regulatory_requirements: requirements.map((req) => ({
          requirement_id: req.requirementId,
          field_value: req.fieldValue,
        })),
      },
    );

    return this.getNumberOrderRequirements(numberOrderPhoneNumberId);
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

  /**
   * Attaches the number to a messaging profile (PATCH /phone_numbers/{id} with
   * `messaging_profile_id`). Telnyx will not route SMS/MMS for a number that is
   * not linked to a messaging profile, so this must run for every messaging
   * enabled number at provision time. Returns the messaging profile id Telnyx
   * reports the number ended up attached to.
   */
  async setMessagingProfile(
    phoneNumber: string,
    messagingProfileId: string,
  ): Promise<string | null> {
    const encoded = encodeURIComponent(phoneNumber);
    const { data } = await this.telnyxClient.patch(
      `/phone_numbers/${encoded}`,
      {
        messaging_profile_id: messagingProfileId,
      },
    );
    return data?.messaging_profile_id ?? messagingProfileId;
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

  /**
   * Telnyx's own view of a leg (`GET /calls/{id}` → `is_alive`).
   *
   * This is the tie-breaker for calls whose `call.hangup` webhook never
   * arrived: our database says the call is up, Telnyx knows whether it really
   * is. A 404 means Telnyx has no such leg any more, which is as good as dead.
   * Anything else (network error, 5xx) returns `null` — unknown, not dead.
   */
  async isCallAlive(callControlId: string): Promise<boolean | null> {
    try {
      const { data } = await this.telnyxClient.get<{
        data?: { is_alive?: boolean };
      }>(`/calls/${callControlId}`);
      return data?.is_alive ?? false;
    } catch (error: unknown) {
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : (error as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 422) return false;
      this.logger.warn(
        `Could not read call status for ${callControlId} from Telnyx (status=${status ?? "n/a"})`,
      );
      return null;
    }
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

  // ────────────────────────────────────────────────────────────
  // Desk Phones (SIP Devices) — Credential Connections + parking
  // ────────────────────────────────────────────────────────────

  /**
   * Create a Telnyx Credential Connection for a desk phone. The connection
   * carries its own SIP `user_name`/`password` (what the physical phone
   * registers with), a shared Outbound Voice Profile so outbound calls bill
   * through Ringee, and Park Outbound Calls enabled so every outbound call is
   * parked for a Call Control decision (credit / DNC / caller-ID validation)
   * before it is bridged to the PSTN.
   *
   * Telnyx constraints (enforce upstream): `user_name` 4–32 chars, alphanumeric
   * only; `password` 8–128 chars. Transport/media are left permissive so a
   * basic phone can still register — TLS/SRTP are recommended in the UI.
   */
  async createDeskPhoneConnection(params: {
    connectionName: string;
    userName: string;
    password: string;
    webhookEventUrl: string;
    outboundVoiceProfileId: string;
  }): Promise<{
    connectionId: string;
    connectionName: string;
    userName: string;
  }> {
    const payload = {
      connection_name: params.connectionName,
      user_name: params.userName,
      password: params.password,
      webhook_event_url: params.webhookEventUrl,
      webhook_api_version: "2",
      // "Park Outbound Calls": forces every outbound SIP call from this
      // connection into a parked state awaiting a Call Control command, instead
      // of bridging it straight to the URI destination.
      call_parking_enabled: true,
      outbound: {
        outbound_voice_profile_id: params.outboundVoiceProfileId,
      },
    };

    try {
      const { data } = await this.telnyxClient.post(
        "/credential_connections",
        payload,
      );
      return {
        connectionId: data?.id,
        connectionName: data?.connection_name ?? params.connectionName,
        userName: data?.user_name ?? params.userName,
      };
    } catch (error: any) {
      this.logger.error(
        "Error creating desk-phone credential connection",
        error?.response?.data || error?.message,
      );
      throw new HttpException(
        error?.response?.data?.errors?.[0]?.detail ||
          "Failed to create Telnyx credential connection",
        error?.response?.status || 500,
      );
    }
  }

  /** Rotate the SIP password on a desk-phone connection (username unchanged). */
  async updateDeskPhoneConnectionPassword(
    connectionId: string,
    password: string,
  ): Promise<void> {
    await this.telnyxClient.patch(`/credential_connections/${connectionId}`, {
      password,
    });
  }

  /**
   * Enable/disable a desk-phone connection. Disabling stops the phone from
   * registering and placing/receiving calls without deleting the connection.
   */
  async setDeskPhoneConnectionActive(
    connectionId: string,
    active: boolean,
  ): Promise<void> {
    await this.telnyxClient.patch(`/credential_connections/${connectionId}`, {
      active,
    });
  }

  /** Permanently delete a desk-phone connection in Telnyx. */
  async deleteDeskPhoneConnection(connectionId: string): Promise<void> {
    await this.telnyxClient.delete(`/credential_connections/${connectionId}`);
  }

  /**
   * Best-effort registration snapshot. Telnyx does not expose live SIP
   * registration state for credential connections through this endpoint, so we
   * return the connection's `active` flag and let the webhook-driven
   * `lastRegisteredAt` be the source of truth for "registered". Returns null if
   * the connection no longer exists.
   */
  async getDeskPhoneConnection(connectionId: string): Promise<{
    id: string;
    active: boolean;
    userName?: string;
  } | null> {
    try {
      const { data } = await this.telnyxClient.get(
        `/credential_connections/${connectionId}`,
      );
      if (!data?.id) return null;
      return {
        id: data.id,
        active: data.active !== false,
        userName: data.user_name,
      };
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  }

  /**
   * Connect a parked desk-phone outbound call to its PSTN destination. The
   * parked leg already exists on the device's connection (which carries our
   * OVP), so a Call Control `transfer` dials the destination and bridges on
   * answer, billing through Ringee. `from` presents the validated caller ID.
   */
  async connectParkedCall(
    callControlId: string,
    params: {
      to: string;
      from: string;
      commandId?: string;
      clientState?: Record<string, unknown>;
      /** Hard cap (seconds) after which Telnyx auto-ends the call. */
      timeLimitSecs?: number;
    },
  ): Promise<void> {
    await this.telnyxClient.post(`/calls/${callControlId}/actions/transfer`, {
      to: params.to,
      from: params.from,
      command_id: params.commandId || crypto.randomUUID(),
      ...(params.timeLimitSecs
        ? { time_limit_secs: params.timeLimitSecs }
        : {}),
      client_state: Buffer.from(
        JSON.stringify(params.clientState ?? { action: "desk_phone_outbound" }),
      ).toString("base64"),
    });
  }
}
