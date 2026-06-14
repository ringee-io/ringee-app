interface Capabilities {
  sms: boolean;
  hdVoice: boolean;
  internationalSms: boolean;
  emergency: boolean;
  mms: boolean;
  voice: boolean;
  fax: boolean;
}

export type NumberCapability = keyof Capabilities;

export interface CostInformation {
  currency: "USD";
  monthlyCost: number;
  upfrontCost: number;
}

export interface AvailableNumber {
  phoneNumber: string;
  countryCode: string;
  locality?: string;
  region?: string;
  numberType?: string;
  capabilities: Capabilities;
  costInformation: CostInformation;
}

export interface AssignedNumber {
  id: string;
  status: string;
  phoneNumber: string;
  phoneNumberType: string;
  countryCode: string;
  connectionId: string;
  connectionName: string;
  billingGroupId: string;
}

export interface PurchaseNumbers {
  billingGroupId: string;
  orderId: string;
  phoneNumbersCount: number;
  status: string;
  provider: string;
  phoneNumbers: {
    id: string;
    status: string;
    phoneNumber: string;
    phoneNumberType: string;
    countryCode: string;
    requirementsStatus: string;
    requirementsMet: boolean;
    /**
     * Regulatory requirements attached to this number by the provider. Present
     * (and `requirementsMet === false`) when the country/number type needs
     * document verification before the number can be activated.
     */
    regulatoryRequirements: RegulatoryRequirement[];
    connectionId: string;
    connectionName: string;
    billingGroupId: string;
  }[];
}

/** Kind of value the provider expects for a regulatory requirement. */
export type RequirementFieldType =
  | "textual"
  | "document"
  | "address"
  | "action"
  | string;

/**
 * A single regulatory requirement that must be fulfilled before a number can
 * be activated (e.g. a proof-of-address document, a local business address, or
 * a textual field). `id` is the provider's requirement identifier that values
 * are submitted against.
 */
export interface RegulatoryRequirement {
  id: string;
  name: string;
  description?: string;
  fieldType: RequirementFieldType;
  /** Provider validation rules for the value (shape varies by requirement). */
  acceptanceCriteria?: Record<string, unknown> | null;
  example?: string | null;
}

export interface RegulatoryRequirementsQuery {
  countryCode: string; // ISO (eg. "GB")
  phoneNumberType?: "local" | "toll_free" | "mobile" | "national";
  action?: "ordering" | "porting";
}

export interface RegulatoryRequirementsResult {
  countryCode: string;
  phoneNumberType: string;
  action: string;
  /** true when no documentation is required for this combination. */
  requirementsMet: boolean;
  requirements: RegulatoryRequirement[];
}

/**
 * The regulatory requirements attached to one specific number within an order,
 * enriched with the human-readable details (name/description/criteria/example)
 * needed to guide the user, plus the live fulfilment status for each one.
 */
export interface NumberOrderRequirements {
  /** Telnyx number_order_phone_number id (PATCH target). */
  numberOrderPhoneNumberId: string;
  phoneNumber: string;
  countryCode: string;
  phoneNumberType: string;
  /** Provider-level status of the order line ("pending" | "requirement-info-pending" | ...). */
  requirementsStatus: string;
  requirementsMet: boolean;
  requirements: NumberOrderRequirementItem[];
}

export interface NumberOrderRequirementItem extends RegulatoryRequirement {
  /** Per-requirement fulfilment status ("approved" | "pending" | "declined" | ...). */
  status?: string | null;
  /** Provider-supplied reason when a requirement was declined/rejected. */
  reason?: string | null;
  /** Value already submitted for this requirement, if any. */
  fieldValue?: string | null;
  /** Locally-persisted form value (autosave), so the UI can prefill on reload. */
  draft?: RequirementDraft | null;
}

/** What the user has saved (not necessarily submitted) for one requirement. */
export interface RequirementDraft {
  textValue?: string | null;
  address?: Record<string, unknown> | null;
  document?: { id: string; filename: string } | null;
}

/** Coarse outcome of reconciling a pending order line against the provider. */
export type NumberVerificationOutcome =
  | "approved"
  | "rejected"
  | "pending"
  | "expired";

/**
 * Input for Telnyx POST /addresses. Telnyx validates these strictly, so the
 * caller must supply a complete, deliverable postal address. Field names mirror
 * Telnyx's (camelCase here, mapped to snake_case when sent).
 */
export interface TelnyxAddressInput {
  /** Business name OR firstName+lastName is required by Telnyx. */
  businessName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  /** Required. Street + house number. */
  streetAddress: string;
  /** Apartment / suite / floor. */
  extendedAddress?: string;
  /** Required. City / town. */
  locality: string;
  /** State / province / region — required in many countries. */
  administrativeArea?: string;
  neighborhood?: string;
  borough?: string;
  /** Postal / ZIP code — required in most countries. */
  postalCode?: string;
  /** Required. ISO 3166-1 alpha-2 (e.g. "GB", "DE"). */
  countryCode: string;
}

export interface UploadedDocument {
  documentId: string;
  filename: string;
}

/** Minimal address fields Telnyx's validator needs (country/postal/street). */
export interface AddressValidationInput {
  countryCode: string;
  postalCode: string;
  streetAddress: string;
  locality?: string;
  administrativeArea?: string;
  extendedAddress?: string;
}

/** Telnyx's normalized (deliverable) version of a submitted address. */
export interface AddressSuggestion {
  streetAddress?: string;
  extendedAddress?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
}

/** Result of validating an address against Telnyx's address validator. */
export interface AddressValidationResult {
  result: "valid" | "invalid";
  /** Normalized address Telnyx recommends using, when available. */
  suggested?: AddressSuggestion;
  /** Per-field problems Telnyx reported (field is the JSON pointer field). */
  errors?: { field?: string; message?: string }[];
}

/** A single regulatory requirement value the user is submitting. */
export interface RegulatoryRequirementValue {
  requirementId: string;
  /** Resolved value: address id, document id, or the textual value. */
  fieldValue: string;
}

/**
 * What the user submits for one requirement before it is resolved into a
 * provider field_value. Exactly one of textValue / documentId / address is
 * expected, matching `fieldType`.
 */
export interface SubmitRegulatoryRequirementInput {
  requirementId: string;
  fieldType: RequirementFieldType;
  /** For `textual` requirements. */
  textValue?: string;
  /** For `document` requirements — id of a RegulatoryDocument in Ringee's bucket. */
  regulatoryDocumentId?: string;
  /** For `address` requirements — created with the provider then referenced. */
  address?: TelnyxAddressInput;
}

/**
 * Autosave variant of {@link SubmitRegulatoryRequirementInput}: every value is
 * optional and the address may be partial while the user is still typing.
 */
export interface DraftRegulatoryRequirementInput {
  requirementId: string;
  fieldType: RequirementFieldType;
  textValue?: string;
  regulatoryDocumentId?: string;
  address?: Partial<TelnyxAddressInput>;
}

export type NumberFeature =
  | "sms"
  | "mms"
  | "voice"
  | "fax"
  | "emergency"
  | "hd_voice"
  | "international_sms"
  | "local_calling";

export interface SearchAvailableParams {
  countryCode: string; // ISO (eg. "US")
  areaCode?: string; // ejemplo: "415"
  numberType?: "local" | "toll_free" | "mobile";
  features?: NumberFeature[];
  limit?: number;
}
