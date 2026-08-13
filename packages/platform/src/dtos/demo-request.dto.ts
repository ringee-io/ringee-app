import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/** Public demo request submitted from the marketing site (/request-demo). */
export class CreateDemoRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  companyWebsite!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numberOfUsers!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  referralSource!: string;

  /** ISO 3166-1 alpha-2 country detected from the visitor's browser locale. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  /** Honeypot — hidden on the form, so only bots fill it. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fax?: string;
}
