import { Type } from "class-transformer";
import {
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
