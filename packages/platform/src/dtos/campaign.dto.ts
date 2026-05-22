import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ValidateNested,
  IsIn,
  IsEmail,
  IsObject,
  IsNumber,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(["progressive", "preview"])
  dialerMode?: "progressive" | "preview";

  @IsOptional()
  @IsString()
  callerIdId?: string;

  @IsOptional()
  @IsString()
  numberPurchasedId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  workStartMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  workEndMin?: number;

  @IsOptional()
  @IsArray()
  workDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  wrapUpTimeSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  retryDelayMin?: number;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCampaignStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(["draft", "active", "paused", "completed"])
  status!: "draft" | "active" | "paused" | "completed";
}

export class ManualLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ImportLeadsManualDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualLeadDto)
  leads!: ManualLeadDto[];
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export const VALID_CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "completed",
];
