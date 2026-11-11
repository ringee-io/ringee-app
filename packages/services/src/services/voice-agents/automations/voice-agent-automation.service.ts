import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgent,
  AiVoiceAgentAutomation,
  AiVoiceAgentAutomationRepository,
  AiVoiceAgentCallRepository,
  AiVoiceAgentOutcome,
  AiVoiceAgentRepository,
  AiVoiceAgentStatus,
  AiVoiceAgentType,
  FollowUpActivationRepository,
  InboundDestinationType,
  InboundRouteRepository,
  MeetingEmailDeliveryRepository,
  MeetingEmailDeliveryStatus,
  MeetingReminderExecutionRepository,
  MeetingReminderExecutionStatus,
  MeetingReminderPolicyRepository,
  MeetingRepository,
  MeetingStatus,
  NumberPurchasedRepository,
  OrganizationRepository,
  UserRepository,
  type FollowUpActivation,
  type Meeting,
  type MeetingReminderPolicy,
  type Prisma,
} from "@ringee/database";
import {
  isInWorkspace,
  type AnalyticsEntrySource,
  type OwnershipContext,
} from "@ringee/platform";
import { CalendarService } from "../../calendar.service";
import { ContactService } from "../../contact.service";
import { CreditService } from "../../credit.service";
import { InboundRouteService } from "../../inbound-routing/inbound-route.service";
import type { InboundNumberRef } from "../../inbound-routing/inbound-routing.types";
import { MeetingService, normalizeEmail } from "../../meeting.service";
import { ProductAnalyticsService } from "../../analytics/product-analytics.service";
import { ReminderService } from "../../reminders/reminder.service";
import {
  PROPOSED_CALLING_WINDOW,
  planReminderCallAt,
  policyCoversMeeting,
  readCallingWindow,
} from "../../reminders/reminder-call-schedule";
import { assertVoiceAgentAccess } from "../voice-agent-access";
import { CompanyProfileService } from "../company-profile.service";
import {
  VoiceAgentCallService,
  type StartVoiceAgentCallResult,
} from "../voice-agent-call.service";
import {
  VoiceAgentService,
  type VoiceAgentCallerNumber,
} from "../voice-agent.service";
import {
  assertVoiceAgentAutomations,
  voiceAgentAutomationsEnabled,
} from "./automation-access";
import { VoiceAgentConversationContextService } from "./conversation-context.service";
import {
  FOLLOW_UP_OFFSET_CHOICES,
  FOLLOW_UP_ONBOARDING_VERSION,
  PROPOSED_REMINDER_OFFSET_MINUTES,
  followUpState,
  fromCallingWindow,
  isTimeZone,
  minuteToTime,
  parseEntrySource,
  parseFollowUpDraft,
  toPolicyWindow,
  type CallingWindowInput,
  type FollowUpCapability,
  type FollowUpConfigurationDraft,
  type FollowUpRequirementCode,
  type FollowUpRowKey,
  type FollowUpState,
} from "./follow-up-activation";
import { personName } from "./person-name";
import {
  MeetingReminderCallService,
  type ReminderCallNowResult,
} from "./meeting-reminder-call.service";

/** The three capabilities the rail offers, by the agent type behind each. */
export type AutomationCapability = "reminders" | "receptionist" | "scheduling";

export const AUTOMATION_CAPABILITIES: AutomationCapability[] = [
  "reminders",
  "receptionist",
  "scheduling",
];

/**
 * What an organization member gets from the rail: appointment scheduling and
 * its "Call to schedule". Every other capability, and setting any of them up
 * or deleting its trigger, is an admin's.
 */
export const MEMBER_AUTOMATION_CAPABILITIES: AutomationCapability[] = [
  "scheduling",
];

/**
 * What a personal workspace's owner gets (Stage 4A): the same reminders and
 * scheduling an organization has, configured by the owner. The AI receptionist
 * is not offered yet: an inbound leg it answers in a personal workspace would
 * occupy its owner's single call (CALL-001), and its transfers need the
 * per-user browser endpoint only organizations are issued — both pending
 * deliberate changes and live validation.
 */
export const PERSONAL_AUTOMATION_CAPABILITIES: AutomationCapability[] = [
  "reminders",
  "scheduling",
];

/** Who is looking at the rail — the role comes from the auth layer. */
export interface AutomationViewer {
  admin: boolean;
}

const AGENT_TYPE: Record<AutomationCapability, AiVoiceAgentType> = {
  reminders: AiVoiceAgentType.reminders_notifications,
  receptionist: AiVoiceAgentType.receptionist,
  scheduling: AiVoiceAgentType.appointment_booking,
};

/** What a new agent is called when the person did not name it. */
const DEFAULT_NAMES: Record<AutomationCapability, string> = {
  reminders: "Sofia",
  receptionist: "Lucia",
  scheduling: "Carmen",
};

/** A setup older than this that never finished may be taken over. */
const CLAIM_STALE_MS = 2 * 60_000;
/** How far back the rail's activity list looks. */
const ACTIVITY_WINDOW_MS = 14 * 24 * 60 * 60_000;
const ACTIVITY_ITEMS = 3;

/**
 * Where a capability stands, as the rail says it. `active` is not "the agent's
 * status is active": a receptionist that answers no number is not answering,
 * and a reminder agent with no calendar is not reminding anyone.
 */
export type AutomationState =
  | "unconfigured"
  | "activating"
  | "active"
  | "paused"
  | "needs_attention";

/** The one concrete thing to do next, when something is in the way. */
export type AutomationNextStepCode =
  | "set_up"
  | "fix_agent"
  | "turn_on_agent"
  | "add_number"
  | "choose_number"
  | "add_credit"
  | "choose_calendar"
  | "answer_a_number"
  | "inbound_unavailable";

export interface AutomationNextStep {
  code: AutomationNextStepCode;
  /** A sentence for surfaces without their own copy for the code. */
  message: string;
}

export interface AutomationAgentSummary {
  id: string;
  name: string;
  status: AiVoiceAgentStatus;
  voiceLabel: string | null;
  voiceLanguage: string | null;
  callerNumberId: string | null;
  calendarId: string | null;
  lastError: string | null;
}

export interface AutomationCalendarRef {
  id: string;
  name: string;
  timezone: string;
}

export interface AutomationCard {
  capability: AutomationCapability;
  state: AutomationState;
  agent: AutomationAgentSummary | null;
  nextStep: AutomationNextStep | null;
  /** Compatible agents the workspace already has, offered before creating. */
  candidates: Array<{ id: string; name: string; status: AiVoiceAgentStatus }>;
  /** The company the agent speaks for, as it will introduce itself. */
  company: string | null;
  reminders?: {
    calendars: AutomationCalendarRef[];
    offsetMinutes: number | null;
    upcomingCalls: number;
    callerNumber: string | null;
    /** Who the confirmation email goes to: lead and member in To, admins in CC. */
    ccAdmins: number;
  };
  receptionist?: {
    numbers: Array<{
      number: InboundNumberRef;
      phoneNumber: string;
      answering: boolean;
      /** Where calls go back to when the receptionist is paused. */
      restoreLabel: string | null;
    }>;
  };
  scheduling?: {
    humanFollowUpEnabled?: boolean;
    calendar: AutomationCalendarRef | null;
    callerNumber: string | null;
  };
}

export type AutomationActivityKind =
  | "attendance_confirmed"
  | "attendance_declined"
  | "no_answer"
  | "call_completed"
  | "call_failed"
  | "needs_email"
  | "needs_member"
  | "email_failed"
  | "meeting_booked";

export interface AutomationActivity {
  id: string;
  kind: AutomationActivityKind;
  at: string;
  /** Who or what it was about: the lead's name, else the meeting's title. */
  label: string | null;
  meetingId: string | null;
  /** The telephony call, for the call detail. */
  callId: string | null;
  /** A delivery that waits on a person ("Complete email"). */
  deliveryId: string | null;
}

export interface AutomationPanel {
  enabled: boolean;
  /** Capabilities really operating right now — the rail's counter. */
  operational: number;
  cards: AutomationCard[];
  activity: AutomationActivity[];
}

export interface AutomationSummary {
  enabled: boolean;
  operational: number;
  attention: number;
  /** Each capability's state, so a surface can offer its action. */
  capabilities: Partial<Record<AutomationCapability, AutomationState>>;
}

// ── Shared follow-up review (Stage 4C) ───────────────────────────────

/** A row's state on "Your configuration". */
export type FollowUpRowStatus = "ok" | "missing" | "locked" | "info";

export interface FollowUpNumberOption {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  /** A verified caller ID only reaches international destinations. */
  kind: "purchased" | "verified_caller_id";
}

/** Why the meeting a review was opened from cannot be included. */
export type FollowUpMeetingIneligibility =
  | "not_found"
  | "cancelled"
  | "too_soon"
  | "already_answered"
  | "other_calendar"
  | "reminders_off"
  | "outside_window";

/** Whether a meeting's confirmation call is planned — scheduler evidence only. */
export interface FollowUpMeetingCoverage {
  /** True only when an execution for the current version exists. */
  covered: boolean;
  /** When the planned confirmation call fires. */
  fireAt: string | null;
  reason:
    | null
    | "not_admitted"
    | "not_adopted"
    | "reminders_off"
    | "reminders_paused"
    | "calendar_not_covered"
    | "not_included"
    | "too_close"
    | "already_answered"
    | "cancelled";
}

export interface FollowUpSourceMeeting {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  /** The schedule version the review saw; adoption re-checks it. */
  version: number;
  calendarId: string | null;
  contactName: string | null;
  eligible: boolean;
  reason: FollowUpMeetingIneligibility | null;
  /** When its confirmation call would ring if it is included. */
  plannedFireAt: string | null;
  coverage: FollowUpMeetingCoverage;
}

/** The review the shared activation screen renders (Stage 4C). */
export interface FollowUpReview {
  version: string;
  workspaceType: "personal" | "organization";
  /** Admitted to automated work (the pilot gate). */
  admitted: boolean;
  /** UX only — save and adopt re-check administration on the server. */
  canConfigure: boolean;
  /** Who can activate it, for a member's read-only view. */
  adminNames: string[];
  state: FollowUpState;
  activation: {
    status: "none" | "configured" | "adopted";
    revision: number | null;
    savedAt: string | null;
    adoptedAt: string | null;
    adoptedByName: string | null;
    entrySource: AnalyticsEntrySource | null;
    optOuts: Partial<
      Record<FollowUpCapability, { reason: string; at: string }>
    >;
  };
  /** The configuration in effect: the saved draft over the proposal. */
  draft: FollowUpConfigurationDraft & {
    capabilities: { scheduling: boolean; reminders: boolean };
    reminderOffsetMinutes: number;
    existingMeetings: "none" | "all_upcoming";
    callingHours: CallingWindowInput;
    timeZone: string;
  };
  rows: {
    identity: {
      status: FollowUpRowStatus;
      kind: "company" | "person";
      companyName: string | null;
      companyWebsite: string | null;
      personName: string | null;
    };
    shareable: {
      status: FollowUpRowStatus;
      companyDescription: string | null;
    };
    number: {
      status: FollowUpRowStatus;
      requirement: FollowUpRequirementCode | null;
      selected: FollowUpNumberOption | null;
      candidates: FollowUpNumberOption[];
      pending: Array<{
        phoneNumber: string;
        kind: "purchase" | "verification";
      }>;
      sharedNumberAvailable: boolean;
    };
    callbacks: {
      status: FollowUpRowStatus;
      kind: "owner" | "route" | "unrouted" | "unknown";
      label: string | null;
    };
    calendar: {
      status: FollowUpRowStatus;
      requirement: FollowUpRequirementCode | null;
      selected: {
        id: string;
        name: string;
        timezone: string;
        isDefault: boolean;
        provider: "google" | "microsoft" | null;
        accountEmail: string | null;
      } | null;
      candidates: Array<{ id: string; name: string; isDefault: boolean }>;
      /** No calendar exists yet: adoption creates the global one. */
      willCreate: boolean;
      availability: {
        source: "calendar" | "draft" | "missing";
        window: CallingWindowInput | null;
        windowCount: number;
      };
    };
    callingHours: {
      status: FollowUpRowStatus;
      source: "policy" | "draft" | "proposed";
      window: CallingWindowInput;
    };
    timeZone: {
      status: FollowUpRowStatus;
      source: "calendar" | "draft" | "browser" | "default";
      value: string;
    };
    responsible: {
      status: FollowUpRowStatus;
      kind: "owner" | "caller";
      ownerName: string | null;
      adminCount: number;
    };
  };
  capabilities: {
    scheduling: {
      existing: AutomationState;
      agentName: string | null;
      humanFollowUpEnabled: boolean;
      optedOut: boolean;
    };
    reminders: {
      existing: AutomationState;
      agentName: string | null;
      existingOffsetMinutes: number | null;
      optedOut: boolean;
      offsetChoices: number[];
      /** Already-booked upcoming meetings, if every one were covered. */
      upcomingExisting: { meetings: number; calls: number } | null;
    };
  };
  /** Every open requirement; `row` is the configuration row that fixes it. */
  requirements: Array<{
    code: FollowUpRequirementCode;
    row: FollowUpRowKey | null;
  }>;
  progress: { done: number; total: number };
  /** Shown only to whoever manages the balance (CALL-014). */
  balance: { visible: boolean; amount: number | null };
  manualCalling: {
    ready: boolean;
    line: "own_number" | "shared_number" | "none";
    reason: "no_line" | "no_credit" | null;
  };
  sourceMeeting: FollowUpSourceMeeting | null;
  /** The next confirmation calls the scheduler accepted (admins). */
  nextActions: Array<{
    fireAt: string;
    meetingId: string;
    meetingAt: string;
    contactName: string | null;
  }>;
}

