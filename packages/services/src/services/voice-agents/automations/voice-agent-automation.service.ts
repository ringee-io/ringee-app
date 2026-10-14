import {
  BadRequestException,
  ConflictException,
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
  InboundDestinationType,
  InboundRouteRepository,
  MeetingEmailDeliveryRepository,
  MeetingEmailDeliveryStatus,
  MeetingReminderExecutionRepository,
  MeetingReminderExecutionStatus,
  MeetingReminderPolicyRepository,
  OrganizationRepository,
  UserRepository,
} from "@ringee/database";
import type {
  OrganizationOwnershipContext,
  OwnershipContext,
} from "@ringee/platform";
import { CalendarService } from "../../calendar.service";
import { ContactService } from "../../contact.service";
import { CreditService } from "../../credit.service";
import { InboundRouteService } from "../../inbound-routing/inbound-route.service";
import type { InboundNumberRef } from "../../inbound-routing/inbound-routing.types";
import { MeetingService, normalizeEmail } from "../../meeting.service";
import { ReminderService } from "../../reminders/reminder.service";
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
    if (!voiceAgentAutomationsEnabled(ctx.organizationId)) {
      return { enabled: false, operational: 0, attention: 0, capabilities: {} };
    }
    const cards = await this.cards(ctx as OrganizationOwnershipContext, {
      details: false,
      capabilities: visibleCapabilities(viewer),
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
    if (!voiceAgentAutomationsEnabled(ctx.organizationId)) {
      return { enabled: false, operational: 0, cards: [], activity: [] };
    }
    assertVoiceAgentAutomations(ctx);
    const cards = await this.cards(ctx, {
      details: true,
      capabilities: visibleCapabilities(viewer),
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

    for (const calendarId of calendarIds) {
      const previous = await this.policies.findForCalendar(ctx, calendarId);
      const policy = await this.policies.upsertForCalendar(ctx, {
        agentId: agent.id,
        calendarId,
        offsetsMinutes: [input.offsetMinutes],
      });
      if (previous) {
        await this.reminders.cancelPolicyCalls(policy.id, "policy_changed");
      }
      await this.reminders.planPolicyCalls(ctx, policy);
    }

    await this.automations.upsertForOwner(ctx, AGENT_TYPE.reminders, {
      agentId: agent.id,
      enabled: true,
      settings: { calendarIds, offsetMinutes: input.offsetMinutes },
    });
    return this.card(ctx, "reminders");
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
    input: QuickAgentInput & { callerNumberId?: string; calendarId?: string },
  ): Promise<AutomationCard> {
    assertVoiceAgentAutomations(ctx);
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
    const agent = await this.resolveAgent(ctx, "scheduling", input, {
      callerNumberId: input.callerNumberId,
      calendarId: input.calendarId,
    });
    await this.automations.upsertForOwner(ctx, AGENT_TYPE.scheduling, {
      agentId: agent.id,
      enabled: true,
    });
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

    await this.automations.removeForOwner(ctx, automation.id, agentId);
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
    if (
      !(await this.organizations.isMember(
        responsibleUserId,
        ctx.organizationId,
      ))
    ) {
      throw new BadRequestException(
        "Choose a member of your organization for the meeting.",
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

  // ── Internals ──────────────────────────────────────────────────────

  /**
   * The agent a capability runs on: the one the person picked, the one the
   * card already drives, or — once, under the row's claim — a new one with a
   * voice in the person's language and the workspace's company context.
   */
  private async resolveAgent(
    ctx: OrganizationOwnershipContext,
    capability: AutomationCapability,
    input: QuickAgentInput,
    settings: { callerNumberId?: string; calendarId?: string },
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
      const voice = await this.defaultVoice(input.language);
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
    ctx: OrganizationOwnershipContext,
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
    ctx: OrganizationOwnershipContext,
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

  private async environment(ctx: OrganizationOwnershipContext) {
    const [balance, numbers] = await Promise.all([
      this.credits.getBalance(ctx).catch(() => null),
      this.voiceAgents
        .listCallerNumbers(ctx)
        .catch(() => [] as VoiceAgentCallerNumber[]),
    ]);
    return { balance, numbers };
  }

  private async cards(
    ctx: OrganizationOwnershipContext,
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
    ctx: OrganizationOwnershipContext,
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
            this.organizations
              .findAdminMembersWithEmails(ctx.organizationId)
              .catch(() => []),
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
        calendar,
        callerNumber: callerNumberOf(agent, env.numbers),
      },
    };
  }

  private async activity(
    ctx: OrganizationOwnershipContext,
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

function visibleCapabilities(viewer: AutomationViewer): AutomationCapability[] {
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
