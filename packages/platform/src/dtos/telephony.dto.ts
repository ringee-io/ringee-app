import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  ArrayNotEmpty,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class RequestCallerIdVerificationDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(["sms", "call"])
  method!: "sms" | "call";

  @IsString()
  @IsOptional()
  extension?: string;
}

export class VerifyCallerIdDto {
  @IsString()
  @IsNotEmpty()
  verificationCode!: string;
}

/**
 * A postal address submitted for an "address" regulatory requirement. Telnyx
 * validates these strictly, so streetAddress, locality and countryCode are
 * mandatory and a name (business or person) is required by the provider.
 */
export class TelnyxAddressDto {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsNotEmpty()
  streetAddress!: string;

  @IsString()
  @IsOptional()
  extendedAddress?: string;

  @IsString()
  @IsNotEmpty()
  locality!: string;

  @IsString()
  @IsOptional()
  administrativeArea?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;

  @IsString()
  @IsOptional()
  borough?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  /** ISO 3166-1 alpha-2 country code (e.g. "GB"). */
  @IsString()
  @IsNotEmpty()
  countryCode!: string;
}

export class SubmitRequirementItemDto {
  @IsString()
  @IsNotEmpty()
  requirementId!: string;

  @IsString()
  @IsIn(["textual", "document", "address"])
  fieldType!: "textual" | "document" | "address";

  @IsString()
  @IsOptional()
  textValue?: string;

  /** Id of a RegulatoryDocument stored in Ringee's bucket (document fields). */
  @IsUUID()
  @IsOptional()
  regulatoryDocumentId?: string;

  @ValidateNested()
  @Type(() => TelnyxAddressDto)
  @IsOptional()
  address?: TelnyxAddressDto;
}

export class SubmitRequirementsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SubmitRequirementItemDto)
  requirements!: SubmitRequirementItemDto[];
}

/** Address to validate — Telnyx requires country, postal code and street. */
export class ValidateAddressDto {
  @IsString()
  @IsNotEmpty()
  countryCode!: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  streetAddress!: string;

  @IsString()
  @IsOptional()
  locality?: string;

  @IsString()
  @IsOptional()
  administrativeArea?: string;

  @IsString()
  @IsOptional()
  extendedAddress?: string;
}

/** Address while editing — every field optional so partial autosave passes. */
export class PartialTelnyxAddressDto {
  @IsString() @IsOptional() businessName?: string;
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() streetAddress?: string;
  @IsString() @IsOptional() extendedAddress?: string;
  @IsString() @IsOptional() locality?: string;
  @IsString() @IsOptional() administrativeArea?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsString() @IsOptional() borough?: string;
  @IsString() @IsOptional() postalCode?: string;
  @IsString() @IsOptional() countryCode?: string;
}

export class DraftRequirementItemDto {
  @IsString()
  @IsNotEmpty()
  requirementId!: string;

  @IsString()
  @IsIn(["textual", "document", "address"])
  fieldType!: "textual" | "document" | "address";

  @IsString()
  @IsOptional()
  textValue?: string;

  @IsUUID()
  @IsOptional()
  regulatoryDocumentId?: string;

  @ValidateNested()
  @Type(() => PartialTelnyxAddressDto)
  @IsOptional()
  address?: PartialTelnyxAddressDto;
}

/**
 * Autosave payload — same items as a submission but the array may be empty and
 * individual values (including address fields) may be missing while the user is
 * still filling the form.
 */
export class SaveRequirementsDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftRequirementItemDto)
  requirements!: DraftRequirementItemDto[];
}