/** The newest verified AI results, for the first-value summary. */
export interface FollowUpResultSummary {
  results: Array<{
    id: string;
    kind: string;
    at: string;
    meetingId: string;
    meetingAt: string;
    previousMeetingAt: string | null;
    contactName: string | null;
    callId: string | null;
    consumption: {
      voiceUsd: number | null;
      aiUsd: number | null;
      /** Both halves settled; otherwise the known part is shown as pending. */
      settled: boolean;
    };
  }>;
  /** When the workspace's first verified result of all time happened. */
  firstResultAt: string | null;
  /** Whether the newest result is the first since this version was adopted. */
  firstSinceAdoption: boolean;
  adoptedAt: string | null;
}

interface ReceptionistSettings {
  numbers: InboundNumberRef[];
  fallback: {
    destinationType: "user" | "ring_group";
    destinationId: string;
  } | null;
}

interface QuickAgentInput {
  agentId?: string;
  name?: string;
  language?: string;
  /** A new agent's voice; without one, the first curated voice in `language`. */
  voiceId?: string;
}

/**
 * The "Ringee IA Voice Agents" rail (AGENT-018).
 *
 * A quick action is an ordinary agent plus the little that makes it useful
 * without the editor: which agent the card drives, the policy or routes it
 * runs on, and a state computed here — from the agent, its number, the
 * balance, its calendars and routes — rather than read off `status`. Setup is
 * idempotent per organization and capability; everything it creates is the
 * same agent the editor opens under "Customize".
 */
@Injectable()
export class VoiceAgentAutomationService {
  private readonly logger = new Logger(VoiceAgentAutomationService.name);

  constructor(
    private readonly automations: AiVoiceAgentAutomationRepository,
    private readonly agentRepo: AiVoiceAgentRepository,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly policies: MeetingReminderPolicyRepository,
    private readonly executions: MeetingReminderExecutionRepository,
    private readonly deliveries: MeetingEmailDeliveryRepository,
    private readonly inboundRouteRepo: InboundRouteRepository,
    private readonly organizations: OrganizationRepository,
    private readonly users: UserRepository,
    private readonly voiceAgents: VoiceAgentService,
    private readonly calls: VoiceAgentCallService,
    private readonly calendarService: CalendarService,
    private readonly contacts: ContactService,
    private readonly credits: CreditService,
    private readonly companyProfiles: CompanyProfileService,
    private readonly inboundRoutes: InboundRouteService,
    private readonly reminders: ReminderService,
    private readonly reminderCalls: MeetingReminderCallService,
    private readonly meetings: MeetingService,
    private readonly context: VoiceAgentConversationContextService,
    // Stage 4B/4C: the shared follow-up review, its adoption and analytics.
    private readonly activations: FollowUpActivationRepository,
    private readonly meetingRepo: MeetingRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly analytics: ProductAnalyticsService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────

  /**
   * The closed rail: whether to show it, the counter and the dot — counted
   * over the capabilities this viewer gets.
   */
  async summary(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
  ): Promise<AutomationSummary> {
    if (!voiceAgentAutomationsEnabled(ctx)) {
      return { enabled: false, operational: 0, attention: 0, capabilities: {} };
    }
    const cards = await this.cards(ctx, {
      details: false,
      capabilities: visibleCapabilities(ctx, viewer),
    });
    return {
      enabled: true,
      operational: cards.filter((card) => card.state === "active").length,
      attention: cards.filter((card) => card.state === "needs_attention")
        .length,
      capabilities: Object.fromEntries(
        cards.map((card) => [card.capability, card.state]),
      ),
    };
  }

  /**
   * The open panel: the viewer's cards — all three for an admin, scheduling
   * for a member — and what they did lately.
   */
  async panel(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
  ): Promise<AutomationPanel> {
    if (!voiceAgentAutomationsEnabled(ctx)) {
      return { enabled: false, operational: 0, cards: [], activity: [] };
    }
    assertVoiceAgentAutomations(ctx);
    const cards = await this.cards(ctx, {
      details: true,
      capabilities: visibleCapabilities(ctx, viewer),
    });
    const activity = await this.activity(ctx, cards);
    return {
      enabled: true,
      operational: cards.filter((card) => card.state === "active").length,
      cards,
      activity,
    };
  }

  async card(
    ctx: OwnershipContext,
    capability: AutomationCapability,
  ): Promise<AutomationCard> {
    assertVoiceAgentAutomations(ctx);
    const [automation, env] = await Promise.all([
      this.automations.findForOwner(ctx, AGENT_TYPE[capability]),
      this.environment(ctx),
    ]);
    return this.buildCard(ctx, capability, automation, env, { details: true });
  }

  /** What "Preview" says before reminders are switched on. */
  previewReminders(
    ctx: OwnershipContext,
    input: { calendarIds: string[]; offsetMinutes: number },
  ): Promise<{ meetings: number; calls: number }> {
    assertVoiceAgentAutomations(ctx);
    return this.reminders.previewPolicyCalls(ctx, input);
  }

  /** "See upcoming calls": the reminder calls planned next. */
  async upcomingReminderCalls(ctx: OwnershipContext) {
    assertVoiceAgentAutomations(ctx);
    const rows = await this.executions.listUpcomingForOwner(ctx, {
      from: new Date(),
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      fireAt: row.fireAt.toISOString(),
      trigger: row.trigger,
      meeting: {
        id: row.meeting.id,
        title: row.meeting.title,
        scheduledAt: row.meeting.scheduledAt.toISOString(),
        contactName: row.meeting.contact?.name ?? null,
        contactPhone: row.meeting.contact?.phoneNumber ?? null,
      },
    }));
  }

  // ── Setup ──────────────────────────────────────────────────────────

  /**
   * Reminders & confirmations: a reminders agent, the calendars it watches
   * and how long before each meeting it calls. Switching it on plans calls for
   * the upcoming meetings those calendars already hold — never for an offset
   * that has already passed.
   */
  async setupReminders(
    ctx: OwnershipContext,
    input: QuickAgentInput & {
      callerNumberId?: string;
      calendarIds: string[];
      offsetMinutes: number;
    },
  ): Promise<AutomationCard> {
    assertVoiceAgentAutomations(ctx);
    // The rail previews every upcoming meeting before switching on, so a
    // policy it creates covers them all, as it always did.
    await this.configureReminders(ctx, input, {});
    return this.card(ctx, "reminders");
  }

  /**
   * The one path that writes reminder policies — the rail's setup and the
   * follow-up adoption. A policy it creates takes `coverage` (Stage 4C: new
   * bookings only, unless the person chose every upcoming meeting) and
   * `window`; an existing policy keeps the coverage it was adopted with.
   */
  private async configureReminders(
    ctx: OwnershipContext,
    input: QuickAgentInput & {
      callerNumberId?: string;
      calendarIds: string[];
      offsetMinutes: number;
    },
    options: {
      coverage?: { coversMeetingsFrom: Date | null };
      window?: CallingWindowInput;
    },
  ): Promise<{ agent: AiVoiceAgent; policies: MeetingReminderPolicy[] }> {
    const calendarIds = [...new Set(input.calendarIds)];
    for (const calendarId of calendarIds) {
      const calendar = await this.calendarService.getCalendar(ctx, calendarId);
      if (calendar.archivedAt) {
        throw new BadRequestException(
          `The calendar "${calendar.name}" is archived. Choose another one.`,
        );
      }
    }

    // Read before the agent is resolved: a first setup's claim writes the new
    // agent onto the row.
    const previousAgentId = (
      await this.automations.findForOwner(ctx, AGENT_TYPE.reminders)
    )?.agentId;
    const agent = await this.resolveAgent(ctx, "reminders", input, {
      callerNumberId: input.callerNumberId,
    });

    // The setup names the whole set of calendars: a calendar left out stops
    // being watched, and what it had planned is withdrawn — including what
    // the card's previous agent watched, when the setup moved it to another.
    const current = (
      await Promise.all(
        [...new Set([agent.id, previousAgentId ?? agent.id])].map((agentId) =>
          this.policies.listForOwner(ctx, { agentId }),
        ),
      )
    ).flat();
    const dropped = current.filter(
      (policy) => !calendarIds.includes(policy.calendarId),
    );
    for (const policy of dropped) {
      await this.reminders.cancelPolicyCalls(policy.id, "policy_removed");
    }
    await this.policies.deleteForOwner(
      ctx,
      dropped.map((policy) => policy.id),
    );

    const saved: MeetingReminderPolicy[] = [];
    for (const calendarId of calendarIds) {
      const previous = await this.policies.findForCalendar(ctx, calendarId);
      const policy = await this.policies.upsertForCalendar(ctx, {
        agentId: agent.id,
        calendarId,
        offsetsMinutes: [input.offsetMinutes],
        ...(options.window ? toPolicyWindow(options.window) : {}),
        ...(options.coverage ? { coverage: options.coverage } : {}),
      });
      if (previous) {
        await this.reminders.cancelPolicyCalls(policy.id, "policy_changed");
      }
      // A "new bookings only" policy plans only what it covers (Stage 4C).
      await this.reminders.planPolicyCalls(ctx, policy);
      saved.push(policy);
    }

    await this.automations.upsertForOwner(ctx, AGENT_TYPE.reminders, {
      agentId: agent.id,
      enabled: true,
      settings: { calendarIds, offsetMinutes: input.offsetMinutes },
    });
    return { agent, policies: saved };
  }

  /**
   * AI receptionist: the agent and the numbers it answers. Each number
   * remembers where it went before — or the backup chosen here — so pausing
   * hands it back instead of leaving it unanswered.
   */
  async setupReceptionist(
    ctx: OwnershipContext,
    input: QuickAgentInput & {
      numbers: InboundNumberRef[];
      fallback?: ReceptionistSettings["fallback"];
    },
  ): Promise<{
    card: AutomationCard;
    failed: Array<{ number: InboundNumberRef; error: string }>;
  }> {
    assertVoiceAgentAutomations(ctx);
    if (!ctx.organizationId) {
      // Not a hidden card only: the server refuses it (see
      // PERSONAL_AUTOMATION_CAPABILITIES for why it waits).
      throw new ConflictException(
        "The AI receptionist is not available in personal workspaces yet.",
      );
    }
    if (!inboundAvailable()) {
      throw new ConflictException(
        "Inbound AI calling is not available on this installation yet.",
      );
    }
    // Read before the agent is resolved: a first setup's claim writes the new
    // agent onto the row.
    const previous = await this.automations.findForOwner(
      ctx,
      AGENT_TYPE.receptionist,
    );
    const agent = await this.resolveAgent(ctx, "receptionist", input, {});
    if (agent.status !== AiVoiceAgentStatus.active) {
      throw new BadRequestException(
        agent.lastError ||
          "The receptionist could not be switched on. Open Customize to finish it.",
      );
    }

    const numbers = uniqueRefs(input.numbers);
    const fallback = input.fallback ?? null;
    const failed: Array<{ number: InboundNumberRef; error: string }> = [];
    for (const number of numbers) {
      try {
        await this.inboundRoutes.saveForNumber(
          ctx,
          number,
          {
            destinationType: InboundDestinationType.ai_receptionist,
            destinationId: agent.id,
          },
          fallback ? { restoreTo: fallback } : undefined,
        );
      } catch (error) {
        failed.push({ number, error: describe(error) });
      }
    }

    // Numbers the setup no longer names go back to where they went before,
    // released from the agent that answered them — the card's previous one,
    // when the setup moved it to another.
    const dropped = readReceptionistSettings(previous).numbers.filter(
      (ref) => !numbers.some((kept) => sameRef(kept, ref)),
    );
    if (dropped.length) {
      const released = await this.inboundRoutes.releaseReceptionist(
        ctx,
        previous?.agentId ?? agent.id,
        dropped,
      );
      failed.push(
        ...released.failed.map(({ number, error }) => ({ number, error })),
      );
    }

    const answering = numbers.filter(
      (ref) => !failed.some((failure) => sameRef(failure.number, ref)),
    );
    await this.automations.upsertForOwner(ctx, AGENT_TYPE.receptionist, {
      agentId: agent.id,
      enabled: true,
      settings: {
        numbers: answering,
        fallback,
      } satisfies ReceptionistSettings as object,
    });
    return { card: await this.card(ctx, "receptionist"), failed };
  }

