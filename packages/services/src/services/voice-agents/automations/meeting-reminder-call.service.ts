import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentCallStatus,
  AiVoiceAgentRepository,
  AiVoiceAgentStatus,
  AiVoiceAgentType,
  AiVoiceAgentAutomationRepository,
  CalendarRepository,
  CallRepository,
  Contact,
  Meeting,
  MeetingReminderExecution,
  MeetingReminderExecutionRepository,
  MeetingReminderExecutionStatus,
  MeetingReminderPolicyRepository,
  MeetingRepository,
  MeetingStatus,
  UserRepository,
} from "@ringee/database";
import {
  normalizePhoneE164,
  REMINDER_OFFSET_MIN_MINUTES,
  isInWorkspace,
  isSameWorkspace,
  workspaceOf,
  type OwnershipContext,
} from "@ringee/platform";
import {
  CallingWindow,
  DEFAULT_CALLING_WINDOW,
  isWithinCallingWindow,
  readCallingWindow,
} from "../../reminders/reminder-call-schedule";
import { inLanguage, type LocalizedPhrase } from "../blueprints/language";
import {
  VoiceAgentCallService,
  VoiceAgentCallStartError,
  VoiceAgentCallStartOutcome,
  type StartVoiceAgentCallResult,
} from "../voice-agent-call.service";
import {
  assertVoiceAgentAutomations,
  automationAdmissionFilter,
  voiceAgentAutomationsEnabled,
} from "./automation-access";
import { VoiceAgentConversationContextService } from "./conversation-context.service";
import { personName } from "./person-name";
import { executionStatusFor } from "./reminder-execution-status";

const S = MeetingReminderExecutionStatus;

/** How long a worker owns a claimed execution before another may take it. */
const LEASE_MS = 5 * 60_000;
const CLAIM_BATCH = 20;
/** Dial tries inside one execution, only for failures before placement. */
const MAX_DIAL_TRIES = 3;
/** A reminder never rings this close to the meeting. */
const MIN_LEAD_MS = REMINDER_OFFSET_MIN_MINUTES * 60_000;
/** A 240-minute policy's calls (close bookings, its retry) keep 20 minutes. */
const FOUR_HOUR_POLICY_MIN_LEAD_MS = 20 * 60_000;
/** How long a reminder waits when the lead is already on a call with us. */
const OVERLAP_DEFER_MS = 10 * 60_000;
/** A claim or placement younger than this may still be a live call. */
const ACTIVE_WINDOW_MS = 2 * 60 * 60_000;
/** A placed call that never reported back is settled after this. */
const SETTLE_PLACED_AFTER_MS = 3 * 60 * 60_000;

/**
 * What the greeting says the call is about. Deliberately generic: the meeting
 * itself is only discussed once the agent knows it is talking to the lead.
 */
const UPCOMING_MEETING: LocalizedPhrase = {
  en: "your upcoming meeting",
  es: "su próxima reunión",
  pt: "a sua próxima reunião",
  fr: "votre prochain rendez-vous",
  de: "Ihren bevorstehenden Termin",
  it: "il suo prossimo appuntamento",
};

const LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
};

export interface ReminderCallNowResult {
  executionId: string;
  status: MeetingReminderExecutionStatus;
  agentCallId: string | null;
  reason: string | null;
}

/**
 * Places the reminder calls the reminder policies plan (AGENT-019).
 *
 * Every execution is claimed atomically, re-validated against the meeting
 * right before the dial — still on, same version, still unanswered, inside the
 * calling window, nobody already on the phone with the lead — and dialed
 * through `VoiceAgentCallService.startCall` under a key persisted before the
 * leg exists. A worker that crashed after dialing, or could not record the
 * call it placed, is recovered by that key: the call is reconciled, never
 * placed twice.
 */
@Injectable()
export class MeetingReminderCallService {
  private readonly logger = new Logger(MeetingReminderCallService.name);

  constructor(
    private readonly executions: MeetingReminderExecutionRepository,
    private readonly policies: MeetingReminderPolicyRepository,
    private readonly meetings: MeetingRepository,
    private readonly calendars: CalendarRepository,
    private readonly agents: AiVoiceAgentRepository,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly automations: AiVoiceAgentAutomationRepository,
    private readonly users: UserRepository,
    private readonly calls: VoiceAgentCallService,
    private readonly context: VoiceAgentConversationContextService,
    private readonly humanCalls: CallRepository,
  ) {}

  private now(): Date {
    return new Date();
  }

