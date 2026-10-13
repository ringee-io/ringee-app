import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CompleteMeetingEmailDto,
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  ReceptionistAutomationSetupDto,
  ReminderAutomationSetupDto,
  ReminderScopeQueryDto,
  SchedulingAutomationSetupDto,
  SetAutomationEnabledDto,
  StartSchedulingCallDto,
  createOwnershipContext,
} from "@ringee/platform";
import {
  AUTOMATION_CAPABILITIES,
  VoiceAgentAutomationService,
  type AutomationCapability,
} from "@ringee/services";
import { VoiceAgentOrganizationGuard } from "../guards/voice-agent-organization.guard";

/**
 * The "Ringee IA Voice Agents" rail (AGENT-018).
 *
 * Thin by design, like the agents controller beside it. Its own path rather
 * than `ai-voice-agents/automations`, because `ai-voice-agents/:id` would
 * swallow that segment. Configuring an automation is an admin's job, enforced
 * here with `@OrgAdminOnly()`; reading the rail and acting on a contact or a
 * meeting the member can already see is open to members. The service checks
 * the pilot flag on every call.
 */
@UseGuards(VoiceAgentOrganizationGuard)
@Controller("ai-voice-agent-automations")
export class AiVoiceAgentAutomationController {
  constructor(private readonly automations: VoiceAgentAutomationService) {}

  // ── Reads ────────────────────────────────────────────────────

  /** The closed rail: the counter and whether anything needs attention. */
  @Get("summary")
  summary(@CurrentUser() user: CurrentUserData) {
    return this.automations.summary(createOwnershipContext(user));
  }

  @Get()
  async panel(@CurrentUser() user: CurrentUserData) {
    const panel = await this.automations.panel(createOwnershipContext(user));
    // UX only: the setup routes below enforce the same rule.
    return { ...panel, canConfigure: isAdmin(user) };
  }

  @OrgAdminOnly()
  @Get("reminders/scope")
  reminderScope(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ReminderScopeQueryDto,
  ) {
    const calendarIds = query.calendarIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (
      calendarIds.length === 0 ||
      calendarIds.length > 20 ||
      calendarIds.some((id) => !UUID.test(id))
    ) {
      throw new BadRequestException("Choose one of your calendars.");
    }
    return this.automations.previewReminders(createOwnershipContext(user), {
      calendarIds,
      offsetMinutes: query.offsetMinutes,
    });
  }

  @Get("reminders/upcoming")
  upcomingReminderCalls(@CurrentUser() user: CurrentUserData) {
    return this.automations.upcomingReminderCalls(createOwnershipContext(user));
  }

  // ── Setup (admins) ───────────────────────────────────────────

  @OrgAdminOnly()
  @Post("reminders/setup")
  setupReminders(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReminderAutomationSetupDto,
  ) {
    return this.automations.setupReminders(createOwnershipContext(user), dto);
  }

  @OrgAdminOnly()
  @Post("receptionist/setup")
  setupReceptionist(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReceptionistAutomationSetupDto,
  ) {
    return this.automations.setupReceptionist(createOwnershipContext(user), {
      ...dto,
      fallback: dto.fallback ?? null,
    });
  }

  @OrgAdminOnly()
  @Post("scheduling/setup")
  setupScheduling(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SchedulingAutomationSetupDto,
  ) {
    return this.automations.setupScheduling(createOwnershipContext(user), dto);
  }

  @OrgAdminOnly()
  @Post(":capability/enabled")
  setEnabled(
    @CurrentUser() user: CurrentUserData,
    @Param("capability") capability: string,
    @Body() dto: SetAutomationEnabledDto,
  ) {
    if (!AUTOMATION_CAPABILITIES.includes(capability as AutomationCapability)) {
      throw new BadRequestException("Unknown automation.");
    }
    return this.automations.setEnabled(
      createOwnershipContext(user),
      capability as AutomationCapability,
      dto.enabled,
    );
  }

  // ── Actions (members, on what they can see) ──────────────────

  /** "Confirm now": a reminder call about one meeting, placed immediately. */
  @Post("meetings/:meetingId/confirmation-call")
  confirmationCall(
    @CurrentUser() user: CurrentUserData,
    @Param("meetingId", ParseUUIDPipe) meetingId: string,
  ) {
    return this.automations.callMeetingNow(
      createOwnershipContext(user),
      meetingId,
    );
  }

  /** "Call to schedule": what spends, not switching scheduling on. */
  @Post("scheduling/calls")
  startSchedulingCall(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StartSchedulingCallDto,
  ) {
    return this.automations.startSchedulingCall(
      createOwnershipContext(user),
      dto,
    );
  }

  /** "Complete email" on a confirmation waiting for the lead's address. */
  @Post("emails/:deliveryId/lead-email")
  completeEmail(
    @CurrentUser() user: CurrentUserData,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Body() dto: CompleteMeetingEmailDto,
  ) {
    return this.automations.completeEmail(
      createOwnershipContext(user),
      deliveryId,
      dto.email,
    );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAdmin(user: CurrentUserData): boolean {
  return !user.activeOrgId || user.activeOrgRole === "org:admin";
}