  /**
   * Appointment scheduling: an agent, the calendar it books on and the number
   * it calls from. Switching it on dials nobody — it makes "Call to schedule"
   * available.
   */
  async setupScheduling(
    ctx: OwnershipContext,
    input: QuickAgentInput & {
      callerNumberId?: string;
      calendarId?: string;
      receiptRecipients?: "legacy" | "contact_responsible";
      humanFollowUpEnabled?: boolean;
      interestedObjective?: "booking" | "information";
    },
  ): Promise<AutomationCard> {
    assertVoiceAgentAutomations(ctx);
    // An organization admin, re-read now — or a personal workspace's owner,
    // who authorizes their own follow-up through the same setup.
    if (
      (input.receiptRecipients !== undefined ||
        input.humanFollowUpEnabled !== undefined ||
        input.interestedObjective !== undefined) &&
      !(await this.organizations.isWorkspaceAdmin(ctx))
    )
      throw new BadRequestException(
        "Only an administrator can authorize automatic follow-up",
      );
    if (
      input.interestedObjective !== undefined &&
      input.humanFollowUpEnabled === undefined
    )
      throw new BadRequestException(
        "humanFollowUpEnabled is required with interestedObjective",
      );
    if (input.calendarId) {
      const calendar = await this.calendarService.getCalendar(
        ctx,
        input.calendarId,
      );
      if (calendar.archivedAt) {
        throw new BadRequestException(
          `The calendar "${calendar.name}" is archived. Choose another one.`,
        );
      }
    }
    // Read before the agent is resolved: a first setup's claim creates the
    // row, and only a workspace that had one keeps the legacy receipts.
    const existed = Boolean(
      await this.automations.findForOwner(ctx, AGENT_TYPE.scheduling),
    );
    const agent = await this.resolveAgent(
      ctx,
      "scheduling",
      input,
      {
        callerNumberId: input.callerNumberId,
        calendarId: input.calendarId,
      },
      // A first setup's receipts are part of its claim: a retry after an
      // interruption finds the row with them, never as a legacy workspace's.
      existed
        ? undefined
        : {
            receiptRecipients: input.receiptRecipients ?? "contact_responsible",
          },
    );
    await this.automations.upsertForOwner(
      ctx,
      AGENT_TYPE.scheduling,
      (previous) => {
        const settings = (previous?.settings ?? {}) as Record<
          string,
          unknown
        > & {
          humanFollowUp?: { interestedObjective?: string };
        };
        return {
          agentId: agent.id,
          enabled: true,
          ...(input.humanFollowUpEnabled !== undefined ||
          input.receiptRecipients !== undefined ||
          !existed
            ? {
                settings: {
                  ...settings,
                  receiptRecipients:
                    input.receiptRecipients ??
                    settings.receiptRecipients ??
                    (existed ? "legacy" : "contact_responsible"),
                  ...(input.humanFollowUpEnabled !== undefined
                    ? {
                        humanFollowUp: {
                          enabled: input.humanFollowUpEnabled,
                          interestedObjective:
                            input.interestedObjective ??
                            settings.humanFollowUp?.interestedObjective ??
                            "booking",
                          authorizedByUserId: ctx.userId,
                        },
                      }
                    : {}),
                },
              }
            : {}),
        };
      },
    );
    return this.card(ctx, "scheduling");
  }

  /**
   * Pause or resume. Pausing stops new automated work and lets anything
   * already on the phone finish; resuming plans only what is still ahead.
   * A receptionist is paused by handing its numbers back first — if any
   * number cannot be handed back it keeps answering, and the reason says why.
   */
  async setEnabled(
    ctx: OwnershipContext,
    capability: AutomationCapability,
    enabled: boolean,
  ): Promise<AutomationCard> {
    assertVoiceAgentAutomations(ctx);
    const automation = await this.automations.findForOwner(
      ctx,
      AGENT_TYPE[capability],
    );
    if (!automation?.agentId) {
      throw new NotFoundException("Set this up before switching it on.");
    }
    const agent = await this.voiceAgents.require(ctx, automation.agentId);

    if (capability === "reminders") {
      if (enabled) await this.ensureActive(ctx, agent);
      const policies = await this.policies.setEnabled(
        ctx,
        (await this.policies.listForOwner(ctx, { agentId: agent.id })).map(
          (policy) => policy.id,
        ),
        enabled,
      );
      for (const policy of policies) {
        if (enabled) await this.reminders.planPolicyCalls(ctx, policy);
        else await this.reminders.cancelPolicyCalls(policy.id, "policy_paused");
      }
    } else if (capability === "receptionist") {
      if (enabled) {
        await this.ensureActive(ctx, agent);
        const settings = readReceptionistSettings(automation);
        for (const number of settings.numbers) {
          await this.inboundRoutes
            .saveForNumber(
              ctx,
              number,
              {
                destinationType: InboundDestinationType.ai_receptionist,
                destinationId: agent.id,
              },
              settings.fallback ? { restoreTo: settings.fallback } : undefined,
            )
            .catch((error: unknown) => {
              this.logger.warn(
                `Could not route ${number.kind}/${number.id} back to receptionist ${agent.id}: ${describe(error)}`,
              );
            });
        }
      } else {
        const released = await this.inboundRoutes.releaseReceptionist(
          ctx,
          agent.id,
        );
        if (released.failed.length) {
          throw new ConflictException({
            message:
              "The receptionist keeps answering some numbers: they could not be handed back.",
            failed: released.failed,
          });
        }
        await this.voiceAgents.setStatus(
          ctx,
          agent.id,
          AiVoiceAgentStatus.disabled,
        );
      }
    } else if (enabled) {
      await this.ensureActive(ctx, agent);
    }

    await this.automations.updateForOwner(ctx, automation.id, { enabled });
    void this.analytics.record({
      event: "followup_control_applied",
      key: `${automation.id}:${enabled ? "resume" : "pause"}:${Date.now()}`,
      occurredAt: new Date(),
      workspace: ctx,
      humanUserId: ctx.userId,
      properties: { capability, control: enabled ? "resume" : "pause" },
    });
    return this.card(ctx, capability);
  }

