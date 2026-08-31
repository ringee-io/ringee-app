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
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

const AGENT_TYPES = ["appointment_booking", "reminders_notifications"] as const;
const MODEL_PROVIDERS = ["ringee", "openai", "anthropic", "google"] as const;
const EXTRACTION_TYPES = ["text", "number", "boolean", "select"] as const;

/**
 * Validation here is the boundary that decides what a user sees when they get
 * something wrong, so every rule carries the sentence to show them. A message
 * that names the field and the fix ("Add the country and city, e.g.
 * America/New_York") is the difference between a form a user can finish and one
 * they abandon — the frontend validates the same rules for immediacy, but this
 * is the one that is enforced.
 */

/** Blank is allowed everywhere optional text is; the emptiness means "unset". */
const isBlank = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === "";

@ValidatorConstraint({ name: "isCompanyWebsite", async: false })
class IsCompanyWebsiteConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (isBlank(value)) return true;
    if (typeof value !== "string") return false;
    // A user types "acme.com" as often as "https://acme.com", and both are a
    // usable answer — what is rejected is something that is not a host at all.
    const withScheme = /^https?:\/\//i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    try {
      const url = new URL(withScheme);
      return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname);
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "Enter a website like acme.com or https://acme.com.";
  }
}

@ValidatorConstraint({ name: "isIanaTimezone", async: false })
class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (isBlank(value)) return true;
    if (typeof value !== "string") return false;
    try {
      // The only reliable check is asking the platform to use it — an unknown
      // zone throws here rather than at booking time, months later.
      new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "Use a time zone like America/New_York or Europe/Madrid.";
  }
}

export class VoiceAgentExtractionFieldDto {
  @IsString()
  @IsNotEmpty({ message: "Every field you extract needs a name." })
  @MaxLength(60)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      "A field key must start with a letter and use only lowercase letters, numbers and underscores.",
  })
  key!: string;

  @IsString()
  @IsNotEmpty({ message: "Every field you extract needs a name." })
  @MaxLength(80)
  label!: string;

  @IsIn(EXTRACTION_TYPES, {
    message: "Pick text, number, yes/no or a list for this field.",
  })
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
  @IsNotEmpty({ message: "Give the agent a name." })
  @MaxLength(60, { message: "The name has to be 60 characters or fewer." })
  name?: string;

  @IsOptional()
  @IsIn(MODEL_PROVIDERS, { message: "Pick one of the available models." })
  modelProvider?: (typeof MODEL_PROVIDERS)[number];

  /** Write-only: handed to the voice provider and never stored by Ringee. */
  @IsOptional()
  @IsString()
  @MaxLength(400, { message: "That does not look like an API key." })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceId?: string | null;

  /**
   * Company context this agent speaks for. Unset leaves the agent on the
   * workspace-level profile, which is what pre-existing agents keep using.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: "The company name has to be 120 characters or fewer.",
  })
  companyName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Validate(IsCompanyWebsiteConstraint)
  companyWebsite?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000, {
    message: "The description has to be 4000 characters or fewer.",
  })
  companyDescription?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceAgentAnalysisDto)
  analysis?: VoiceAgentAnalysisDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: "An agent can extract at most 20 fields." })
  @ValidateNested({ each: true })
  @Type(() => VoiceAgentExtractionFieldDto)
  extractionFields?: VoiceAgentExtractionFieldDto[];

  @IsOptional()
  @IsUUID(undefined, { message: "Choose one of your connected calendars." })
  calendarIntegrationId?: string | null;

  @IsOptional()
  @IsInt({ message: "The meeting length has to be a whole number of minutes." })
  @Min(5, { message: "Meetings have to be at least 5 minutes long." })
  @Max(240, { message: "Meetings have to be 240 minutes or shorter." })
  meetingDurationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Validate(IsIanaTimezoneConstraint)
  timezone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: "The meeting title has to be 120 characters or fewer.",
  })
  meetingTitle?: string | null;
}

export class CreateVoiceAgentDto extends SaveVoiceAgentDto {
  @IsString()
  @IsNotEmpty({ message: "Give the agent a name." })
  @MaxLength(60, { message: "The name has to be 60 characters or fewer." })
  declare name: string;

  @IsIn(AGENT_TYPES, { message: "Pick what the agent should do." })
  type!: (typeof AGENT_TYPES)[number];
}

export class VerifyVoiceAgentCredentialDto {
  @IsIn(MODEL_PROVIDERS, { message: "Pick one of the available models." })
  provider!: (typeof MODEL_PROVIDERS)[number];

  @IsString()
  @IsNotEmpty({ message: "Paste the API key first." })
  @MaxLength(400, { message: "That does not look like an API key." })
  apiKey!: string;
}

export class SetVoiceAgentStatusDto {
  @IsIn(["active", "disabled"])
  status!: "active" | "disabled";
}

export class StartVoiceAgentCallDto {
  // Deliberately not E.164-strict: `VoiceAgentCallService` normalizes the
  // number and rejects an undialable one with the number in the message, and
  // the extension, CLI and MCP all pass national formats today.
  @IsString()
  @IsNotEmpty({ message: "Enter the number to call." })
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
  @MaxLength(120, {
    message: "The company name has to be 120 characters or fewer.",
  })
  companyName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Validate(IsCompanyWebsiteConstraint)
  companyWebsite?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000, {
    message: "The description has to be 4000 characters or fewer.",
  })
  companyDescription?: string | null;
}

export class GenerateCompanyProfileDto {
  @IsString()
  @IsNotEmpty({ message: "Add the website first." })
  @MaxLength(300)
  @Validate(IsCompanyWebsiteConstraint)
  website!: string;
}

export class AddKnowledgeUrlDto {
  // `requirePublicUrl` is what decides whether Ringee will fetch this — it
  // accepts a bare host and refuses a private one, so the shape check here
  // stays as loose as it is.
  @IsString()
  @IsNotEmpty({ message: "Paste the page's address." })
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class AddKnowledgeTextDto {
  @IsString()
  @IsNotEmpty({ message: "Give this note a title." })
  @MaxLength(120)
  label!: string;

  @IsString()
  @IsNotEmpty({ message: "Write something for the agent to learn." })
  @MaxLength(100_000, { message: "That note is too long to index." })
  content!: string;
}

export class ReuseKnowledgeSourceDto {
  @IsUUID("4", { message: "Pick a source to reuse." })
  sourceId!: string;
}

export class StartVoiceAgentTestSessionDto {
  /** Values to use for this test conversation; validated against the type. */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
