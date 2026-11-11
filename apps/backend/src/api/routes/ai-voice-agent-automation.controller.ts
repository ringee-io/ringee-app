import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  AdoptFollowUpDto,
  CompleteMeetingEmailDto,
  CurrentUser,
  CurrentUserData,
  FollowUpReviewQueryDto,
  OrgAdminOnly,
  ReceptionistAutomationSetupDto,
  ReminderAutomationSetupDto,
  ReminderScopeQueryDto,
  SaveFollowUpConfigurationDto,
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
import { VoiceAgentAccessGuard } from "../guards/voice-agent-access.guard";

/**
 * The "Ringee IA Voice Agents" rail (AGENT-018).
 *
 * Thin by design, like the agents controller beside it. Its own path rather
 * than `ai-voice-agents/automations`, because `ai-voice-agents/:id` would
 * swallow that segment. Configuring an automation, deleting its trigger and
 * placing or listing reminder calls are an admin's, enforced here with
 * `@OrgAdminOnly()`. A member gets appointment scheduling: the rail shows them
 * that card, and "Call to schedule" is theirs. The service checks the pilot
 * flag on every call.
 */
@UseGuards(VoiceAgentAccessGuard)
@Controller("ai-voice-agent-automations")
export class AiVoiceAgentAutomationController {
  constructor(private readonly automations: VoiceAgentAutomationService) {}

  // ── Reads ────────────────────────────────────────────────────

  /** The closed rail: the counter and whether anything needs attention. */
  @Get("summary")
  summary(@CurrentUser() user: CurrentUserData) {
    return this.automations.summary(createOwnershipContext(user), {
      admin: isAdmin(user),
    });
  }

  @Get()
  async panel(@CurrentUser() user: CurrentUserData) {
    const admin = isAdmin(user);
    const panel = await this.automations.panel(createOwnershipContext(user), {
      admin,
    });
    // UX only: the setup routes below enforce the same rule.
    return { ...panel, canConfigure: admin };
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

  @OrgAdminOnly()
  @Get("reminders/upcoming")
  upcomingReminderCalls(@CurrentUser() user: CurrentUserData) {
    return this.automations.upcomingReminderCalls(createOwnershipContext(user));
  }

  // ── Shared follow-up review (Stage 4C) ───────────────────────

  /**
   * The activation review — the same screen for a freelancer and an
   * organization. Read-only; a member gets it without configuration actions.
   */
  @Get("follow-up")
  followUpReview(
    @CurrentUser() user: CurrentUserData,
    @Query() query: FollowUpReviewQueryDto,
  ) {
    return this.automations.followUpReview(
      createOwnershipContext(user),
      { admin: isAdmin(user) },
      { meetingId: query.meetingId ?? null, timeZoneHint: query.timeZone },
    );
  }

  /** Saves the review as a draft: configuration saved, nothing authorized. */
  @OrgAdminOnly()
  @Put("follow-up/configuration")
  saveFollowUpConfiguration(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SaveFollowUpConfigurationDto,
  ) {
    return this.automations.saveFollowUpConfiguration(
      createOwnershipContext(user),
      { admin: isAdmin(user) },
      {
        draft: dto.draft,
        expectedRevision: dto.expectedRevision ?? null,
        entrySource: dto.entrySource,
        timeZoneHint: dto.timeZone,
        meetingId: dto.meetingId ?? null,
      },
    );
  }

  /** "Activate automatic follow-up": the explicit adoption. */
  @OrgAdminOnly()
  @Post("follow-up/adoption")
  adoptFollowUp(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AdoptFollowUpDto,
  ) {
    return this.automations.adoptFollowUp(
      createOwnershipContext(user),
      { admin: isAdmin(user) },
      {
        requestKey: dto.requestKey,
        expectedRevision: dto.expectedRevision ?? null,
        draft: dto.draft,
        entrySource: dto.entrySource,
        timeZoneHint: dto.timeZone,
        language: dto.language,
        meetingVersion: dto.meetingVersion ?? null,
      },
    );
  }

  /** Whether a meeting's confirmation call is planned, or why not. */
  @Get("follow-up/meetings/:meetingId/coverage")
  followUpMeetingCoverage(
    @CurrentUser() user: CurrentUserData,
    @Param("meetingId", ParseUUIDPipe) meetingId: string,
  ) {
    return this.automations.followUpMeetingCoverage(
      createOwnershipContext(user),
      { admin: isAdmin(user) },
      meetingId,
    );
  }

  /** The newest verified AI results, for the first-value summary. */
  @Get("follow-up/results")
  followUpResults(@CurrentUser() user: CurrentUserData) {
    return this.automations.followUpResults(createOwnershipContext(user), {
      admin: isAdmin(user),
    });
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

  /** "Delete trigger": the card is not set up any more; its agent stays. */
  @OrgAdminOnly()
  @Delete(":capability")
  removeAutomation(
    @CurrentUser() user: CurrentUserData,
    @Param("capability") capability: string,
  ) {
    if (!AUTOMATION_CAPABILITIES.includes(capability as AutomationCapability)) {
      throw new BadRequestException("Unknown automation.");
    }
    return this.automations.removeAutomation(
      createOwnershipContext(user),
      capability as AutomationCapability,
    );
  }

  // ── Actions ──────────────────────────────────────────────────

  /** "Confirm now": a reminder call about one meeting, placed immediately. */
  @OrgAdminOnly()
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

  /** "Call to schedule": what spends, not switching scheduling on. Members too. */
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
