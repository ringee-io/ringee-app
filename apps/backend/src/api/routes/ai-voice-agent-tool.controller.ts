import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { Public } from "@ringee/platform";
import {
  VOICE_AGENT_CALL_ID_HEADER,
  VOICE_AGENT_TOOL_SECRET_HEADER,
  VoiceAgentToolService,
} from "@ringee/services";

/**
 * The tools an AI voice agent calls mid-conversation.
 *
 * Public because the voice provider calls them, not a browser — so each route
 * carries its own proof: the agent's shared secret, which the provider holds as
 * a secret reference and Ringee stores only as a hash. The call's identity
 * comes from a header the provider fills from a system variable, never from the
 * model's own arguments.
 */
@Controller("ai-voice-agents/tools")
export class AiVoiceAgentToolController {
  constructor(private readonly tools: VoiceAgentToolService) {}

  @Public()
  @Post(":agentId/directory")
  directory(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { query?: string },
  ) {
    return this.tools.searchDirectory(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  @Public()
  @Post(":agentId/transfer")
  transfer(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { destination_type?: string; destination_id?: string },
  ) {
    return this.tools.transferToDestination(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  @Public()
  @Post(":agentId/available-slots")
  getAvailableSlots(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { date?: string },
  ) {
    return this.tools.getAvailableSlots(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  @Public()
  @Post(":agentId/book-appointment")
  bookAppointment(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body()
    body: { start?: string; attendee_email?: string; notes?: string },
  ) {
    return this.tools.bookAppointment(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  @Public()
  @Post(":agentId/request-human-support")
  requestHumanSupport(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { subject?: string; message?: string },
  ) {
    return this.tools.requestHumanSupport(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  /**
   * The lead's explicit answer about attending (AGENT-017). The meeting is
   * derived from the call the header names, never from the body.
   */
  @Public()
  @Post(":agentId/confirm-attendance")
  confirmAttendance(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { attendance?: string; email?: string; note?: string },
  ) {
    return this.tools.confirmMeetingAttendance(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  @Public()
  @Post(":agentId/schedule-callback")
  scheduleCallback(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { scheduled_at?: string; note?: string },
  ) {
    return this.tools.scheduleCallback(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  /**
   * The reminders agent asks to hand the call to the scheduling agent
   * (AGENT-021). The meeting, the destination and the request's context are
   * derived from the call the header names; the body carries only what the
   * person said.
   */
  @Public()
  @Post(":agentId/prepare-reschedule-handoff")
  prepareRescheduleHandoff(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body()
    body: {
      person_said?: string;
      preferences?: string;
      identity_confirmed?: boolean | string;
      language?: string;
    },
  ) {
    return this.tools.prepareRescheduleHandoff(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  /** A callback by the scheduling agent when the handoff did not happen. */
  @Public()
  @Post(":agentId/schedule-reschedule-callback")
  scheduleRescheduleCallback(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body()
    body: {
      scheduled_at?: string;
      note?: string;
      why?: string;
      person_said?: string;
      preferences?: string;
    },
  ) {
    return this.tools.scheduleRescheduleCallback(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  /**
   * What the scheduling agent continues on a handed-over call or a callback
   * about one. Its first authenticated tool call on a handed-over call is
   * what proves the handoff completed.
   */
  @Public()
  @Post(":agentId/handoff-context")
  handoffContext(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
  ) {
    return this.tools.getHandoffContext(agentId, secret, callControlId ?? null);
  }

  /**
   * The scheduling agent moves the meeting it was handed. The meeting, its
   * version and its calendar are derived from the request the header's call
   * carries; the body is only the time the person agreed.
   */
  @Public()
  @Post(":agentId/move-meeting")
  moveMeeting(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body() body: { start?: string; time_confirmed?: boolean },
  ) {
    return this.tools.moveMeeting(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }

  /** Agent secret plus provider-bound live participation authorizes this decision. */
  @Public()
  @Post(":agentId/finish-meeting-response")
  finishMeetingResponse(
    @Param("agentId") agentId: string,
    @Headers(VOICE_AGENT_TOOL_SECRET_HEADER) secret: string,
    @Headers(VOICE_AGENT_CALL_ID_HEADER) callControlId: string,
    @Body()
    body: { cancellation?: string; rescheduling?: string; response?: string },
  ) {
    return this.tools.finishMeetingResponse(
      agentId,
      secret,
      callControlId ?? null,
      body ?? {},
    );
  }
}
