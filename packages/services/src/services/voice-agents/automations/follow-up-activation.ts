import { BadRequestException } from "@nestjs/common";
import { isAnalyticsEntrySource } from "@ringee/platform";
import type { CallingWindow } from "../../reminders/reminder-call-schedule";

/**
 * The shared "Automatic follow-up" review (Stage 4C): the vocabulary, the
 * proposal defaults and the pure decisions the review and its adoption share.
 * `VoiceAgentAutomationService` gathers the workspace's real state and owns
 * every side effect; nothing here reads or writes anything.
 */

/** The onboarding version a workspace adopts. */
export const FOLLOW_UP_ONBOARDING_VERSION = "followup-v1";

/** What a new reminders policy proposes: four hours before (AGENT-019). */
export const PROPOSED_REMINDER_OFFSET_MINUTES = 240;

/** The confirmation lead times the review offers. */
export const FOLLOW_UP_OFFSET_CHOICES = [120, 240, 1440] as const;

/** The review's capabilities: the two specialists every workspace gets. */
export type FollowUpCapability = "scheduling" | "reminders";

/** The rows of "Your configuration", in the order the screen shows them. */
export type FollowUpRowKey =
  | "identity"
  | "shareable"
  | "number"
  | "callbacks"
  | "calendar"
  | "calling_hours"
  | "time_zone"
  | "responsible";

/**
 * A concrete thing in the way, each with one action on the screen. Codes are
 * a public contract of the review API: additive only.
 */
export type FollowUpRequirementCode =
  /** No number of the workspace's own can place AI calls (shared ≠ own). */
  | "get_number"
  /** Several usable numbers and none chosen (AGENT-008). */
  | "choose_number"
  /** The only own number is still being bought or verified. */
  | "number_pending"
  /** The calendar offers no bookable hours, so no time can be proposed. */
  | "set_availability"
  /** The workspace balance cannot pay for a call (BILL-009). */
  | "add_credit"
  /** An existing specialist is broken or switched off. */
  | "fix_agent";

export type FollowUpState =
  /** The workspace is not admitted to automated work (pilot gate). */
  | "not_admitted"
  /** Something the configuration needs is missing. */
  | "needs_configuration"
  /** Configuration complete; there is no money to call with. */
  | "add_credit"
  /** Everything is ready and nothing was adopted yet. */
  | "ready_to_activate"
  /** Adopted, but a requirement keeps it from calling. */
  | "pending"
  /** Adopted and able to call. */
  | "active"
  /** Adopted, and every adopted capability is paused. */
  | "paused";

/** What the person saved on the review — a draft until it is adopted. */
export interface FollowUpConfigurationDraft {
  identity?: { companyName: string | null; companyWebsite: string | null };
  shareable?: { companyDescription: string | null };
  numberId?: string | null;
  calendarId?: string | null;
  /** Bookable hours for a calendar that has none yet. */
  availability?: CallingWindowInput | null;
  callingHours?: CallingWindowInput;
  timeZone?: string;
  capabilities?: { scheduling: boolean; reminders: boolean };
  reminderOffsetMinutes?: number;
  /**
   * Which already-booked meetings new reminder coverage reaches: none (only
   * meetings booked from now on), or every upcoming one. The meeting the
   * review was opened from is included separately and explicitly.
   */
  existingMeetings?: "none" | "all_upcoming";
  includeMeetingId?: string | null;
}

/** Days 0–6 (Sunday first) and minutes of the day, end exclusive. */
export interface CallingWindowInput {
  days: number[];
  startMinute: number;
  endMinute: number;
}

const MAX_NAME = 120;
const MAX_WEBSITE = 200;
const MAX_DESCRIPTION = 2_000;

/**
 * Validates a draft the browser sent. Every field is optional; whatever is
 * present must be well formed — ids are authorized separately against the
 * workspace by the service, never trusted from here.
 */
