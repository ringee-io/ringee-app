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
