import { Type } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateCreditCheckoutDto {
  @IsNumber()
  @Min(1, { message: "Amount must be greater than 0" })
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}

export class CostInformationDto {
  @IsNumber()
  @Min(0)
  monthlyCost!: number;

  @IsString()
  currency!: string;

  @IsNumber()
  @Min(0)
  upfrontCost!: number;
}

export class CreateMonthlyCreditSubscriptionDto {
  @IsNumber()
  @Min(5, { message: "Monthly amount must be at least $5" })
  amount!: number;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}

export class CreateAutoReloadSetupDto {
  @IsNumber()
  @Min(5, { message: "Reload amount must be at least $5" })
  reloadAmount!: number;

  @IsNumber()
  @Min(1, { message: "Threshold must be at least $1" })
  threshold!: number;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}

export class UpdateAutoReloadSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoReloadEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  autoReloadThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  autoReloadAmount?: number;
}

export class RequestCreditDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  workspace?: string;
}

export class CreatePhoneCheckoutDto {
  @IsString()
  numberId!: string;

  /**
   * IGNORED server-side. The checkout price is resolved authoritatively from
   * the provider in `createPhoneCheckout`; this field is kept only optional for
   * backward compatibility with older clients that still send it. Do NOT read
   * it to price anything — that is the price-tampering vector this replaced.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CostInformationDto)
  costInformation?: CostInformationDto;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}
