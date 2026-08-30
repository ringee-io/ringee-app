import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const AGENT_TYPES = ["appointment_booking", "reminders_notifications"] as const;
const MODEL_PROVIDERS = ["ringee", "openai", "anthropic", "google"] as const;
const EXTRACTION_TYPES = ["text", "number", "boolean", "select"] as const;

export class VoiceAgentExtractionFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @IsIn(EXTRACTION_TYPES)
  type!: (typeof EXTRACTION_TYPES)[number];

  @IsString()
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  options?: string[];
}

export class VoiceAgentAnalysisDto {
  @IsOptional()
  @IsBoolean()
  summary?: boolean;

  @IsOptional()
  @IsBoolean()
  sentiment?: boolean;
}

export class SaveVoiceAgentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(MODEL_PROVIDERS)
  modelProvider?: (typeof MODEL_PROVIDERS)[number];

  /** Write-only: handed to the voice provider and never stored by Ringee. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceAgentAnalysisDto)
  analysis?: VoiceAgentAnalysisDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VoiceAgentExtractionFieldDto)
  extractionFields?: VoiceAgentExtractionFieldDto[];

  @IsOptional()
  @IsUUID()
  calendarIntegrationId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  meetingDurationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  meetingTitle?: string | null;
}

export class CreateVoiceAgentDto extends SaveVoiceAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  declare name: string;

  @IsIn(AGENT_TYPES)
  type!: (typeof AGENT_TYPES)[number];
}

export class VerifyVoiceAgentCredentialDto {
  @IsIn(MODEL_PROVIDERS)
  provider!: (typeof MODEL_PROVIDERS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  apiKey!: string;
}

export class SetVoiceAgentStatusDto {
  @IsIn(["active", "disabled"])
  status!: "active" | "disabled";
}

export class StartVoiceAgentCallDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  to!: string;

  @IsOptional()
  @IsUUID()
  from_number_id?: string;

  /** Values for this agent type's dynamic variables; validated server-side. */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  /** Caller passthrough, echoed back on the result. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SaveCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  companyWebsite?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  companyDescription?: string | null;
}

export class GenerateCompanyProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  website!: string;
}

export class AddKnowledgeUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class AddKnowledgeTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  content!: string;
}

export class StartVoiceAgentTestSessionDto {
  /** Values to use for this test conversation; validated against the type. */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