export function parseFollowUpDraft(raw: unknown): FollowUpConfigurationDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException("The configuration is not valid.");
  }
  const input = raw as Record<string, unknown>;
  const draft: FollowUpConfigurationDraft = {};

  if (input.identity !== undefined) {
    const identity = asObject(input.identity, "identity");
    draft.identity = {
      companyName: optionalText(identity.companyName, MAX_NAME, "companyName"),
      companyWebsite: optionalWebsite(identity.companyWebsite),
    };
  }
  if (input.shareable !== undefined) {
    const shareable = asObject(input.shareable, "shareable");
    draft.shareable = {
      companyDescription: optionalText(
        shareable.companyDescription,
        MAX_DESCRIPTION,
        "companyDescription",
      ),
    };
  }
  if (input.numberId !== undefined) {
    draft.numberId = optionalUuid(input.numberId, "numberId");
  }
  if (input.calendarId !== undefined) {
    draft.calendarId = optionalUuid(input.calendarId, "calendarId");
  }
  if (input.availability !== undefined) {
    draft.availability =
      input.availability === null
        ? null
        : parseWindow(input.availability, "availability");
  }
  if (input.callingHours !== undefined) {
    draft.callingHours = parseWindow(input.callingHours, "callingHours");
  }
  if (input.timeZone !== undefined) {
    if (typeof input.timeZone !== "string" || !isTimeZone(input.timeZone)) {
      throw new BadRequestException("Choose a valid time zone.");
    }
    draft.timeZone = input.timeZone;
  }
  if (input.capabilities !== undefined) {
    const capabilities = asObject(input.capabilities, "capabilities");
    if (
      typeof capabilities.scheduling !== "boolean" ||
      typeof capabilities.reminders !== "boolean"
    ) {
      throw new BadRequestException("capabilities must be two booleans.");
    }
    draft.capabilities = {
      scheduling: capabilities.scheduling,
      reminders: capabilities.reminders,
    };
  }
  if (input.reminderOffsetMinutes !== undefined) {
    const offset = input.reminderOffsetMinutes;
    if (
      typeof offset !== "number" ||
      !Number.isInteger(offset) ||
      offset < 15 ||
      offset > 14 * 24 * 60
    ) {
      throw new BadRequestException(
        "The confirmation lead time must be between 15 minutes and 14 days.",
      );
    }
    draft.reminderOffsetMinutes = offset;
  }
  if (input.existingMeetings !== undefined) {
    if (
      input.existingMeetings !== "none" &&
      input.existingMeetings !== "all_upcoming"
    ) {
      throw new BadRequestException("existingMeetings is not valid.");
    }
    draft.existingMeetings = input.existingMeetings;
  }
  if (input.includeMeetingId !== undefined) {
    draft.includeMeetingId = optionalUuid(
      input.includeMeetingId,
      "includeMeetingId",
    );
  }
  return draft;
}

/** A bounded entry source, or null for anything else. */
export function parseEntrySource(raw: unknown) {
  return isAnalyticsEntrySource(raw) ? raw : null;
}

/** A calling window as the reminder policy stores it. */
export function toPolicyWindow(window: CallingWindowInput): {
  windowStartMinute: number;
  windowEndMinute: number;
  windowDays: number[];
} {
  return {
    windowStartMinute: window.startMinute,
    windowEndMinute: window.endMinute,
    windowDays: [...new Set(window.days)].sort((a, b) => a - b),
  };
}

export function fromCallingWindow(window: CallingWindow): CallingWindowInput {
  return {
    days: [...window.days],
    startMinute: window.startMinute,
    endMinute: window.endMinute,
  };
}

/** "09:00" for an availability rule. */
export function minuteToTime(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export interface ReadinessInput {
  admitted: boolean;
  /** The review's requirement codes still open. */
  requirements: FollowUpRequirementCode[];
  adopted: boolean;
  /** Adopted capabilities and whether each is switched on. */
  adoptedCapabilities: Array<{ capability: FollowUpCapability; on: boolean }>;
}

/**
 * The single state the screen shows. Configuration problems come before
 * money: "configuration saved, add credit" only when nothing else is missing,
 * and never "ready to call" while the balance cannot pay for one.
 */
export function followUpState(input: ReadinessInput): FollowUpState {
  if (!input.admitted) return "not_admitted";
  const configuration = input.requirements.filter(
    (code) => code !== "add_credit",
  );
  const noCredit = input.requirements.includes("add_credit");
  if (!input.adopted) {
    if (configuration.length) return "needs_configuration";
    return noCredit ? "add_credit" : "ready_to_activate";
  }
  const on = input.adoptedCapabilities.filter((item) => item.on);
  if (input.adoptedCapabilities.length > 0 && on.length === 0) return "paused";
  if (configuration.length || noCredit) return "pending";
  return "active";
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(`${field} is not valid.`);
  }
  return value as Record<string, unknown>;
}

function optionalText(
  value: unknown,
  max: number,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new BadRequestException(`${field} is too long.`);
  }
  return trimmed || null;
}

function optionalWebsite(value: unknown): string | null {
  const text = optionalText(value, MAX_WEBSITE, "companyWebsite");
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error();
    return url.toString();
  } catch {
    throw new BadRequestException("Enter the website as a web address.");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new BadRequestException(`${field} is not valid.`);
  }
  return value;
}

function parseWindow(value: unknown, field: string): CallingWindowInput {
  const window = asObject(value, field);
  const days = window.days;
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    days.length > 7 ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new BadRequestException(`${field}.days must hold days from 0 to 6.`);
  }
  const start = window.startMinute;
  const end = window.endMinute;
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > 24 * 60 ||
    end - start < 30
  ) {
    throw new BadRequestException(
      `${field} must start before it ends, at least 30 minutes apart.`,
    );
  }
  return {
    days: [...new Set(days as number[])].sort((a, b) => a - b),
    startMinute: start,
    endMinute: end,
  };
}

export function isTimeZone(value: string): boolean {
  if (value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