  /**
   * Deletes the trigger, not the agent: the card goes back to "not set up"
   * and the agent stays, as it is, among the workspace's agents — the next
   * setup offers it again. What the trigger was doing stops first: reminders
   * withdraw their planned calls and forget their calendars, and a
   * receptionist hands every number back — if one cannot be handed back,
   * nothing is deleted and the reason says why. A call already on the phone
   * finishes.
   */
  async removeAutomation(
    ctx: OwnershipContext,
    capability: AutomationCapability,
  ): Promise<AutomationCard> {
    assertVoiceAgentAutomations(ctx);
    const automation = await this.automations.findForOwner(
      ctx,
      AGENT_TYPE[capability],
    );
    if (!automation?.agentId) {
      throw new NotFoundException("This trigger is not set up.");
    }
    if (
      automation.claimToken &&
      automation.claimedAt &&
      automation.claimedAt.getTime() > Date.now() - CLAIM_STALE_MS
    ) {
      throw new ConflictException(
        "This trigger is still being set up. Try again in a moment.",
      );
    }
    const agentId = automation.agentId;

    if (capability === "reminders") {
      const policies = await this.policies.listForOwner(ctx, { agentId });
      for (const policy of policies) {
        await this.reminders.cancelPolicyCalls(policy.id, "policy_removed");
      }
      await this.policies.deleteForOwner(
        ctx,
        policies.map((policy) => policy.id),
      );
    } else if (capability === "receptionist") {
      const released = await this.inboundRoutes.releaseReceptionist(
        ctx,
        agentId,
      );
      if (released.failed.length) {
        throw new ConflictException({
          message:
            "The receptionist keeps answering some numbers: they could not be handed back.",
          failed: released.failed,
        });
      }
    }

    // Deleted only while the row still drives this agent: another window may
    // have moved the card to another one meanwhile.
    const removed = await this.automations.removeForOwner(
      ctx,
      automation.id,
      agentId,
    );
    if (!removed) {
      throw new ConflictException(
        "This trigger changed in another window. Reload it.",
      );
    }
    // Removing a trigger on purpose is a durable opt-out (Stage 4C): the
    // follow-up review proposes it switched off, and no later reconciliation
    // brings it back without the person choosing it again.
    const followUpCapability = toFollowUpCapability(capability);
    if (followUpCapability) {
      await this.activations
        .recordOptOut(ctx, {
          version: FOLLOW_UP_ONBOARDING_VERSION,
          capability: followUpCapability,
          reason: "trigger_removed",
          at: new Date(),
          emptyConfiguration: {},
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Opt-out of ${followUpCapability} not recorded: ${describe(error)}`,
          );
        });
    }
    return this.card(ctx, capability);
  }

  // ── Actions ────────────────────────────────────────────────────────

  /** "Confirm now": a reminder call about one meeting, placed immediately. */
  callMeetingNow(
    ctx: OwnershipContext,
    meetingId: string,
  ): Promise<ReminderCallNowResult> {
    return this.reminderCalls.callNow(ctx, meetingId);
  }

  /**
   * "Call to schedule": the scheduling agent calls a lead to book a meeting
   * with a member. This — not switching scheduling on — is what spends, and
   * it goes through the one execution path with every gate it applies.
   */
  async startSchedulingCall(
    ctx: OwnershipContext,
    input: {
      contactId: string;
      responsibleUserId?: string;
      firstName?: string;
      fromNumberId?: string;
    },
  ): Promise<StartVoiceAgentCallResult> {
    assertVoiceAgentAutomations(ctx);
    const automation = await this.automations.findForOwner(
      ctx,
      AGENT_TYPE.scheduling,
    );
    if (!automation?.agentId || !automation.enabled) {
      throw new BadRequestException(
        "Switch on Appointment scheduling before calling a lead to book.",
      );
    }
    const contact = await this.contacts.findContactByIdForOwner(
      ctx,
      input.contactId,
    );
    if (!contact) throw new NotFoundException("Contact not found");

    const responsibleUserId = input.responsibleUserId ?? ctx.userId;
    // In a personal workspace the meeting can only be with its owner.
    if (!(await this.organizations.isWorkspaceMember(ctx, responsibleUserId))) {
      throw new BadRequestException(
        ctx.organizationId
          ? "Choose a member of your organization for the meeting."
          : "A meeting in your personal workspace is with you.",
      );
    }
    const responsible = await this.users.findById(responsibleUserId);
    const memberName =
      [responsible?.firstName, responsible?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "our team";

    const name = input.firstName?.trim()
      ? { first: input.firstName.trim(), last: contact.lastName?.trim() ?? "" }
      : personName(contact);
    if (!name.first) {
      throw new BadRequestException(
        "Add the lead's first name so the agent can greet them.",
      );
    }

    const history = await this.context.previousInteractions(ctx, {
      contactId: contact.id,
    });
    return this.calls.startCall(ctx, automation.agentId, {
      to: contact.phoneNumber,
      fromNumberId: input.fromNumberId,
      variables: {
        first_name: name.first,
        last_name: name.last,
        email: normalizeEmail(contact.email) ?? "",
        reason: `Schedule a meeting with ${memberName}`,
        additional_context: [
          `The meeting you book will be with ${memberName}.`,
          history,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      metadata: {},
      responsibleUserId,
    });
  }

  /** "Complete email" on a confirmation that is waiting for the lead's address. */
  async completeEmail(
    ctx: OwnershipContext,
    deliveryId: string,
    email: string,
  ): Promise<{ queued: boolean }> {
    assertVoiceAgentAutomations(ctx);
    const delivery = await this.deliveries.findByIdForOwner(ctx, deliveryId);
    if (!delivery) throw new NotFoundException("Email not found");
    await this.meetings.completeLeadEmail(ctx, delivery.meetingId, email);
    return { queued: true };
  }

  // ── Shared follow-up review (Stage 4C) ─────────────────────────────

  /**
   * The shared "Automatic follow-up" review: what Ringee already has for this
   * workspace, the proposal for what it does not, the saved draft over both,
   * and every concrete thing in the way. Read-only on purpose — nothing is
   * created, provisioned or planned here, not even the global calendar — so
   * opening the screen from any entry point is free of side effects.
   */
  async followUpReview(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    options: { meetingId?: string | null; timeZoneHint?: string | null } = {},
  ): Promise<FollowUpReview> {
    assertVoiceAgentAccess(ctx);
    const admitted = voiceAgentAutomationsEnabled(ctx);
    const personal = !ctx.organizationId;
    const canConfigure =
      viewer.admin && (await this.organizations.isWorkspaceAdmin(ctx));
    const now = new Date();

    const [activation, env, profile, owner, calendars, owned, callerIds] =
      await Promise.all([
        this.activations.findForWorkspace(ctx, FOLLOW_UP_ONBOARDING_VERSION),
        this.environment(ctx),
        this.companyProfiles.get(ctx).catch(() => null),
        this.users.findById(ctx.userId),
        this.calendarService.peekCalendars(ctx),
        this.numberRepo.findByOwner(ctx),
        this.numberRepo.listCallerIds(ctx),
      ]);
    // The existing specialists, read without details: that path resolves no
    // global calendar and writes nothing.
    const cards = await this.cards(ctx, {
      details: false,
      capabilities: ["scheduling", "reminders"],
    });
    const schedulingCard = cards.find(
      (card) => card.capability === "scheduling",
    );
    const remindersCard = cards.find((card) => card.capability === "reminders");
    const remindersPolicies = remindersCard?.agent
      ? await this.policies.listForOwner(ctx, {
          agentId: remindersCard.agent.id,
        })
      : [];
    const saved = readSavedDraft(activation);
    const optOuts = readOptOuts(activation);

    // ── Capabilities: existing settings, pauses and opt-outs win over the
    //    proposal (both specialists on, confirmation 240 minutes before).
    const proposedOn = (
      card: AutomationCard | undefined,
      capability: FollowUpCapability,
    ) =>
      card && card.state !== "unconfigured"
        ? card.state !== "paused"
        : !optOuts[capability];
    const capabilities = saved.capabilities ?? {
      scheduling: proposedOn(schedulingCard, "scheduling"),
      reminders: proposedOn(remindersCard, "reminders"),
    };
    const existingOffset = remindersPolicies[0]?.offsetsMinutes[0] ?? null;
    const reminderOffsetMinutes =
      saved.reminderOffsetMinutes ??
      existingOffset ??
      PROPOSED_REMINDER_OFFSET_MINUTES;
    const anyOn = capabilities.scheduling || capabilities.reminders;

    // ── Number: a workspace number the AI may present (AGENT-008). The shared
    //    number never qualifies: a returned call to it reaches nobody here.
    const candidates: FollowUpNumberOption[] = env.numbers
      .filter(
        (number) =>
          number.kind === "purchased" || number.kind === "verified_caller_id",
      )
      .map((number) => ({
        id: number.id,
        phoneNumber: number.phoneNumber,
        isoCountry: number.isoCountry,
        kind: number.kind as FollowUpNumberOption["kind"],
      }));
    const findCandidate = (id: string | null | undefined) =>
      id ? (candidates.find((number) => number.id === id) ?? null) : null;
    const selectedNumber =
      findCandidate(saved.numberId) ??
      findCandidate(schedulingCard?.agent?.callerNumberId) ??
      findCandidate(remindersCard?.agent?.callerNumberId) ??
      (candidates.length === 1 ? candidates[0]! : null);
    const pending = [
      ...owned
        .filter(
          (number) =>
            number.kind === "purchased" && number.status === "pending",
        )
        .map((number) => ({
          phoneNumber: number.phoneNumber,
          kind: "purchase" as const,
        })),
      ...callerIds
        .filter((number) => number.verificationStatus === "pending")
        .map((number) => ({
          phoneNumber: number.phoneNumber,
          kind: "verification" as const,
        })),
    ];
    const numberRequirement: FollowUpRequirementCode | null = !anyOn
      ? null
      : candidates.length === 0
        ? pending.length
          ? "number_pending"
          : "get_number"
        : selectedNumber
          ? null
          : "choose_number";

    // ── Calendar, its bookable hours and time zone.
    const findCalendar = (id: string | null | undefined) =>
      id ? (calendars.find((calendar) => calendar.id === id) ?? null) : null;
    const selectedCalendar =
      findCalendar(saved.calendarId) ??
      findCalendar(schedulingCard?.agent?.calendarId) ??
      findCalendar(remindersPolicies[0]?.calendarId) ??
      calendars.find((calendar) => calendar.isDefault) ??
      null;
    const calendarAvailability = selectedCalendar
      ? await this.calendarService
          .peekAvailability(ctx, selectedCalendar.id)
          .catch(() => ({ configured: false, windows: [] }))
      : { configured: false, windows: [] };
    const availability = saved.availability
      ? {
          source: "draft" as const,
          window: saved.availability,
          windowCount: 1,
        }
      : calendarAvailability.configured
        ? {
            source: "calendar" as const,
            window: windowFromAvailability(calendarAvailability.windows[0]),
            windowCount: calendarAvailability.windows.length,
          }
        : { source: "missing" as const, window: null, windowCount: 0 };
    const hint =
      options.timeZoneHint && isTimeZone(options.timeZoneHint)
        ? options.timeZoneHint
        : null;
    const calendarZoneIsDeliberate =
      !!selectedCalendar &&
      (calendarAvailability.configured || selectedCalendar.timezone !== "UTC");
    const timeZone = saved.timeZone
      ? { source: "draft" as const, value: saved.timeZone }
      : calendarZoneIsDeliberate
        ? { source: "calendar" as const, value: selectedCalendar!.timezone }
        : hint
          ? { source: "browser" as const, value: hint }
          : {
              source: "default" as const,
              value: selectedCalendar?.timezone ?? "UTC",
            };
    const calendarPolicy = selectedCalendar
      ? remindersPolicies.find(
          (policy) => policy.calendarId === selectedCalendar.id,
        )
      : undefined;
    const callingHours = saved.callingHours
      ? { source: "draft" as const, window: saved.callingHours }
      : calendarPolicy
        ? {
            source: "policy" as const,
            window: fromCallingWindow(readCallingWindow(calendarPolicy)),
          }
        : {
            source: "proposed" as const,
            window: fromCallingWindow(PROPOSED_CALLING_WINDOW),
          };
    const availabilityRequirement: FollowUpRequirementCode | null =
      capabilities.scheduling && availability.source === "missing"
        ? "set_availability"
        : null;

    // ── Who receives what, and who calls back.
    const callbacks = await this.callbackRouting(ctx, selectedNumber);
    const adminRows = personal
      ? []
      : await this.organizations
          .findAdminMembersWithEmails(ctx.organizationId!)
          .catch(() => []);
    const ownerName =
      [owner?.firstName, owner?.lastName].filter(Boolean).join(" ").trim() ||
      null;

    // ── What stops the existing specialists themselves.
    const brokenAgent = [
      capabilities.scheduling ? schedulingCard : undefined,
      capabilities.reminders ? remindersCard : undefined,
    ].some(
      (card) =>
        card?.nextStep?.code === "fix_agent" ||
        card?.nextStep?.code === "turn_on_agent",
    );

    const requirements: FollowUpReview["requirements"] = [];
    if (numberRequirement)
      requirements.push({ code: numberRequirement, row: "number" });
    if (availabilityRequirement) {
      requirements.push({ code: availabilityRequirement, row: "calendar" });
    }
    if (brokenAgent) requirements.push({ code: "fix_agent", row: null });
    // The balance is the manager's to see (CALL-014): a member's read-only
    // view says an administrator has to act, without telling the balance.
    const balanceKnown = canConfigure && env.balance !== null;
    if (anyOn && balanceKnown && env.balance! <= 0) {
      requirements.push({ code: "add_credit", row: null });
    }

    const adopted = activation?.status === "adopted";
    const adoptedScope = (activation?.scope ?? {}) as Record<string, unknown>;
    const state = followUpState({
      admitted,
      requirements: requirements.map((requirement) => requirement.code),
      adopted,
      adoptedCapabilities: (["scheduling", "reminders"] as const)
        .filter((capability) => adoptedScope[capability] === true)
        .map((capability) => {
          const card =
            capability === "scheduling" ? schedulingCard : remindersCard;
          return {
            capability,
            on:
              !!card &&
              card.state !== "paused" &&
              card.state !== "unconfigured",
          };
        }),
    });

    const rowsMissing = [numberRequirement, availabilityRequirement].filter(
      Boolean,
    ).length;

    // ── The meeting the review was opened from, if any.
    const draftForMeeting = {
      reminders: capabilities.reminders,
      calendarId: selectedCalendar?.id ?? null,
      offsetMinutes: reminderOffsetMinutes,
      window: callingHours.window,
      timeZone: timeZone.value,
    };
    const meetingId = saved.includeMeetingId ?? options.meetingId ?? null;
    const sourceMeeting = meetingId
      ? await this.sourceMeeting(
          ctx,
          viewer,
          meetingId,
          calendars,
          draftForMeeting,
          now,
        )
      : null;

    const upcomingExisting =
      canConfigure && capabilities.reminders && selectedCalendar
        ? await this.reminders
            .previewPolicyCalls(ctx, {
              calendarIds: [selectedCalendar.id],
              offsetMinutes: reminderOffsetMinutes,
              window: callingHours.window,
              coverage: { coversMeetingsFrom: null },
            })
            .catch(() => null)
        : null;

    const nextActions =
      canConfigure && admitted
        ? (
            await this.executions
              .listUpcomingForOwner(ctx, { from: now, take: 3 })
              .catch(() => [])
          ).map((row) => ({
            fireAt: row.fireAt.toISOString(),
            meetingId: row.meeting.id,
            meetingAt: row.meeting.scheduledAt.toISOString(),
            contactName: row.meeting.contact?.name ?? null,
          }))
        : [];

    const ownLine = owned.some(
      (number) =>
        (number.kind === "purchased" &&
          (number.status === "active" || number.status === "assigned")) ||
        (number.kind === "verified_caller_id" &&
          number.verificationStatus === "verified"),
    );
    const sharedNumberAvailable = Boolean(
      apiConfiguration.RINGEE_PUBLIC_CALLER_ID,
    );
    const line = ownLine
      ? ("own_number" as const)
      : sharedNumberAvailable
        ? ("shared_number" as const)
        : ("none" as const);
    const noCredit = balanceKnown && env.balance! <= 0;

    const adoptedBy =
      activation?.adoptedByUserId && activation.adoptedByUserId !== ctx.userId
        ? await this.users
            .findById(activation.adoptedByUserId)
            .catch(() => null)
        : activation?.adoptedByUserId
          ? owner
          : null;

    return {
      version: FOLLOW_UP_ONBOARDING_VERSION,
      workspaceType: personal ? "personal" : "organization",
      admitted,
      canConfigure,
      adminNames: canConfigure
        ? []
        : adminRows
            .map((admin) =>
              [admin.firstName, admin.lastName]
                .filter(Boolean)
                .join(" ")
                .trim(),
            )
            .filter(Boolean)
            .slice(0, 5),
      state,
      activation: {
        status: !activation ? "none" : adopted ? "adopted" : "configured",
        revision: activation?.revision ?? null,
        savedAt: activation?.configuredAt.toISOString() ?? null,
        adoptedAt: activation?.adoptedAt?.toISOString() ?? null,
        adoptedByName: adoptedBy
          ? [adoptedBy.firstName, adoptedBy.lastName]
              .filter(Boolean)
              .join(" ") || null
          : null,
        entrySource: parseEntrySource(activation?.entrySource),
        optOuts: Object.fromEntries(
          Object.entries(optOuts).map(([capability, optOut]) => [
            capability,
            { reason: optOut.reason, at: optOut.at },
          ]),
        ),
      },
      draft: {
        ...saved,
        capabilities,
        reminderOffsetMinutes,
        existingMeetings: saved.existingMeetings ?? "none",
        callingHours: callingHours.window,
        timeZone: timeZone.value,
        ...(selectedNumber ? { numberId: selectedNumber.id } : {}),
        ...(selectedCalendar ? { calendarId: selectedCalendar.id } : {}),
        ...(sourceMeeting?.eligible && saved.includeMeetingId === undefined
          ? { includeMeetingId: sourceMeeting.id }
          : {}),
      },
      rows: {
        identity: {
          status: "ok",
          kind: personal ? "person" : "company",
          companyName:
            saved.identity?.companyName ??
            profile?.companyName ??
            (personal ? null : (schedulingCard?.company ?? null)),
          companyWebsite:
            saved.identity?.companyWebsite ?? profile?.companyWebsite ?? null,
          personName: ownerName,
        },
        shareable: {
          status: "ok",
          companyDescription:
            saved.shareable?.companyDescription ??
            profile?.companyDescription ??
            null,
        },
        number: {
          status: numberRequirement ? "missing" : "ok",
          requirement: numberRequirement,
          selected: selectedNumber,
          candidates,
          pending,
          sharedNumberAvailable,
        },
        callbacks: {
          status: personal ? "locked" : "info",
          ...callbacks,
        },
        calendar: {
          status: availabilityRequirement ? "missing" : "ok",
          requirement: availabilityRequirement,
          selected: selectedCalendar
            ? {
                id: selectedCalendar.id,
                name: selectedCalendar.name,
                timezone: selectedCalendar.timezone,
                isDefault: selectedCalendar.isDefault,
                provider: selectedCalendar.integration?.provider ?? null,
                accountEmail: canConfigure
                  ? (selectedCalendar.integration?.email ?? null)
                  : null,
              }
            : null,
          candidates: calendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            isDefault: calendar.isDefault,
          })),
          willCreate: !selectedCalendar,
          availability,
        },
        callingHours: {
          status: "ok",
          source: callingHours.source,
          window: callingHours.window,
        },
        timeZone: { status: "ok", ...timeZone },
        responsible: {
          status: personal ? "locked" : "info",
          kind: personal ? "owner" : "caller",
          ownerName: personal ? ownerName : null,
          adminCount: adminRows.length,
        },
      },
      capabilities: {
        scheduling: {
          existing: schedulingCard?.state ?? "unconfigured",
          agentName: schedulingCard?.agent?.name ?? null,
          humanFollowUpEnabled:
            schedulingCard?.scheduling?.humanFollowUpEnabled === true,
          optedOut: Boolean(optOuts.scheduling),
        },
        reminders: {
          existing: remindersCard?.state ?? "unconfigured",
          agentName: remindersCard?.agent?.name ?? null,
          existingOffsetMinutes: existingOffset,
          optedOut: Boolean(optOuts.reminders),
          offsetChoices: [...FOLLOW_UP_OFFSET_CHOICES],
          upcomingExisting,
        },
      },
      requirements,
      progress: { done: 8 - rowsMissing, total: 8 },
      balance: {
        visible: canConfigure,
        amount: canConfigure ? env.balance : null,
      },
      manualCalling: {
        ready: line !== "none" && !noCredit,
        line,
        reason: line === "none" ? "no_line" : noCredit ? "no_credit" : null,
      },
      sourceMeeting,
      nextActions,
    };
  }

  /**
   * Saves the review as a draft: "configuration saved", not authorized. Only
   * the personal owner or an organization administrator, re-read now. Every id
   * it names is authorized against the workspace before it is stored.
   */
  async saveFollowUpConfiguration(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    input: {
      draft: unknown;
      expectedRevision: number | null;
      entrySource?: unknown;
      timeZoneHint?: string | null;
      meetingId?: string | null;
    },
  ): Promise<FollowUpReview> {
    assertVoiceAgentAutomations(ctx);
    await this.assertCanConfigure(ctx, viewer);
    const draft = parseFollowUpDraft(input.draft);
    await this.authorizeDraft(ctx, viewer, draft);
    const write = await this.activations.saveConfiguration(ctx, {
      version: FOLLOW_UP_ONBOARDING_VERSION,
      configuration: draft as Prisma.InputJsonObject,
      entrySource: parseEntrySource(input.entrySource),
      expectedRevision: input.expectedRevision,
    });
    if (!write.ok) {
      throw new ConflictException({
        message: "This review changed in another window. Reload it.",
        revision: write.row?.revision ?? null,
      });
    }
    const review = await this.followUpReview(ctx, viewer, {
      meetingId: draft.includeMeetingId ?? input.meetingId ?? null,
      timeZoneHint: input.timeZoneHint,
    });
    void this.analytics.record({
      event: "followup_configuration_saved",
      key: `${write.row.id}:r${write.row.revision}`,
      occurredAt: write.row.configuredAt,
      workspace: ctx,
      humanUserId: ctx.userId,
      properties: {
        entry_source: write.row.entrySource,
        onboarding_version: FOLLOW_UP_ONBOARDING_VERSION,
        missing_requirements: review.requirements.map((item) => item.code),
      },
    });
    return review;
  }

  /**
   * "Activate automatic follow-up": the explicit authorization. The draft that
   * was shown is saved (compared on its revision), every requirement is
   * checked again, and the configuration is applied through the owners the
   * rail and the editor already use — company profile, calendar and its hours,
   * the scheduling and reminders setups — before the adoption, its scope,
   * version and opt-outs are recorded. Retries reuse the same agents, claims
   * and policies; replaying the same request returns what it adopted.
   *
   * Already-booked meetings are covered only within the explicit scope: the
   * meeting the review was opened from when it is included (re-checked here at
   * the version the review showed), or every upcoming one when the person
   * chose that. Previously authorized reminder policies keep their coverage.
   */
  async adoptFollowUp(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    input: {
      requestKey: string;
      expectedRevision: number | null;
      draft?: unknown;
      entrySource?: unknown;
      timeZoneHint?: string | null;
      language?: string | null;
      meetingVersion?: number | null;
    },
  ): Promise<{
    review: FollowUpReview;
    meetingCoverage: FollowUpMeetingCoverage | null;
  }> {
    assertVoiceAgentAutomations(ctx);
    await this.assertCanConfigure(ctx, viewer);

    let activation = await this.activations.findForWorkspace(
      ctx,
      FOLLOW_UP_ONBOARDING_VERSION,
    );
    const replayed = (activation?.scope as { requestKey?: string } | null)
      ?.requestKey;
    if (activation?.status === "adopted" && replayed === input.requestKey) {
      return this.adoptionResult(ctx, viewer, activation, input.timeZoneHint);
    }

    if (input.draft !== undefined) {
      const draft = parseFollowUpDraft(input.draft);
      await this.authorizeDraft(ctx, viewer, draft);
      const write = await this.activations.saveConfiguration(ctx, {
        version: FOLLOW_UP_ONBOARDING_VERSION,
        configuration: draft as Prisma.InputJsonObject,
        entrySource: parseEntrySource(input.entrySource),
        expectedRevision: input.expectedRevision,
      });
      if (!write.ok) {
        throw new ConflictException({
          message: "This review changed in another window. Reload it.",
          revision: write.row?.revision ?? null,
        });
      }
      activation = write.row;
    } else if (!activation || activation.revision !== input.expectedRevision) {
      throw new ConflictException({
        message: "This review changed in another window. Reload it.",
        revision: activation?.revision ?? null,
      });
    }

    const review = await this.followUpReview(ctx, viewer, {
      timeZoneHint: input.timeZoneHint,
    });
    const blocking = review.requirements.filter(
      (requirement) => requirement.code !== "add_credit",
    );
    if (blocking.length) {
      throw new BadRequestException({
        message: "Complete the configuration before activating it.",
        requirements: blocking.map((requirement) => requirement.code),
      });
    }
    const draft = review.draft;
    if (!draft.capabilities.scheduling && !draft.capabilities.reminders) {
      throw new BadRequestException(
        "Switch on at least one of the two capabilities to activate.",
      );
    }
    // The meeting to include is re-checked at the version the person saw.
    const includeMeeting =
      draft.capabilities.reminders && draft.includeMeetingId
        ? await this.meetingRepo.findByIdForOwner(ctx, draft.includeMeetingId)
        : null;
    if (
      includeMeeting &&
      input.meetingVersion != null &&
      includeMeeting.scheduleVersion !== input.meetingVersion
    ) {
      throw new ConflictException(
        "That meeting changed after the review loaded. Review it again.",
      );
    }

    const adoptedAt = new Date();
    try {
      await this.applyCompanyProfile(ctx, review);
      const calendar = await this.applyCalendar(ctx, review);
      const numberId = review.rows.number.selected?.id;
      const language = normalizeLanguage(input.language);

      if (draft.capabilities.scheduling) {
        const current = await this.automations.findForOwner(
          ctx,
          AGENT_TYPE.scheduling,
        );
        const objective = (
          current?.settings as {
            humanFollowUp?: { interestedObjective?: string };
          } | null
        )?.humanFollowUp?.interestedObjective;
        await this.setupScheduling(ctx, {
          callerNumberId: numberId,
          calendarId: calendar.id,
          humanFollowUpEnabled: true,
          interestedObjective:
            objective === "information" ? "information" : "booking",
          ...(language ? { language } : {}),
        });
      } else if (isRunning(review.capabilities.scheduling.existing)) {
        await this.setEnabled(ctx, "scheduling", false);
      }

      if (draft.capabilities.reminders) {
        await this.applyReminders(ctx, review, {
          calendarId: calendar.id,
          numberId,
          language,
          adoptedAt,
        });
      } else if (isRunning(review.capabilities.reminders.existing)) {
        await this.setEnabled(ctx, "reminders", false);
      }

      let meetingCoverage: FollowUpMeetingCoverage | null = null;
      if (includeMeeting && review.sourceMeeting?.eligible) {
        meetingCoverage = await this.includeMeetingInConfirmations(
          ctx,
          includeMeeting,
          calendar.id,
        );
      }

      const optOuts: Record<string, unknown> = {
        ...((activation?.optOuts as Record<string, unknown> | null) ?? {}),
      };
      for (const capability of ["scheduling", "reminders"] as const) {
        if (draft.capabilities[capability]) {
          delete optOuts[capability];
        } else {
          optOuts[capability] = {
            reason: "disabled_in_review",
            at: adoptedAt.toISOString(),
            userId: ctx.userId,
          };
        }
      }

      const marked = await this.activations.markAdopted(ctx, {
        version: FOLLOW_UP_ONBOARDING_VERSION,
        expectedRevision: activation!.revision,
        configuration: stripMeetingFromDraft(draft) as Prisma.InputJsonObject,
        scope: {
          requestKey: input.requestKey,
          scheduling: draft.capabilities.scheduling,
          reminders: draft.capabilities.reminders,
          calendarId: calendar.id,
          numberId: numberId ?? null,
          reminderOffsetMinutes: draft.capabilities.reminders
            ? draft.reminderOffsetMinutes
            : null,
          callingHours: { ...draft.callingHours },
          timeZone: draft.timeZone,
          existingMeetings: draft.existingMeetings,
          includedMeetingIds:
            meetingCoverage && includeMeeting ? [includeMeeting.id] : [],
          readinessState: review.state,
          missingRequirements: review.requirements.map((item) => item.code),
        },
        optOuts: optOuts as Prisma.InputJsonObject,
        entrySource: parseEntrySource(input.entrySource),
        adoptedAt,
      });
      if (!marked.ok) {
        throw new ConflictException({
          message: "This review changed in another window. Reload it.",
          revision: marked.row?.revision ?? null,
        });
      }
      void this.analytics.record({
        event: "followup_adoption_authorized",
        key: `${marked.row.id}:${adoptedAt.toISOString()}`,
        occurredAt: adoptedAt,
        workspace: ctx,
        humanUserId: ctx.userId,
        properties: {
          entry_source: marked.row.entrySource,
          onboarding_version: FOLLOW_UP_ONBOARDING_VERSION,
          scheduling_enabled: draft.capabilities.scheduling,
          reminders_enabled: draft.capabilities.reminders,
          reminder_offset_minutes: draft.capabilities.reminders
            ? draft.reminderOffsetMinutes
            : null,
          existing_meetings_scope: draft.existingMeetings,
          included_meeting: Boolean(meetingCoverage),
          readiness_state: review.state,
          missing_requirements: review.requirements.map((item) => item.code),
        },
      });
      const result = await this.adoptionResult(
        ctx,
        viewer,
        marked.row,
        input.timeZoneHint,
      );
      return {
        ...result,
        meetingCoverage: meetingCoverage ?? result.meetingCoverage,
      };
    } catch (error) {
      if (!isExpectedBlocker(error)) {
        this.analytics.captureException(error, {
          component: VoiceAgentAutomationService.name,
          operation: "follow_up.adopt",
          journeyStep: "follow_up_activation",
          workspace: ctx,
          userId: ctx.userId,
          correlation: { activation: activation?.id ?? null },
        });
      }
      throw error;
    }
  }

  /**
   * Whether one meeting's confirmation call is planned — only when the
   * scheduler accepted it (an execution exists for the meeting's current
   * version) — and otherwise the specific reason. A member asks only about a
   * meeting that is theirs.
   */
  async followUpMeetingCoverage(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    meetingId: string,
  ): Promise<FollowUpMeetingCoverage> {
    assertVoiceAgentAccess(ctx);
    const meeting = await this.authorizedMeeting(ctx, viewer, meetingId);
    if (!meeting) throw new NotFoundException("Meeting not found");
    return this.meetingCoverage(ctx, meeting);
  }

  /**
   * The newest verified AI results — bookings, confirmations and moves the
   * agents recorded (AGENT-020) — with what each call cost so far. A member
   * sees only results on meetings that are theirs.
   */
  async followUpResults(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
  ): Promise<FollowUpResultSummary> {
    assertVoiceAgentAccess(ctx);
    const memberUserId =
      ctx.organizationId && !viewer.admin ? ctx.userId : null;
    const [actions, firstAt, activation] = await Promise.all([
      this.meetingRepo.latestAutomationActions(ctx, {
        kinds: [...FOLLOW_UP_VALUE_RESULTS],
        take: 3,
        memberUserId,
      }),
      this.meetingRepo.firstAutomationActionAt(ctx, [
        ...FOLLOW_UP_VALUE_RESULTS,
      ]),
      this.activations.findForWorkspace(ctx, FOLLOW_UP_ONBOARDING_VERSION),
    ]);
    const adoptedAt = activation?.adoptedAt ?? null;
    const firstSinceAdoption = adoptedAt
      ? await this.meetingRepo.firstAutomationActionAt(
          ctx,
          [...FOLLOW_UP_VALUE_RESULTS],
          adoptedAt,
        )
      : null;
    const newest = actions[0];
    return {
      results: actions.map((action) => {
        const voiceUsd = action.call?.totalCost ?? null;
        const aiUsd = action.aiChargedCredits;
        return {
          id: action.id,
          kind: action.kind,
          at: action.createdAt.toISOString(),
          meetingId: action.meetingId,
          meetingAt: action.scheduledAt.toISOString(),
          previousMeetingAt: action.previousScheduledAt?.toISOString() ?? null,
          contactName: action.meeting?.contact?.name ?? null,
          callId: action.callId,
          consumption: {
            voiceUsd: voiceUsd === null ? null : Number(voiceUsd),
            aiUsd,
            settled: voiceUsd !== null && aiUsd !== null,
          },
        };
      }),
      firstResultAt: firstAt?.toISOString() ?? null,
      firstSinceAdoption: Boolean(
        newest &&
          firstSinceAdoption &&
          newest.createdAt.getTime() === firstSinceAdoption.getTime(),
      ),
      adoptedAt: adoptedAt?.toISOString() ?? null,
    };
  }

  private async adoptionResult(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    activation: FollowUpActivation,
    timeZoneHint: string | null | undefined,
  ): Promise<{
    review: FollowUpReview;
    meetingCoverage: FollowUpMeetingCoverage | null;
  }> {
    const included = (
      (activation.scope as { includedMeetingIds?: unknown } | null)
        ?.includedMeetingIds as string[] | undefined
    )?.[0];
    const review = await this.followUpReview(ctx, viewer, {
      meetingId: included ?? null,
      timeZoneHint,
    });
    return {
      review,
      meetingCoverage: review.sourceMeeting?.coverage ?? null,
    };
  }

  private async assertCanConfigure(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
  ): Promise<void> {
    if (!viewer.admin || !(await this.organizations.isWorkspaceAdmin(ctx))) {
      throw new ForbiddenException(
        "Only an administrator can configure automatic follow-up.",
      );
    }
  }

  /** Every id a draft names, authorized against this workspace. */
  private async authorizeDraft(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    draft: FollowUpConfigurationDraft,
  ): Promise<void> {
    if (draft.numberId) {
      const numbers = await this.voiceAgents.listCallerNumbers(ctx);
      if (!numbers.some((number) => number.id === draft.numberId)) {
        throw new BadRequestException(
          "Choose one of this workspace's numbers for the AI.",
        );
      }
    }
    if (draft.calendarId) {
      const calendars = await this.calendarService.peekCalendars(ctx);
      if (!calendars.some((calendar) => calendar.id === draft.calendarId)) {
        throw new BadRequestException(
          "Choose one of this workspace's calendars.",
        );
      }
    }
    if (draft.includeMeetingId) {
      const meeting = await this.authorizedMeeting(
        ctx,
        viewer,
        draft.includeMeetingId,
      );
      if (!meeting) throw new NotFoundException("Meeting not found");
    }
  }

  /** A meeting of this workspace; for a member, only one that is theirs. */
  private async authorizedMeeting(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    meetingId: string,
  ): Promise<Meeting | null> {
    const meeting = await this.meetingRepo.findByIdForOwner(ctx, meetingId);
    if (!meeting || !isInWorkspace(meeting, ctx)) return null;
    if (ctx.organizationId && !viewer.admin) {
      const own =
        meeting.userId === ctx.userId ||
        meeting.responsibleUserId === ctx.userId;
      if (!own) return null;
    }
    return meeting;
  }

  private async sourceMeeting(
    ctx: OwnershipContext,
    viewer: AutomationViewer,
    meetingId: string,
    calendars: Array<{ id: string; isDefault: boolean }>,
    draft: {
      reminders: boolean;
      calendarId: string | null;
      offsetMinutes: number;
      window: CallingWindowInput;
      timeZone: string;
    },
    now: Date,
  ): Promise<FollowUpSourceMeeting | null> {
    const meeting = await this.authorizedMeeting(ctx, viewer, meetingId);
    if (!meeting) return null;
    const contact = await this.contacts
      .findContactByIdForOwner(ctx, meeting.contactId)
      .catch(() => null);
    const meetingCalendarId =
      meeting.calendarId ??
      calendars.find((calendar) => calendar.isDefault)?.id ??
      null;
    const plannedFireAt = planReminderCallAt({
      meetingAt: meeting.scheduledAt,
      offsetMinutes: draft.offsetMinutes,
      allowNearMeeting: draft.offsetMinutes === 240,
      window: {
        startMinute: draft.window.startMinute,
        endMinute: draft.window.endMinute,
        days: draft.window.days,
      },
      timeZone: draft.timeZone,
      notBefore: new Date(now.getTime() + 2 * 60_000),
    });
    const reason: FollowUpMeetingIneligibility | null =
      meeting.status !== MeetingStatus.scheduled &&
      meeting.status !== MeetingStatus.rescheduled
        ? "cancelled"
        : meeting.attendanceStatus !== "pending"
          ? "already_answered"
          : meeting.scheduledAt.getTime() <= now.getTime() + 20 * 60_000
            ? "too_soon"
            : !draft.reminders
              ? "reminders_off"
              : draft.calendarId && meetingCalendarId !== draft.calendarId
                ? "other_calendar"
                : !plannedFireAt
                  ? "outside_window"
                  : null;
    return {
      id: meeting.id,
      scheduledAt: meeting.scheduledAt.toISOString(),
      durationMinutes: meeting.duration,
      version: meeting.scheduleVersion,
      calendarId: meetingCalendarId,
      contactName: contact?.name ?? null,
      eligible: reason === null,
      reason,
      plannedFireAt: plannedFireAt?.toISOString() ?? null,
      coverage: await this.meetingCoverage(ctx, meeting),
    };
  }

  private async meetingCoverage(
    ctx: OwnershipContext,
    meeting: Meeting,
  ): Promise<FollowUpMeetingCoverage> {
    const none = (
      reason: FollowUpMeetingCoverage["reason"],
    ): FollowUpMeetingCoverage => ({ covered: false, fireAt: null, reason });
    if (!voiceAgentAutomationsEnabled(ctx)) return none("not_admitted");
    if (
      meeting.status !== MeetingStatus.scheduled &&
      meeting.status !== MeetingStatus.rescheduled
    ) {
      return none("cancelled");
    }
    const open = await this.executions.findOpenForMeetingVersion(
      meeting.id,
      meeting.scheduleVersion,
      "policy",
    );
    if (open) {
      return { covered: true, fireAt: open.fireAt.toISOString(), reason: null };
    }
    if (meeting.attendanceStatus !== "pending") return none("already_answered");
    const calendarId =
      meeting.calendarId ??
      (await this.calendarService.peekCalendars(ctx)).find(
        (calendar) => calendar.isDefault,
      )?.id ??
      null;
    const policy = calendarId
      ? await this.policies.findForCalendar(ctx, calendarId)
      : null;
    if (!policy) {
      const activation = await this.activations.findForWorkspace(
        ctx,
        FOLLOW_UP_ONBOARDING_VERSION,
      );
      return none(
        activation?.status === "adopted"
          ? "calendar_not_covered"
          : "not_adopted",
      );
    }
    if (!policy.enabled) return none("reminders_paused");
    if (!policyCoversMeeting(policy, meeting)) return none("not_included");
    return none("too_close");
  }

  /**
   * Adds the meeting the review came from to the confirmations: the policy's
   * explicit inclusion, then the ordinary planner — calling window, the
   * close-booking rule and the per-version keys that deduplicate it.
   */
  private async includeMeetingInConfirmations(
    ctx: OwnershipContext,
    meeting: Meeting,
    calendarId: string,
  ): Promise<FollowUpMeetingCoverage> {
    const meetingCalendarId =
      meeting.calendarId ??
      (await this.calendarService.peekCalendars(ctx)).find(
        (calendar) => calendar.isDefault,
      )?.id;
    if (meetingCalendarId !== calendarId) {
      return { covered: false, fireAt: null, reason: "calendar_not_covered" };
    }
    const policy = await this.policies.findForCalendar(ctx, calendarId);
    if (policy?.coversMeetingsFrom) {
      await this.policies.includeMeetings(ctx, policy.id, [meeting.id]);
    }
    const fresh = await this.meetingRepo.findByIdForOwner(ctx, meeting.id);
    if (fresh) await this.reminders.planMeetingCalls(fresh);
    return this.meetingCoverage(ctx, fresh ?? meeting);
  }

  /** Who a returned call to the AI's number reaches today. */
  private async callbackRouting(
    ctx: OwnershipContext,
    number: FollowUpNumberOption | null,
  ): Promise<{
    kind: FollowUpReview["rows"]["callbacks"]["kind"];
    label: string | null;
  }> {
    if (!ctx.organizationId) return { kind: "owner", label: null };
    if (!number || number.kind !== "purchased") {
      return { kind: "unknown", label: null };
    }
    try {
      const view = await this.inboundRoutes.getForNumber(ctx, {
        kind: "ringee",
        id: number.id,
      });
      return view.destinationId || view.destinationLabel
        ? { kind: "route", label: view.destinationLabel ?? null }
        : { kind: "unrouted", label: null };
    } catch {
      return { kind: "unknown", label: null };
    }
  }

  /** The reviewed identity and approved information, through their owner. */
  private async applyCompanyProfile(
    ctx: OwnershipContext,
    review: FollowUpReview,
  ): Promise<void> {
    const { identity, shareable } = review.draft;
    if (!identity && !shareable) return;
    const current = await this.companyProfiles.get(ctx).catch(() => null);
    const next = {
      companyName: identity
        ? identity.companyName
        : (current?.companyName ?? null),
      companyWebsite: identity
        ? identity.companyWebsite
        : (current?.companyWebsite ?? null),
      companyDescription: shareable
        ? shareable.companyDescription
        : (current?.companyDescription ?? null),
    };
    if (
      next.companyName === (current?.companyName ?? null) &&
      next.companyWebsite === (current?.companyWebsite ?? null) &&
      next.companyDescription === (current?.companyDescription ?? null)
    ) {
      return;
    }
    await this.companyProfiles.save(ctx, next);
  }

  /**
   * The calendar the review named — created only now when the workspace had
   * none — with the reviewed time zone and, when the person set them in the
   * review, its bookable hours.
   */
  private async applyCalendar(
    ctx: OwnershipContext,
    review: FollowUpReview,
  ): Promise<{ id: string; timezone: string }> {
    const calendarRow = review.rows.calendar;
    let calendar = calendarRow.selected
      ? { id: calendarRow.selected.id, timezone: calendarRow.selected.timezone }
      : await this.calendarService
          .ensureGlobalCalendar(ctx)
          .then((created) => ({ id: created.id, timezone: created.timezone }));
    const zone = review.rows.timeZone;
    if (
      (zone.source === "draft" || zone.source === "browser") &&
      zone.value !== calendar.timezone
    ) {
      const updated = await this.calendarService.updateCalendar(
        ctx,
        calendar.id,
        {
          timezone: zone.value,
        },
      );
      calendar = { id: updated.id, timezone: updated.timezone };
    }
    if (
      calendarRow.availability.source === "draft" &&
      calendarRow.availability.window
    ) {
      const window = calendarRow.availability.window;
      await this.calendarService.updateAvailabilitySettings(
        ctx,
        [
          {
            daysOfWeek: window.days,
            startTime: minuteToTime(window.startMinute),
            endTime: minuteToTime(window.endMinute),
            // One booking at a time, like the default schedule.
            capacity: 1,
          },
        ],
        calendar.id,
      );
    }
    return calendar;
  }

  /**
   * Reminders through the one policy writer: an existing setup keeps its
   * coverage, calendars and offset unless the review changed them, and a
   * paused one is resumed only because the person switched it on here. A new
   * policy covers new bookings only, unless every upcoming meeting was chosen.
   */
  private async applyReminders(
    ctx: OwnershipContext,
    review: FollowUpReview,
    input: {
      calendarId: string;
      numberId: string | undefined;
      language: string | null;
      adoptedAt: Date;
    },
  ): Promise<void> {
    const draft = review.draft;
    const automation = await this.automations.findForOwner(
      ctx,
      AGENT_TYPE.reminders,
    );
    const existing = automation?.agentId
      ? await this.policies.listForOwner(ctx, { agentId: automation.agentId })
      : [];
    const onCalendar = existing.find(
      (policy) => policy.calendarId === input.calendarId,
    );
    const unchanged =
      onCalendar &&
      onCalendar.offsetsMinutes.length === 1 &&
      onCalendar.offsetsMinutes[0] === draft.reminderOffsetMinutes &&
      sameWindow(
        fromCallingWindow(readCallingWindow(onCalendar)),
        draft.callingHours,
      );
    if (unchanged) {
      if (automation && !automation.enabled) {
        await this.setEnabled(ctx, "reminders", true);
      }
    } else {
      await this.configureReminders(
        ctx,
        {
          calendarIds: [
            ...new Set([
              ...existing.map((policy) => policy.calendarId),
              input.calendarId,
            ]),
          ],
          offsetMinutes: draft.reminderOffsetMinutes,
          ...(input.numberId ? { callerNumberId: input.numberId } : {}),
          ...(input.language ? { language: input.language } : {}),
        },
        {
          window: draft.callingHours,
          coverage: {
            coversMeetingsFrom:
              draft.existingMeetings === "all_upcoming"
                ? null
                : input.adoptedAt,
          },
        },
      );
    }
    if (draft.existingMeetings === "all_upcoming") {
      // An explicit "also confirm what is already booked" reaches a policy
      // that existed with a narrower coverage, too.
      const policy = await this.policies.findForCalendar(ctx, input.calendarId);
      if (policy?.coversMeetingsFrom) {
        const widened = await this.policies.coverAllMeetings(ctx, policy.id);
        if (widened) await this.reminders.planPolicyCalls(ctx, widened);
      }
    }
  }

  // ── Internals ──────────────────────────────────────────────────────

  /**
   * The agent a capability runs on: the one the person picked, the one the
   * card already drives, or — once, under the row's claim — a new one with the
   * voice the person picked (else one in their language) and the workspace's
   * company context.
   */
  private async resolveAgent(
    ctx: OwnershipContext,
    capability: AutomationCapability,
    input: QuickAgentInput,
    settings: { callerNumberId?: string; calendarId?: string },
    /** What a row this setup creates starts with (`claim`). */
    firstSettings?: Record<string, string>,
  ): Promise<AiVoiceAgent> {
    const type = AGENT_TYPE[capability];
    if (input.agentId) {
      const agent = await this.voiceAgents.require(ctx, input.agentId);
      if (agent.type !== type) {
        throw new BadRequestException(
          "That agent does a different job. Choose one of the agents listed for this card.",
        );
      }
      return this.prepare(ctx, agent, input.name, settings);
    }

    const existing = await this.automations.findForOwner(ctx, type);
    if (existing?.agentId) {
      const agent = await this.agentRepo.findByIdForOwner(
        ctx,
        existing.agentId,
      );
      if (agent) {
        if (existing.claimToken) {
          if (
            (existing.claimedAt &&
              existing.claimedAt.getTime() > Date.now() - CLAIM_STALE_MS) ||
            agent.status === AiVoiceAgentStatus.draft
          ) {
            throw new ConflictException(
              "This agent is still being set up. Open Customize to inspect or finish it.",
            );
          }
          // Provisioning completed before the request died. Recover the same
          // associated agent, never create or re-provision an untracked one.
          const recovered = await this.automations.completeClaim(
            existing.id,
            existing.claimToken,
            {
              userId: ctx.userId,
              agentId: agent.id,
              enabled: true,
            },
          );
          if (!recovered)
            throw new ConflictException(
              "This setup changed in another window. Reload it.",
            );
        }
        return this.prepare(ctx, agent, input.name, settings);
      }
      // The agent the card drove was deleted. While the row names it, the
      // claim below sees a card already set up and every setup is refused.
      await this.automations.clearAgent(ctx, existing.id, existing.agentId);
    }

    const token = randomUUID();
    const claim = await this.automations.claim(
      ctx,
      type,
      token,
      new Date(Date.now() - CLAIM_STALE_MS),
      firstSettings,
    );
    if (!claim.claimed) {
      const agent = claim.row.agentId
        ? await this.agentRepo.findByIdForOwner(ctx, claim.row.agentId)
        : null;
      if (agent && !claim.row.claimToken)
        return this.prepare(ctx, agent, input.name, settings);
      throw new ConflictException(
        "This agent is being set up in another window. Try again in a moment.",
      );
    }

    try {
      // A chosen voice is validated by `create` against the catalogue and the
      // workspace's own clones, like a voice picked in the editor.
      const voice =
        input.voiceId?.trim() || (await this.defaultVoice(input.language));
      const created = await this.voiceAgents.create(
        ctx,
        {
          name: input.name?.trim() || DEFAULT_NAMES[capability],
          type,
          voiceId: voice,
          ...(settings.callerNumberId
            ? { callerNumberId: settings.callerNumberId }
            : {}),
          ...(settings.calendarId ? { calendarId: settings.calendarId } : {}),
        },
        { id: claim.row.id, token },
      );
      const completed = await this.automations.completeClaim(
        claim.row.id,
        token,
        { userId: ctx.userId, agentId: created.id, enabled: true },
      );
      if (!completed) {
        throw new ConflictException(
          "This setup changed while the agent was being provisioned. Reload it before saving again.",
        );
      }
      return created;
    } catch (error) {
      await this.automations
        .releaseClaim(claim.row.id, token)
        .catch(() => undefined);
      throw error;
    }
  }

  /** Applies what the mini-form changed, and switches the agent on. */
  private async prepare(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
    name: string | undefined,
    settings: { callerNumberId?: string; calendarId?: string },
  ): Promise<AiVoiceAgent> {
    const patch = {
      ...(name?.trim() && name.trim() !== agent.name
        ? { name: name.trim() }
        : {}),
      ...(settings.callerNumberId &&
      settings.callerNumberId !== agent.callerNumberId
        ? { callerNumberId: settings.callerNumberId }
        : {}),
      ...(settings.calendarId && settings.calendarId !== agent.calendarId
        ? { calendarId: settings.calendarId }
        : {}),
    };
    const updated = Object.keys(patch).length
      ? await this.voiceAgents.update(ctx, agent.id, patch)
      : agent;
    return this.ensureActive(ctx, updated).catch(() => updated);
  }

  private async ensureActive(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
  ): Promise<AiVoiceAgent> {
    if (agent.status === AiVoiceAgentStatus.active) return agent;
    return this.voiceAgents.setStatus(ctx, agent.id, AiVoiceAgentStatus.active);
  }

  /** A curated voice in the person's language, so the agent speaks it. */
  private async defaultVoice(language?: string): Promise<string | null> {
    const base = (language ?? "en").split("-")[0]!.toLowerCase();
    try {
      const voices = await this.voiceAgents.listVoices();
      return (
        voices.find((voice) => !voice.custom && voice.language === base)?.id ??
        voices.find((voice) => !voice.custom && voice.language === "en")?.id ??
        null
      );
    } catch {
      return null;
    }
  }

  private async environment(ctx: OwnershipContext) {
    const [balance, numbers] = await Promise.all([
      this.credits.getBalance(ctx).catch(() => null),
      this.voiceAgents
        .listCallerNumbers(ctx)
        .catch(() => [] as VoiceAgentCallerNumber[]),
    ]);
    return { balance, numbers };
  }

  private async cards(
    ctx: OwnershipContext,
    options: { details: boolean; capabilities: AutomationCapability[] },
  ): Promise<AutomationCard[]> {
    const [automations, env] = await Promise.all([
      this.automations.listForOwner(ctx),
      this.environment(ctx),
    ]);
    return Promise.all(
      options.capabilities.map((capability) =>
        this.buildCard(
          ctx,
          capability,
          automations.find(
            (automation) => automation.capability === AGENT_TYPE[capability],
          ) ?? null,
          env,
          options,
        ),
      ),
    );
  }

  private async buildCard(
    ctx: OwnershipContext,
    capability: AutomationCapability,
    automation: AiVoiceAgentAutomation | null,
    env: { balance: number | null; numbers: VoiceAgentCallerNumber[] },
    options: { details: boolean },
  ): Promise<AutomationCard> {
    const type = AGENT_TYPE[capability];
    const agent = automation?.agentId
      ? await this.agentRepo.findByIdForOwner(ctx, automation.agentId)
      : null;

    if (!agent) {
      const activating =
        !!automation?.claimToken &&
        !!automation.claimedAt &&
        automation.claimedAt.getTime() > Date.now() - CLAIM_STALE_MS;
      const candidates = options.details
        ? (await this.agentRepo.listForOwner(ctx, { type, limit: 20 })).data
            .filter((candidate) => !candidate.deletedAt)
            .map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              status: candidate.status,
            }))
        : [];
      return {
        capability,
        state: activating ? "activating" : "unconfigured",
        agent: null,
        nextStep: activating
          ? null
          : { code: "set_up", message: "Set this up to switch it on." },
        candidates,
        company: null,
      };
    }

    const company = options.details
      ? await this.companyProfiles
          .resolveForAgent(ctx, agent)
          .then((resolved) => resolved.name?.trim() || null)
          .catch(() => null)
      : null;
    const base = {
      capability,
      agent: summarize(agent),
      candidates: [],
      company,
    };
    const paused = !automation!.enabled;

    if (capability === "reminders") {
      const policies = await this.policies.listForOwner(ctx, {
        agentId: agent.id,
      });
      const calendars = (
        await Promise.all(
          policies.map((policy) =>
            this.calendarService
              .getCalendar(ctx, policy.calendarId)
              .catch(() => null),
          ),
        )
      ).filter((calendar) => calendar !== null);
      const issue =
        agentIssue(agent) ??
        outboundIssue(agent, env) ??
        (policies.length === 0 ||
        calendars.length === 0 ||
        calendars.some((calendar) => calendar.archivedAt)
          ? {
              code: "choose_calendar" as const,
              message: "Choose a calendar whose meetings it should confirm.",
            }
          : null);
      const [upcomingCalls, admins] = options.details
        ? await Promise.all([
            this.executions.countUpcomingForOwner(ctx, {
              from: new Date(),
              agentId: agent.id,
            }),
            // A personal workspace has no admins to copy: its owner is the member.
            ctx.organizationId
              ? this.organizations
                  .findAdminMembersWithEmails(ctx.organizationId)
                  .catch(() => [])
              : Promise.resolve([]),
          ])
        : [0, []];
      return {
        ...base,
        state: paused ? "paused" : issue ? "needs_attention" : "active",
        nextStep: paused ? null : issue,
        reminders: {
          calendars: calendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            timezone: calendar.timezone,
          })),
          offsetMinutes: policies[0]?.offsetsMinutes[0] ?? null,
          upcomingCalls,
          callerNumber: callerNumberOf(agent, env.numbers),
          ccAdmins: admins.length,
        },
      };
    }

    if (capability === "receptionist") {
      const routes = await this.inboundRouteRepo.listByDestination(
        ctx,
        InboundDestinationType.ai_receptionist,
        agent.id,
      );
      const issue =
        agentIssue(agent) ??
        (!inboundAvailable()
          ? {
              code: "inbound_unavailable" as const,
              message: "Inbound AI calling is not available yet.",
            }
          : null) ??
        (routes.length === 0
          ? {
              code: "answer_a_number" as const,
              message: "Choose a number for it to answer.",
            }
          : null);
      const refs: InboundNumberRef[] = paused
        ? readReceptionistSettings(automation).numbers
        : routes.map((route) =>
            route.numberId
              ? { kind: "ringee" as const, id: route.numberId }
              : { kind: "external" as const, id: route.externalNumberId! },
          );
      const numbers = options.details
        ? (
            await Promise.all(
              refs.map((ref) =>
                this.inboundRoutes.getForNumber(ctx, ref).catch(() => null),
              ),
            )
          ).flatMap((view) =>
            view
              ? [
                  {
                    number: view.number,
                    phoneNumber: view.phoneNumber,
                    answering:
                      view.destinationType ===
                        InboundDestinationType.ai_receptionist &&
                      view.destinationId === agent.id,
                    restoreLabel:
                      view.destinationType ===
                      InboundDestinationType.ai_receptionist
                        ? (view.restoreDestination?.label ?? null)
                        : view.destinationLabel,
                  },
                ]
              : [],
          )
        : [];
      return {
        ...base,
        state: paused ? "paused" : issue ? "needs_attention" : "active",
        nextStep: paused ? null : issue,
        receptionist: { numbers },
      };
    }

    // Scheduling: available when the agent can place a call and book.
    let calendar: AutomationCalendarRef | null = null;
    let calendarIssue: AutomationNextStep | null = null;
    if (options.details || agent.calendarId) {
      try {
        const resolved = await this.calendarService.resolveCalendar(ctx, {
          calendarId: agent.calendarId,
        });
        calendar = {
          id: resolved.calendar.id,
          name: resolved.calendar.name,
          timezone: resolved.timezone,
        };
      } catch (error) {
        calendarIssue = { code: "choose_calendar", message: describe(error) };
      }
    }
    const issue =
      agentIssue(agent) ?? outboundIssue(agent, env) ?? calendarIssue;
    return {
      ...base,
      state: paused ? "paused" : issue ? "needs_attention" : "active",
      nextStep: paused ? null : issue,
      scheduling: {
        humanFollowUpEnabled:
          (
            automation?.settings as {
              humanFollowUp?: { enabled?: boolean };
            } | null
          )?.humanFollowUp?.enabled === true,
        calendar,
        callerNumber: callerNumberOf(agent, env.numbers),
      },
    };
  }

  private async activity(
    ctx: OwnershipContext,
    cards: AutomationCard[],
  ): Promise<AutomationActivity[]> {
    const since = new Date(Date.now() - ACTIVITY_WINDOW_MS);
    const schedulingAgentId =
      cards.find((card) => card.capability === "scheduling")?.agent?.id ?? null;
    // Reminder calls and the emails they owe show only beside the reminders
    // card — never to a member, who does not get it.
    const reminders = cards.some((card) => card.capability === "reminders");
    const [finished, attention, bookings] = await Promise.all([
      reminders
        ? this.executions.listFinishedForOwner(ctx, { since, take: 5 })
        : Promise.resolve([]),
      reminders
        ? this.deliveries.listAttentionForOwner(ctx, { since, take: 5 })
        : Promise.resolve([]),
      schedulingAgentId
        ? this.agentCalls.listRecentForAgents(
            ctx,
            [schedulingAgentId],
            since,
            5,
          )
        : Promise.resolve([]),
    ]);

    const items: AutomationActivity[] = [
      ...finished.map((execution) => ({
        id: `execution:${execution.id}`,
        kind: executionActivity(execution.status),
        at: (execution.finishedAt ?? execution.updatedAt).toISOString(),
        label:
          execution.meeting.contact?.name ?? execution.meeting.title ?? null,
        meetingId: execution.meetingId,
        callId: execution.agentCall?.callId ?? null,
        deliveryId: null,
      })),
      ...attention.map((delivery) => ({
        id: `delivery:${delivery.id}`,
        kind:
          delivery.status === MeetingEmailDeliveryStatus.needs_email
            ? ("needs_email" as const)
            : delivery.status === MeetingEmailDeliveryStatus.needs_member
              ? ("needs_member" as const)
              : ("email_failed" as const),
        at: delivery.updatedAt.toISOString(),
        label: delivery.meeting.contact?.name ?? delivery.meeting.title ?? null,
        meetingId: delivery.meetingId,
        callId: null,
        deliveryId: delivery.id,
      })),
      ...bookings
        .filter(
          (call) =>
            call.outcome === AiVoiceAgentOutcome.meeting_booked &&
            call.meetingId,
        )
        .map((call) => ({
          id: `booking:${call.id}`,
          kind: "meeting_booked" as const,
          at: call.updatedAt.toISOString(),
          label: null,
          meetingId: call.meetingId,
          callId: call.callId,
          deliveryId: null,
        })),
    ];
    return items
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, ACTIVITY_ITEMS);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function visibleCapabilities(
  ctx: OwnershipContext,
  viewer: AutomationViewer,
): AutomationCapability[] {
  if (!ctx.organizationId) return PERSONAL_AUTOMATION_CAPABILITIES;
  return viewer.admin
    ? AUTOMATION_CAPABILITIES
    : MEMBER_AUTOMATION_CAPABILITIES;
}

function summarize(agent: AiVoiceAgent): AutomationAgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    voiceLabel: agent.voiceLabel,
    voiceLanguage: agent.voiceLanguage,
    callerNumberId: agent.callerNumberId,
    calendarId: agent.calendarId,
    lastError: agent.lastError,
  };
}

/** What stops the agent itself from working. */
function agentIssue(agent: AiVoiceAgent): AutomationNextStep | null {
  if (agent.status === AiVoiceAgentStatus.error) {
    return {
      code: "fix_agent",
      message:
        agent.lastError || "The agent could not be set up. Open Customize.",
    };
  }
  if (!agent.providerAssistantId) {
    return {
      code: "fix_agent",
      message: "The agent is not finished setting up yet. Open Customize.",
    };
  }
  if (agent.status !== AiVoiceAgentStatus.active) {
    return { code: "turn_on_agent", message: "The agent is switched off." };
  }
  return null;
}

/**
 * What stops an outbound agent from placing a call: the same caller-ID rule
 * the dial path applies (AGENT-008), and money to pay for it (BILL-009).
 */
function outboundIssue(
  agent: AiVoiceAgent,
  env: { balance: number | null; numbers: VoiceAgentCallerNumber[] },
): AutomationNextStep | null {
  if (env.numbers.length === 0) {
    return {
      code: "add_number",
      message: "Buy a number or verify a caller ID to call from.",
    };
  }
  if (
    agent.callerNumberId &&
    !env.numbers.some((number) => number.id === agent.callerNumberId)
  ) {
    return {
      code: "choose_number",
      message: "The number this agent calls from is no longer available.",
    };
  }
  if (!agent.callerNumberId && env.numbers.length > 1) {
    return {
      code: "choose_number",
      message: "Choose which number this agent calls from.",
    };
  }
  if (env.balance !== null && env.balance <= 0) {
    return { code: "add_credit", message: "Add credit so it can call." };
  }
  return null;
}

function callerNumberOf(
  agent: AiVoiceAgent,
  numbers: VoiceAgentCallerNumber[],
): string | null {
  const assigned = agent.callerNumberId
    ? numbers.find((number) => number.id === agent.callerNumberId)
    : numbers.length === 1
      ? numbers[0]
      : undefined;
  return assigned?.phoneNumber ?? null;
}

function executionActivity(
  status: MeetingReminderExecutionStatus,
): AutomationActivityKind {
  switch (status) {
    case MeetingReminderExecutionStatus.confirmed:
      return "attendance_confirmed";
    case MeetingReminderExecutionStatus.declined:
      return "attendance_declined";
    case MeetingReminderExecutionStatus.no_answer:
      return "no_answer";
    case MeetingReminderExecutionStatus.failed:
      return "call_failed";
    default:
      return "call_completed";
  }
}

/** Whether this installation can route inbound calls to an AI at all. */
function inboundAvailable(): boolean {
  const app = apiConfiguration.TELNYX_CALL_CONTROL_APP_ID;
  return Boolean(app && app !== apiConfiguration.TELNYX_CONNECTION_ID);
}

function readReceptionistSettings(
  automation: AiVoiceAgentAutomation | null,
): ReceptionistSettings {
  const raw = (automation?.settings ?? {}) as Partial<ReceptionistSettings>;
  const numbers = Array.isArray(raw.numbers)
    ? raw.numbers.filter(
        (ref): ref is InboundNumberRef =>
          !!ref &&
          (ref.kind === "ringee" || ref.kind === "external") &&
          typeof ref.id === "string",
      )
    : [];
  const fallback =
    raw.fallback &&
    (raw.fallback.destinationType === "user" ||
      raw.fallback.destinationType === "ring_group") &&
    typeof raw.fallback.destinationId === "string"
      ? raw.fallback
      : null;
  return { numbers, fallback };
}

function sameRef(a: InboundNumberRef, b: InboundNumberRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function uniqueRefs(refs: InboundNumberRef[]): InboundNumberRef[] {
  return refs.filter(
    (ref, index) => refs.findIndex((other) => sameRef(other, ref)) === index,
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Follow-up review helpers (Stage 4C) ──────────────────────────────

/**
 * Definitive AI meeting actions that are value for the customer (AGENT-020):
 * a booking, a confirmed attendance, a move or a linked replacement. A
 * cancellation or a decline is a resolution, never a success.
 */
export const FOLLOW_UP_VALUE_RESULTS = [
  "booked",
  "attendance_confirmed",
  "rescheduled",
  "replaced",
] as const;

/** The review's capability behind a rail capability, if it has one. */
function toFollowUpCapability(
  capability: AutomationCapability,
): FollowUpCapability | null {
  if (capability === "scheduling" || capability === "reminders") {
    return capability;
  }
  return null;
}

/** The stored draft, re-validated; a field that no longer parses is dropped. */
function readSavedDraft(
  activation: FollowUpActivation | null,
): FollowUpConfigurationDraft {
  const raw = activation?.configuration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const draft: FollowUpConfigurationDraft = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    try {
      Object.assign(draft, parseFollowUpDraft({ [key]: value }));
    } catch {
      // A field an older version stored differently is simply not reused.
    }
  }
  return draft;
}

function readOptOuts(
  activation: FollowUpActivation | null,
): Partial<
  Record<FollowUpCapability, { reason: string; at: string; userId?: string }>
> {
  const raw = activation?.optOuts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<
    Record<FollowUpCapability, { reason: string; at: string; userId?: string }>
  > = {};
  for (const capability of ["scheduling", "reminders"] as const) {
    const entry = (raw as Record<string, unknown>)[capability] as
      | { reason?: unknown; at?: unknown; userId?: unknown }
      | undefined;
    if (
      entry &&
      typeof entry.reason === "string" &&
      typeof entry.at === "string"
    ) {
      out[capability] = {
        reason: entry.reason,
        at: entry.at,
        ...(typeof entry.userId === "string" ? { userId: entry.userId } : {}),
      };
    }
  }
  return out;
}

/** The first availability rule as a window, for the row's summary. */
function windowFromAvailability(
  rule:
    | { daysOfWeek: number[]; startTime: string; endTime: string }
    | undefined,
): CallingWindowInput | null {
  if (!rule) return null;
  const toMinute = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };
  return {
    days: [...rule.daysOfWeek],
    startMinute: toMinute(rule.startTime),
    endMinute: toMinute(rule.endTime),
  };
}

/** A capability that is switched on today, whatever its readiness. */
function isRunning(state: AutomationState): boolean {
  return (
    state === "active" || state === "needs_attention" || state === "activating"
  );
}

function normalizeLanguage(value: string | null | undefined): string | null {
  if (!value) return null;
  const base = value.split("-")[0]!.toLowerCase();
  return /^[a-z]{2}$/.test(base) ? base : null;
}

/** The adopted configuration, without the one-off meeting inclusion. */
function stripMeetingFromDraft(
  draft: FollowUpConfigurationDraft,
): FollowUpConfigurationDraft {
  const { includeMeetingId: _included, ...rest } = draft;
  return rest;
}

function sameWindow(a: CallingWindowInput, b: CallingWindowInput): boolean {
  return (
    a.startMinute === b.startMinute &&
    a.endMinute === b.endMinute &&
    a.days.length === b.days.length &&
    a.days.every((day, index) => day === b.days[index])
  );
}

/** Expected product blockers are answers, not exceptions to track. */
function isExpectedBlocker(error: unknown): boolean {
  return (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof NotFoundException
  );
}
