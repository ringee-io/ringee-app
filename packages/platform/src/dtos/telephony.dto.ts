import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  ArrayNotEmpty,
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

  @IsString()
  @IsOptional()
  documentId?: string;

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
