import {
  Controller,
  Post,
  Delete,
  Patch,
  Get,
  Body,
  Param,
  Req,
  Sse,
  ForbiddenException,
  BadRequestException,
  MessageEvent,
} from "@nestjs/common";
import { Observable, merge, interval, map } from "rxjs";
import { Request } from "express";
import { CurrentUser, createOwnershipContext, Public } from "@ringee/platform";
import {
  AgentSessionService,
  DialerOrchestrationService,
  CallAttemptService,
  DispositionService,
  VoicemailDropService,
  SSEBridgeService,
} from "@ringee/services";
import {
  CampaignRepository,
  DispositionRepository,
  CampaignMemberRepository,
} from "@ringee/database";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

@Controller("dialer")
export class DialerController {
  constructor(
    private readonly agentSessionService: AgentSessionService,
    private readonly dialerOrchestration: DialerOrchestrationService,
    private readonly callAttemptService: CallAttemptService,
    private readonly dispositionService: DispositionService,
    private readonly voicemailDropService: VoicemailDropService,
    private readonly campaignRepo: CampaignRepository,
    private readonly dispositionRepo: DispositionRepository,
    private readonly sseBridge: SSEBridgeService,
    private readonly campaignMemberRepo: CampaignMemberRepository,
  ) {}

  /**
   * Assert the campaign exists and belongs to the caller's organization.
   * Returns the organization id for convenience.
   */
  private requireOrg(user: CurrentUserData): string {
    if (!user.activeOrgId) {
      throw new ForbiddenException("Organization required");
    }
    return user.activeOrgId;
  }

  @Post("sessions")
  async startSession(
    @Body() body: { campaignId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = this.requireOrg(user);
    const ctx = createOwnershipContext(user);

    // Ensure the campaign exists and belongs to the caller's org before
    // creating a session against it.
    const campaign = await this.campaignRepo.findById(body.campaignId);
    if (!campaign || campaign.organizationId !== orgId) {
      throw new ForbiddenException("Campaign not found in your organization");
    }

    // Non-admins must be assigned to the campaign to dial it.
    const isAdmin = user.activeOrgRole === "org:admin";
    if (!isAdmin) {
      const isMember = await this.campaignMemberRepo.isMember(
        body.campaignId,
        ctx.userId,
      );
      if (!isMember) {
        throw new ForbiddenException("You are not assigned to this campaign");
      }
    }

    return this.agentSessionService.startSession({
      campaignId: body.campaignId,
      userId: ctx.userId,
      organizationId: orgId,
    });
  }

  @Delete("sessions/:sessionId")
  async endSession(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
    );
    return this.agentSessionService.endSession(sessionId);
  }

  @Patch("sessions/:sessionId/pause")
  async pause(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
    );
    return this.agentSessionService.pause(sessionId);
  }

  @Patch("sessions/:sessionId/resume")
  async resume(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
    );
    return this.agentSessionService.resume(sessionId);
  }

  @Post("sessions/:sessionId/heartbeat")
  async heartbeat(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
    );
    return this.agentSessionService.heartbeat(sessionId);
  }

  @Post("dial")
  async manualDial(
    @Body() body: { sessionId: string; campaignId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      body.sessionId,
      this.requireOrg(user),
    );
    return this.dialerOrchestration.manualDial(body.sessionId, body.campaignId);
  }

  @Post("skip")
  async skipLead(
    @Body() body: { sessionId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      body.sessionId,
      this.requireOrg(user),
    );
    return this.dialerOrchestration.skipLead(body.sessionId);
  }

  @Post("dispose")
  async submitDisposition(
    @Body()
    body: {
      callAttemptId: string;
      dispositionCode: string;
      note?: string;
      callbackScheduledAt?: string;
      callbackNote?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = this.requireOrg(user);

    // Resolve the disposition by code from the attempt's campaign
    const attempt = await this.callAttemptService.getAttemptById(
      body.callAttemptId,
    );
    if (!attempt) throw new BadRequestException("Attempt not found");

    const campaign = await this.campaignRepo.findById(attempt.campaignId);
    if (!campaign) throw new BadRequestException("Campaign not found");
    if (campaign.organizationId !== orgId) {
      throw new ForbiddenException(
        "Attempt does not belong to your organization",
      );
    }

    const disposition = await this.dispositionRepo.findByCampaignAndCode(
      attempt.campaignId,
      body.dispositionCode,
    );
    if (!disposition) throw new BadRequestException("Disposition not found");

    const result = await this.callAttemptService.submitDisposition({
      callAttemptId: body.callAttemptId,
      dispositionId: disposition.id,
      note: body.note,
      callback:
        disposition.triggersCallback && body.callbackScheduledAt
          ? {
              scheduledAt: new Date(body.callbackScheduledAt),
              note: body.callbackNote,
            }
          : undefined,
      campaignDefaults: {
        maxAttempts: campaign.maxAttempts,
        retryDelayMin: campaign.retryDelayMin,
      },
      organizationId: orgId,
    });

    // Emit session.state ready event so frontend moves to next lead
    if (attempt.agentSessionId) {
      this.sseBridge.emit(`agent:${attempt.agentSessionId}`, "session.state", {
        status: "ready",
      });
    }

    return result;
  }

  @Post("voicemail-drop")
  async voicemailDrop(
    @Body() body: { callAttemptId: string; assetId?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = this.requireOrg(user);
    // For MVP, voicemail drop needs a callControlId. Get it from the attempt.
    const attempt = await this.callAttemptService.getAttemptById(
      body.callAttemptId,
    );
    if (!attempt?.callId) {
      throw new BadRequestException("No active call for this attempt");
    }
    const campaign = await this.campaignRepo.findById(attempt.campaignId);
    if (!campaign || campaign.organizationId !== orgId) {
      throw new ForbiddenException(
        "Attempt does not belong to your organization",
      );
    }
    // TODO: resolve callControlId from Call and trigger playbackStart
    return { status: "voicemail_drop_requested" };
  }

  @Get("sessions/:sessionId/state")
  async getSessionState(
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
    );
  }

  /**
   * SSE endpoint for real-time dialer events.
   * Subscribes to the SSEBridgeService channel for this agent session.
   * Marked public because EventSource cannot send Authorization headers.
   * Session ID acts as an unguessable token (UUID).
   */
  @Public()
  @Sse("sessions/:sessionId/events")
  events(@Param("sessionId") sessionId: string): Observable<MessageEvent> {
    // Merge real events from SSEBridge with a keepalive heartbeat every 15s
    const realEvents = this.sseBridge.subscribe(
      `agent:${sessionId}`,
    ) as Observable<MessageEvent>;
    const heartbeat = interval(15000).pipe(
      map(
        (): MessageEvent => ({
          data: JSON.stringify({
            type: "heartbeat",
            timestamp: new Date().toISOString(),
          }),
          type: "heartbeat",
        }),
      ),
    );

    return merge(realEvents, heartbeat);
  }
}
