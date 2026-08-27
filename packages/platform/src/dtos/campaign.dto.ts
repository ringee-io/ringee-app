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

/**
 * Campaign lifecycle states.
 *
 * NOTE: unlike every neighbouring concept (CampaignLeadStatus,
 * AgentSessionStatus, CallAttemptStatus, CallSessionStatus) this is NOT a
 * Prisma enum — `Campaign.status` is a plain `String` column, so the database
 * cannot reject an invalid value. This union, the DTO validator and
 * `isCampaignStatus` are the enforcement until the column is migrated to an
 * enum. Anything that writes a campaign status must go through them.
 */
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export const VALID_CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "completed",
];

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return (
    typeof value === "string" &&
    (VALID_CAMPAIGN_STATUSES as string[]).includes(value)
  );
}

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
  @IsArray()
  @IsString({ each: true })
  rotationNumberIds?: string[];

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
  @IsIn(VALID_CAMPAIGN_STATUSES)
  status!: CampaignStatus;
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
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  revenue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companySize?: string;

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