  /** Worker entry point, on the reminder schedule's tick. */
  async processDue(now = new Date()): Promise<number> {
    await this.settleStalePlacements(now);
    await this.planUnansweredRetry(now);
    const claimAt = this.now();
    const claimed = await this.executions.claimDue(
      claimAt,
      new Date(claimAt.getTime() + LEASE_MS),
      CLAIM_BATCH,
    );
    let placed = 0;
    for (const execution of claimed) {
      try {
        if ((await this.run(execution, this.now())) === S.placed) placed++;
      } catch (error) {
        // Left claimed on purpose: the lease runs out and the next tick
        // reconciles by the dial key before it would ever dial again.
        this.logger.error(
          `Reminder call ${execution.id} failed unexpectedly: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return placed;
  }

  /**
   * "Confirm now": a reminder call for one meeting, placed immediately through
   * the same execution path the policies use. A second request while one is
   * running, or for the same attempt, is refused rather than dialed; one
   * while an earlier request is still open places that one instead.
   */
  async callNow(
    ctx: OwnershipContext,
    meetingId: string,
  ): Promise<ReminderCallNowResult> {
    assertVoiceAgentAutomations(ctx);
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || !isInWorkspace(ctx, meeting)) {
      throw new NotFoundException("Meeting not found");
    }
    if (!isActive(meeting)) {
      throw new BadRequestException("This meeting is not scheduled any more.");
    }
    if (meeting.attendanceStatus !== "pending") {
      throw new ConflictException(
        "The lead already answered for this meeting.",
      );
    }
    const agentId = await this.reminderAgentFor(ctx, meeting);
    if (!agentId) {
      throw new BadRequestException(
        "Set up Reminders & confirmations before calling a lead about a meeting.",
      );
    }
    const now = this.now();
    if (
      await this.executions.hasActiveForMeeting(
        meeting.id,
        null,
        new Date(now.getTime() - ACTIVE_WINDOW_MS),
      )
    ) {
      throw new ConflictException(
        "A confirmation call for this meeting is already in progress.",
      );
    }

    // One open manual call per meeting version. One a busy lead put off is
    // placed now rather than beside a second — each would ring on its own
    // later. One claimed or placed refuses another however long ago it
    // started, until it reports back.
    let execution = await this.executions.findOpenForMeetingVersion(
      meeting.id,
      meeting.scheduleVersion,
      "manual",
    );
    if (execution && execution.status !== S.scheduled) {
      throw new ConflictException(
        "A confirmation call for this meeting is already in progress.",
      );
    }
    if (!execution) {
      const attempt =
        (await this.executions.countForMeetingVersion(
          meeting.id,
          meeting.scheduleVersion,
          "manual",
        )) + 1;
      const idempotencyKey = [
        "meeting",
        meeting.id,
        `v${meeting.scheduleVersion}`,
        "manual",
        `a${attempt}`,
      ].join(":");
      const created = await this.executions.createMany([
        {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          meetingId: meeting.id,
          agentId,
          trigger: "manual",
          scheduleVersion: meeting.scheduleVersion,
          attempt,
          idempotencyKey,
          fireAt: now,
        },
      ]);
      execution = created
        ? await this.executions.findByIdempotencyKey(idempotencyKey)
        : null;
    }
    const claimed = execution
      ? await this.executions.claimScheduled(
          execution.id,
          new Date(now.getTime() + LEASE_MS),
        )
      : null;
    if (!claimed) {
      throw new ConflictException(
        "A confirmation call for this meeting was just requested.",
      );
    }

    const outcome = await this.run(claimed, now);
    const finished =
      (await this.executions.findById(claimed.id).catch(() => null)) ?? claimed;
    // Placed, but the link was not saved (see linkPlacedCall): the row reads
    // claimed until a worker restores it. It is still the call that was made.
    const unlinked = outcome === S.placed && finished.status === S.claimed;
    return {
      executionId: finished.id,
      status: unlinked ? S.placed : finished.status,
      agentCallId: finished.agentCallId,
      reason: unlinked ? null : (finished.reason ?? finished.lastError ?? null),
    };
  }

  /**
   * The conversation ended: close the execution that placed it with what
   * happened. An answer the attendance tool recorded has already closed it;
   * this only settles calls that ended without one.
   */
  async recordCallEnded(agentCall: AiVoiceAgentCall): Promise<void> {
    const status = executionStatusFor(agentCall);
    if (!status) return;
    await this.executions.finishByAgentCall(agentCall.id, status, [S.placed]);
  }

  // ── The one execution path ─────────────────────────────────────────

  private async run(
    execution: MeetingReminderExecution,
    now: Date,
  ): Promise<MeetingReminderExecutionStatus> {
    const claimToken = execution.claimToken;
    if (!claimToken) return S.cancelled;
    const end = async (
      status: MeetingReminderExecutionStatus,
      reason: string,
      lastError?: string,
      agentCallId?: string,
    ) => {
      await this.executions.finish(
        execution.id,
        status,
        [S.claimed],
        {
          reason,
          lastError,
          agentCallId,
        },
        claimToken,
      );
      return status;
    };

    // Reclaimed after a worker died: if its last try may have placed a leg,
    // that call is the one — it is linked, never dialed a second time.
    if (execution.dialTries > 0) {
      const earlier = await this.agentCalls.findByIdempotencyKey(
        dialKey(execution, execution.dialTries),
      );
      if (earlier && !provablyUnplaced(earlier)) {
        if (
          await this.executions.markPlaced(execution.id, earlier.id, claimToken)
        ) {
          this.logger.log(
            `Reminder call ${execution.id} linked to agent call ${earlier.id} by its dial key, not dialed again`,
          );
        }
        await this.recordCallEnded(earlier);
        return S.placed;
      }
    }

    // The execution's own, persisted workspace: never the owner's active one.
    if (!voiceAgentAutomationsEnabled(execution)) {
      return end(S.skipped, "automations_disabled");
    }
    const ctx: OwnershipContext = workspaceOf(execution);

    const meeting = await this.meetings.findById(execution.meetingId);
    if (!meeting || !isSameWorkspace(meeting, execution)) {
      return end(S.cancelled, "meeting_missing");
    }
    if (!isActive(meeting)) return end(S.cancelled, "meeting_cancelled");
    if (meeting.scheduleVersion !== execution.scheduleVersion) {
      return end(S.cancelled, "meeting_changed");
    }
    if (meeting.attendanceStatus !== "pending") {
      return end(S.skipped, "already_answered");
    }
    const minLead = minLeadMs(execution);
    if (meeting.scheduledAt.getTime() - now.getTime() < minLead) {
      return end(S.skipped, "too_late");
    }

    const calendar = meeting.calendarId
      ? await this.calendars.findByIdForOwner(ctx, meeting.calendarId)
      : await this.calendars.findDefault(ctx);
    const timeZone = calendar?.timezone ?? "UTC";
    let window: CallingWindow = DEFAULT_CALLING_WINDOW;
    if (execution.trigger === "policy") {
      const policy = execution.policyId
        ? await this.policies.findById(execution.policyId)
        : null;
      if (
        !policy ||
        !policy.enabled ||
        policy.version !== execution.policyVersion
      ) {
        return end(S.cancelled, "policy_changed");
      }
      window = readCallingWindow(policy);
    } else if (calendar) {
      const policy = await this.policies.findForCalendar(ctx, calendar.id);
      if (policy) window = readCallingWindow(policy);
    }
    // The window is checked again here, not only when the call was planned:
    // a tick that comes late after downtime never rings at night.
    if (!isWithinCallingWindow(now, window, timeZone)) {
      return end(S.skipped, "outside_window");
    }

    const agent = await this.agents.findByIdForOwner(ctx, execution.agentId);
    if (
      !agent ||
      agent.type !== AiVoiceAgentType.reminders_notifications ||
      agent.status !== AiVoiceAgentStatus.active
    ) {
      return end(S.skipped, "agent_unavailable");
    }

    const contact = (meeting as Meeting & { contact?: Contact | null }).contact;
    if (!contact?.phoneNumber) return end(S.skipped, "no_phone");
    const phoneNumber = normalizePhoneE164(contact.phoneNumber);
    if (!phoneNumber) return end(S.skipped, "no_phone");
    const name = personName(contact);
    if (!name.first) return end(S.skipped, "contact_without_name");

    const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_MS);
    if (
      (await this.executions.hasActiveForMeeting(
        meeting.id,
        execution.id,
        activeSince,
      )) ||
      (await this.agentCalls.hasLiveCallToNumber(
        ctx,
        phoneNumber,
        activeSince,
      )) ||
      (await this.humanCalls.hasActiveWithNumber(ctx, phoneNumber))
    ) {
      const later = new Date(now.getTime() + OVERLAP_DEFER_MS);
      if (
        meeting.scheduledAt.getTime() - later.getTime() >= minLead &&
        isWithinCallingWindow(later, window, timeZone)
      ) {
        await this.executions.defer(
          execution.id,
          later,
          "lead_on_a_call",
          claimToken,
        );
        return S.scheduled;
      }
      return end(S.skipped, "lead_on_a_call");
    }

    const variables = await this.variables(ctx, meeting, contact, {
      language: agent.voiceLanguage ?? "en",
      timeZone,
      name,
    });

    const reservationTime = this.now();
    const dialing = await this.executions.beginDial(
      execution.id,
      claimToken,
      reservationTime,
      new Date(reservationTime.getTime() + LEASE_MS),
    );
    if (!dialing) return S.cancelled;

    let started: StartVoiceAgentCallResult;
    try {
      started = await this.calls.startCall(
        { userId: execution.userId, organizationId: execution.organizationId },
        agent.id,
        {
          to: phoneNumber,
          variables,
          metadata: {},
          idempotencyKey: dialKey(dialing, dialing.dialTries),
        },
        async ({ agentCallId, callId }) => {
          const reject = async (
            reason: string,
            status: MeetingReminderExecutionStatus = S.cancelled,
          ): Promise<never> => {
            await end(status, reason);
            throw new BadRequestException(reason);
          };
          if (!voiceAgentAutomationsEnabled(execution)) {
            await reject("automations_disabled", S.skipped);
          }
          const current = await this.meetings.findById(execution.meetingId);
          if (
            !current ||
            !isInWorkspace(ctx, current) ||
            !isActive(current) ||
            current.scheduleVersion !== execution.scheduleVersion
          ) {
            await reject("meeting_changed");
          }
          if (current!.attendanceStatus !== "pending")
            await reject("already_answered", S.skipped);
          const currentCalendar = current!.calendarId
            ? await this.calendars.findByIdForOwner(ctx, current!.calendarId)
            : await this.calendars.findDefault(ctx);
          const currentPolicy =
            execution.trigger === "policy"
              ? execution.policyId
                ? await this.policies.findById(execution.policyId)
                : null
              : currentCalendar
                ? await this.policies.findForCalendar(ctx, currentCalendar.id)
                : null;
          if (
            execution.trigger === "policy" &&
            (!currentPolicy?.enabled ||
              currentPolicy.version !== execution.policyVersion)
          ) {
            await reject("policy_changed");
          }
          const currentAgent = await this.agents.findByIdForOwner(
            ctx,
            execution.agentId,
          );
          if (currentAgent?.status !== AiVoiceAgentStatus.active)
            await reject("agent_unavailable", S.skipped);
          if (
            (await this.humanCalls.hasActiveWithNumber(
              ctx,
              phoneNumber,
              callId,
            )) ||
            (await this.agentCalls.hasLiveCallToNumber(
              ctx,
              phoneNumber,
              new Date(this.now().getTime() - ACTIVE_WINDOW_MS),
              agentCallId,
            ))
          ) {
            await reject("lead_on_a_call", S.skipped);
          }
          const atDial = this.now();
          if (current!.scheduledAt.getTime() - atDial.getTime() < minLead)
            await reject("too_late", S.skipped);
          if (
            !isWithinCallingWindow(
              atDial,
              currentPolicy
                ? readCallingWindow(currentPolicy)
                : DEFAULT_CALLING_WINDOW,
              currentCalendar?.timezone ?? "UTC",
            )
          ) {
            await reject("outside_window", S.skipped);
          }
          if (
            !(await this.executions.authorizeDial(
              dialing,
              atDial,
              new Date(atDial.getTime() + minLead),
              new Date(atDial.getTime() + LEASE_MS),
            ))
          ) {
            await reject("claim_or_meeting_changed");
          }
        },
      );
    } catch (error) {
      const outcome =
        error instanceof VoiceAgentCallStartError
          ? error.outcome
          : VoiceAgentCallStartOutcome.terminal_rejection;
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = this.now();

      if (
        outcome === VoiceAgentCallStartOutcome.placed_pending_reconciliation
      ) {
        // A leg may exist. Link it when the row is known; otherwise the call
        // is recorded as unconfirmed — never dialed again blindly.
        const agentCallId =
          error instanceof VoiceAgentCallStartError ? error.agentCallId : null;
        if (agentCallId) {
          await this.linkPlacedCall(execution, agentCallId, claimToken);
          return S.placed;
        }
        return end(S.failed, "placement_unconfirmed", message);
      }

      if (
        outcome === VoiceAgentCallStartOutcome.retryable_before_placement &&
        dialing.dialTries < MAX_DIAL_TRIES
      ) {
        const retryAt = new Date(
          failedAt.getTime() + 2 ** dialing.dialTries * 60_000,
        );
        if (
          meeting.scheduledAt.getTime() - retryAt.getTime() >= minLead &&
          isWithinCallingWindow(retryAt, window, timeZone)
        ) {
          await this.executions.defer(
            execution.id,
            retryAt,
            "retry_before_placement",
            claimToken,
            true,
          );
          return S.scheduled;
        }
      }

      // The try's own call row is the evidence: failed with no provider leg,
      // it tells the contact's daily cap that nothing was placed.
      const tried =
        error instanceof VoiceAgentCallStartError
          ? (error.agentCallId ?? undefined)
          : undefined;
      return outcome === VoiceAgentCallStartOutcome.terminal_rejection
        ? end(S.skipped, "rejected", message, tried)
        : end(S.failed, "not_placed", message, tried);
    }

    // Outside the dial's own error handling on purpose: the leg exists, so a
    // failure to write that down must not read as a rejected or unplaced dial.
    await this.linkPlacedCall(execution, started.id, claimToken);
    return S.placed;
  }

  /**
   * Links an execution to the call it placed. Only reached once a leg exists
   * or may exist, so a failed write is neither a rejection nor a reason to
   * dial again: the row stays claimed under the dial key the agent call
   * carries, and the worker that reclaims it when the lease runs out links
   * that call (the top of `run`). Until then the call's attendance and
   * handoff tools find no meeting for it.
   */
  private async linkPlacedCall(
    execution: MeetingReminderExecution,
    agentCallId: string,
    claimToken: string,
  ): Promise<void> {
    try {
      if (
        await this.executions.markPlaced(execution.id, agentCallId, claimToken)
      ) {
        return;
      }
      // The lease ran out mid-dial and another worker holds the claim: it
      // finds this same call under the dial key and links it.
      this.logger.warn(
        `Reminder call ${execution.id} lost its claim after placing agent call ${agentCallId}; the worker holding it links the call`,
      );
    } catch (error) {
      this.logger.error(
        `Reminder call ${execution.id} placed agent call ${agentCallId} but could not record it; left claimed for the next worker to link by its dial key, never redialed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async planUnansweredRetry(now: Date): Promise<void> {
    let afterId: string | undefined;
    do {
      const rows = await this.executions.listUnansweredForRetry(
        now,
        afterId,
        automationAdmissionFilter(),
      );
      afterId = rows.length === 100 ? rows[rows.length - 1].id : undefined;
      const retries: Parameters<
        MeetingReminderExecutionRepository["createMany"]
      >[0] = [];
      for (const prior of rows) {
        if (
          !voiceAgentAutomationsEnabled(prior) ||
          !prior.policy ||
          prior.policyVersion !== prior.policy.version ||
          prior.scheduleVersion !== prior.meeting.scheduleVersion
        )
          continue;
        // An hour after the first call, by what it left behind: its dispatch
        // commit, its call row, its end. A row with none of them gets no
        // retry — never one timed from its plan, which can precede the dial.
        const happened = [
          prior.dispatchCommittedAt,
          prior.agentCall?.createdAt,
          prior.agentCall?.call?.endedAt,
        ].filter((at): at is Date => at instanceof Date);
        if (!happened.length) continue;
        const fireAt = new Date(
          Math.max(
            now.getTime(),
            ...happened.map((at) => at.getTime() + 60 * 60_000),
          ),
        );
        // The meeting's calendar, or the workspace's default one for a meeting
        // without its own — the zone the first call was planned in.
        const calendar = prior.meeting.calendarId
          ? prior.meeting.calendar
          : await this.calendars.findDefault(workspaceOf(prior));
        if (
          prior.meeting.scheduledAt.getTime() - fireAt.getTime() <
            20 * 60_000 ||
          !isWithinCallingWindow(
            fireAt,
            readCallingWindow(prior.policy),
            calendar?.timezone ?? "UTC",
          )
        )
          continue;
        retries.push({
          userId: prior.userId,
          organizationId: prior.organizationId,
          meetingId: prior.meetingId,
          policyId: prior.policyId,
          agentId: prior.agentId,
          trigger: "policy",
          scheduleVersion: prior.scheduleVersion,
          policyVersion: prior.policyVersion,
          offsetMinutes: prior.offsetMinutes,
          attempt: 2,
          fireAt,
          idempotencyKey: `retry:${prior.id}:a2`,
        });
      }
      // One insert per page; a retry already planned is skipped by its key.
      if (retries.length) await this.executions.createMany(retries);
    } while (afterId);
  }

  /** Placed calls that never reported back are settled from their own row. */
  private async settleStalePlacements(now: Date): Promise<void> {
    const stale = await this.executions.listPlacedBefore(
      new Date(now.getTime() - SETTLE_PLACED_AFTER_MS),
    );
    for (const execution of stale) {
      const agentCall = execution.agentCallId
        ? await this.agentCalls.findById(execution.agentCallId)
        : null;
      const status = agentCall
        ? (executionStatusFor(agentCall) ?? S.completed)
        : S.completed;
      await this.executions.finish(execution.id, status, [S.placed], {
        reason: agentCall ? undefined : "result_unknown",
      });
    }
  }

  /**
   * Which reminders agent calls about a meeting: its calendar's policy, else
   * the workspace's reminders quick action.
   */
  private async reminderAgentFor(
    ctx: OwnershipContext,
    meeting: Meeting,
  ): Promise<string | null> {
    const calendar = meeting.calendarId
      ? await this.calendars.findByIdForOwner(ctx, meeting.calendarId)
      : await this.calendars.findDefault(ctx);
    const policy = calendar
      ? await this.policies.findForCalendar(ctx, calendar.id)
      : null;
    if (policy) return policy.agentId;
    const automation = await this.automations.findForOwner(
      ctx,
      AiVoiceAgentType.reminders_notifications,
    );
    return automation?.agentId ?? null;
  }

  /**
   * The reminders blueprint's variables for a meeting call. The greeting
   * names only "your upcoming meeting"; the details sit in the context the
   * agent shares once it knows it is talking to the lead.
   */
  private async variables(
    ctx: OwnershipContext,
    meeting: Meeting & { contact?: Contact | null },
    contact: Contact,
    options: {
      language: string;
      timeZone: string;
      name: { first: string; last: string };
    },
  ): Promise<Record<string, string>> {
    const { language, timeZone } = options;
    const locale = LOCALES[language.split("-")[0]!] ?? "en-US";
    const date = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(meeting.scheduledAt);
    const time = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "long",
    }).format(meeting.scheduledAt);

    const responsibleId = meeting.responsibleUserId ?? meeting.userId;
    const responsible = await this.users
      .findById(responsibleId)
      .catch(() => null);
    const responsibleName =
      [responsible?.firstName, responsible?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
    const email = meeting.leadEmail ?? contact.email ?? null;
    const history = await this.context.previousInteractions(ctx, {
      contactId: meeting.contactId,
      sourceCallId: meeting.callId,
    });
    const location = meeting.location?.trim();

    const context = [
      `This call is about a scheduled meeting${
        meeting.title ? ` ("${meeting.title}")` : ""
      }${responsibleName ? ` with ${responsibleName}` : ""}, on ${date} at ${time}.`,
      location
        ? /^https?:\/\//i.test(location)
          ? "It takes place online; the link is in their invitation. Never read a link aloud."
          : `Where: ${location}.`
        : null,
      `Email on file for the confirmation: ${email ?? "none"}.`,
      "Ask whether they will attend, and record the answer with confirm_meeting_attendance.",
      history || null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      first_name: options.name.first,
      last_name: options.name.last,
      notification: inLanguage(UPCOMING_MEETING, language),
      appointment_date: date,
      appointment_time: time,
      additional_context: context,
    };
  }
}

/** How close to the meeting this execution may still ring. */
function minLeadMs(execution: MeetingReminderExecution): number {
  return execution.offsetMinutes === 240
    ? FOUR_HOUR_POLICY_MIN_LEAD_MS
    : MIN_LEAD_MS;
}

/** One key per dial try: `<execution key>:d<try>`. */
function dialKey(execution: MeetingReminderExecution, tryNumber: number) {
  return `${execution.idempotencyKey}:d${tryNumber}`;
}

/** Only a try that failed before the provider accepted it may be followed. */
function provablyUnplaced(agentCall: AiVoiceAgentCall): boolean {
  return (
    agentCall.status === AiVoiceAgentCallStatus.failed &&
    !agentCall.providerCallControlId
  );
}

function isActive(meeting: Meeting): boolean {
  return (
    meeting.status === MeetingStatus.scheduled ||
    meeting.status === MeetingStatus.rescheduled
  );
}
