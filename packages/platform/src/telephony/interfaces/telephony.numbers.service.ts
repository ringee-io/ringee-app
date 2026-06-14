import {
  AddressValidationInput,
  AddressValidationResult,
  AssignedNumber,
  AvailableNumber,
  NumberOrderRequirements,
  PurchaseNumbers,
  RegulatoryRequirementsQuery,
  RegulatoryRequirementsResult,
  RegulatoryRequirementValue,
  SearchAvailableParams,
  TelnyxAddressInput,
  UploadedDocument,
} from "./available.number";

export interface TelephonyNumbersService {
  searchAvailableNumbers(
    params: SearchAvailableParams,
  ): Promise<AvailableNumber[]>;
  purchaseNumbers(phoneNumbers: string[]): Promise<PurchaseNumbers>;
  assignNumberToConnection(
    phoneNumber: string,
    connectionId?: string,
  ): Promise<AssignedNumber>;
  /**
   * Lists the regulatory requirements (documents / fields) that must be
   * fulfilled to order a number for a given country + number type, so the UI
   * can tell the user what they'll need to provide.
   */
  getRegulatoryRequirements(
    query: RegulatoryRequirementsQuery,
  ): Promise<RegulatoryRequirementsResult>;

  /**
   * Reads the regulatory requirements attached to a specific number within an
   * order, enriched with descriptions/criteria/examples and the live status of
   * each requirement.
   */
  getNumberOrderRequirements(
    numberOrderPhoneNumberId: string,
  ): Promise<NumberOrderRequirements>;

  /** Uploads a document to the provider and returns its id. */
  uploadDocument(file: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<UploadedDocument>;

  /**
   * Validates an address against the provider's address validator, returning
   * whether it is deliverable plus a normalized suggestion when available.
   */
  validateAddress(
    input: AddressValidationInput,
  ): Promise<AddressValidationResult>;

  /**
   * Creates a validated address with the provider and returns its id, to be
   * used as the field_value of an "address" regulatory requirement.
   */
  createAddress(input: TelnyxAddressInput): Promise<{ addressId: string }>;

  /**
   * Submits regulatory requirement values for a number within an order. Returns
   * the refreshed requirement state.
   */
  submitNumberOrderRequirements(
    numberOrderPhoneNumberId: string,
    requirements: RegulatoryRequirementValue[],
  ): Promise<NumberOrderRequirements>;
}
