import {
  Controller,
  Post,
  Delete,
  Patch,
  Get,
  Body,
  Param,
  Sse,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { Observable, Subject, interval, map, takeUntil } from "rxjs";
import {
  CurrentUser,
  createOwnershipContext,
} from "@ringee/platform";
import {
  AgentSessionService,
  DialerOrchestrationService,
  CallAttemptService,
  DispositionService,
  VoicemailDropService,
  CampaignConfigService,
} from "@ringee/services";
import { CampaignRepository } from "@ringee/database";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

@Controller("dialer")
export class DialerController {
  constructor(
    private readonly agentSessionService: AgentSessionService,
    private readonly dialerOrchestration: DialerOrchestrationService,
    private readonly callAttemptService: CallAttemptService,
    private readonly dispositionService: DispositionService,
    private readonly voicemailDropService: VoicemailDropService,
    private readonly campaignRepo: CampaignRepository
  ) {}

  @Post("sessions")
  async startSession(
    @Body() body: { campaignId: string },
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    const ctx = createOwnershipContext(user);
    return this.agentSessionService.startSession({
      campaignId: body.campaignId,
      userId: ctx.userId,
      organizationId: ctx.organizationId!,
    });
  }

  @Delete("sessions/:sessionId")
  async endSession(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: CurrentUserData
  ) {
    return this.agentSessionService.endSession(sessionId);
  }

  @Patch("sessions/:sessionId/pause")
  async pause(@Param("sessionId") sessionId: string) {
    return this.agentSessionService.pause(sessionId);
  }

  @Patch("sessions/:sessionId/resume")
  async resume(@Param("sessionId") sessionId: string) {
    return this.agentSessionService.resume(sessionId);
  }

  @Post("sessions/:sessionId/heartbeat")
  async heartbeat(@Param("sessionId") sessionId: string) {
    return this.agentSessionService.heartbeat(sessionId);
  }

  @Post("dial")
  async manualDial(
    @Body() body: { sessionId: string; campaignId: string }
  ) {
    return this.dialerOrchestration.manualDial(
      body.sessionId,
      body.campaignId
    );
  }

  @Post("skip")
  async skipLead(@Body() body: { sessionId: string }) {
    return this.dialerOrchestration.skipLead(body.sessionId);
  }

  @Post("dispose")
  async submitDisposition(
    @Body()
    body: {
      callAttemptId: string;
      dispositionId: string;
      note?: string;
      scheduleCallback?: { scheduledAt: string; note?: string };
    },
    @CurrentUser() user: CurrentUserData
  ) {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }

    // Resolve campaign defaults from the attempt
    const attempt = await (
      this.callAttemptService as any
    ).attemptRepo.findById(body.callAttemptId);
    if (!attempt) throw new BadRequestException("Attempt not found");

    const campaign = await this.campaignRepo.findById(attempt.campaignId);
    if (!campaign) throw new BadRequestException("Campaign not found");

    return this.callAttemptService.submitDisposition({
      callAttemptId: body.callAttemptId,
      dispositionId: body.dispositionId,
      note: body.note,
      callback: body.scheduleCallback
        ? {
            scheduledAt: new Date(body.scheduleCallback.scheduledAt),
            note: body.scheduleCallback.note,
          }
        : undefined,
      campaignDefaults: {
        maxAttempts: campaign.maxAttempts,
        retryDelayMin: campaign.retryDelayMin,
      },
      organizationId: user.activeOrgId!,
    });
  }

  @Post("voicemail-drop")
  async voicemailDrop(
    @Body() body: { callControlId: string; assetId: string }
  ) {
    return this.voicemailDropService.dropVoicemail(
      body.callControlId,
      body.assetId
    );
  }

  @Get("sessions/:sessionId/state")
  async getSessionState(@Param("sessionId") sessionId: string) {
    return this.agentSessionService.getById(sessionId);
  }

  /**
   * SSE endpoint for real-time dialer events.
   * The frontend connects here to receive lead assignments, call state, etc.
   */
  @Sse("sessions/:sessionId/events")
  events(@Param("sessionId") sessionId: string): Observable<MessageEvent> {
    // For MVP, return a heartbeat stream.
    // Full Redis pub/sub → SSE bridge will be implemented with the SSEBridgeService.
    return interval(10000).pipe(
      map(
        () =>
          ({
            data: JSON.stringify({
              type: "heartbeat",
              timestamp: new Date().toISOString(),
            }),
          }) as MessageEvent
      )
    );
  }
}
