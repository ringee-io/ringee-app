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

export class CreatePhoneCheckoutDto {
  @IsString()
  numberId!: string;

  @ValidateNested()
  @Type(() => CostInformationDto)
  costInformation!: CostInformationDto;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}
