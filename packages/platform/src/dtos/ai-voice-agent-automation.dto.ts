import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { CURATED_VOICE_LANGUAGES } from "../voice-agents/voices.catalog";

/**
 * Bodies of the "Ringee IA Voice Agents" rail (AGENT-018).
 *
 * The rail asks only for what is missing, so almost everything here is
 * optional: an existing agent may be reused instead of named, and the server
 * fills language, voice and company from what the workspace already has. Ids
 * are shape-checked here and authorized in the service — a client id is never
 * permission to use a number, a calendar or a member.
 */

/** Shortest and longest reminder lead time the rail accepts: 15 min to 14 days. */
export const REMINDER_OFFSET_MIN_MINUTES = 15;
export const REMINDER_OFFSET_MAX_MINUTES = 14 * 24 * 60;

class QuickAgentChoiceDto {
  /** Reuse this agent instead of creating one. */
  @IsOptional()
  @IsUUID("all", { message: "Choose one of your agents." })
  agentId?: string;

  /** Name for a new agent; the rail suggests one the user can edit. */
  @IsOptional()
  @IsString()
  @MaxLength(60, {
    message: "The agent name has to be 60 characters or fewer.",
  })
  name?: string;

  /** Language of a new agent's voice, from the person's interface language. */
  @IsOptional()
  @IsIn(CURATED_VOICE_LANGUAGES as unknown as string[], {
    message: "Choose a supported language.",
  })
  language?: string;

  /**
   * The voice a new agent speaks with, picked in the rail. Wins over
   * `language`; checked against the catalogue when the agent is created.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceId?: string;
}

export class ReminderAutomationSetupDto extends QuickAgentChoiceDto {
  @IsOptional()
  @IsUUID("all", { message: "Choose a number to call from." })
  callerNumberId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Choose at least one calendar." })
  @ArrayMaxSize(20)
  @IsUUID("all", { each: true, message: "Choose one of your calendars." })
  calendarIds!: string[];

  @Type(() => Number)
  @IsInt({ message: "The reminder time must be a whole number of minutes." })
  @Min(REMINDER_OFFSET_MIN_MINUTES, {
    message: "A reminder has to be at least 15 minutes before the meeting.",
  })
  @Max(REMINDER_OFFSET_MAX_MINUTES, {
    message: "A reminder can be at most 14 days before the meeting.",
  })
  offsetMinutes!: number;
}

export class AutomationNumberRefDto {
  @IsIn(["ringee", "external"])
  kind!: "ringee" | "external";

  @IsUUID()
  id!: string;
}

/** A person or team that takes the calls back while the receptionist is paused. */
export class AutomationFallbackDto {
  @IsIn(["user", "ring_group"], {
    message: "Calls can fall back to a person or a ring group.",
  })
  destinationType!: "user" | "ring_group";

  @IsUUID()
  destinationId!: string;
}

export class ReceptionistAutomationSetupDto extends QuickAgentChoiceDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Choose at least one number to answer." })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AutomationNumberRefDto)
  numbers!: AutomationNumberRefDto[];

  /**
   * Explicit backup for every number. Omitted, each number goes back to what
   * it did before the receptionist took it.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => AutomationFallbackDto)
  fallback?: AutomationFallbackDto | null;
}

export class SchedulingAutomationSetupDto extends QuickAgentChoiceDto {
  @IsOptional()
  @IsUUID("all", { message: "Choose a number to call from." })
  callerNumberId?: string;

  /** The Ringee calendar it books on; omitted means the global calendar. */
  @IsOptional()
  @IsUUID("all", { message: "Choose one of your calendars." })
  calendarId?: string;
}

export class SetAutomationEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class ReminderScopeQueryDto {
  /** Comma-separated calendar ids. */
  @IsString()
  @MaxLength(800)
  calendarIds!: string;

  @Type(() => Number)
  @IsInt()
  @Min(REMINDER_OFFSET_MIN_MINUTES)
  @Max(REMINDER_OFFSET_MAX_MINUTES)
  offsetMinutes!: number;
}

/** "Call to schedule": the lead, and the member the meeting will be with. */
export class StartSchedulingCallDto {
  @IsUUID("all", { message: "Choose a contact to call." })
  contactId!: string;

  /** Defaults to the person asking; any other member is checked server-side. */
  @IsOptional()
  @IsUUID("all", { message: "Choose a member of your organization." })
  responsibleUserId?: string;

  /** What the agent calls the lead, when the contact has no first name yet. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsUUID("all", { message: "Choose a number to call from." })
  fromNumberId?: string;
}

/** "Complete email": the lead's address for a confirmation waiting on it. */
export class CompleteMeetingEmailDto {
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  email!: string;
}

export class SetMeetingResponsibleDto {
  @IsUUID("all", { message: "Choose a member of your organization." })
  userId!: string;
}
