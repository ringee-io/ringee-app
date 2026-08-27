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
  CampaignService,
  CallService,
} from "@ringee/services";
import {} from "@ringee/database";

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
    private readonly campaignService: CampaignService,
    private readonly callService: CallService,
    private readonly voicemailDropService: VoicemailDropService,
    private readonly sseBridge: SSEBridgeService,
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

    // Ownership + membership gate (CMP-002) lives in the service.
    const campaign = await this.campaignService.assertDialableCampaign(
      ctx,
      body.campaignId,
      { isOrgAdmin: user.activeOrgRole === "org:admin" },
    );

    const session = await this.agentSessionService.startSession({
      campaignId: body.campaignId,
      userId: ctx.userId,
      organizationId: orgId,
    });

    // The workspace UI needs the dial mode to decide what it may offer — the
    // "close the session after this lead" control only makes sense while the
    // dialer is the one choosing when to ring. Returned here so the agent
    // screen does not have to fetch the campaign a second time.
    return { ...session, dialerMode: campaign.dialerMode };
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
      /** Agent ticked "close session after this lead" before wrapping up. */
      closeSession?: boolean;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = this.requireOrg(user);
    const ctx = createOwnershipContext(user);

    // Resolve the disposition by code from the attempt's campaign
    const attempt = await this.callAttemptService.getAttemptById(
      body.callAttemptId,
    );
    if (!attempt) throw new BadRequestException("Attempt not found");

    // Organization scope is not enough here. `closeSession` ends the attempt's
    // agent session, so without this an org member could reference another
    // agent's attempt and force them offline — and the disposition's own side
    // effects (DNC entry, callback) are attributed to `attempt.agentUserId`,
    // not to the caller.
    if (attempt.agentUserId !== ctx.userId) {
      throw new ForbiddenException(
        "You can only dispose your own call attempt",
      );
    }

    const campaign = await this.campaignService.assertCampaignInWorkspace(
      ctx,
      attempt.campaignId,
    );

    const disposition = await this.dispositionService.findByCampaignAndCode(
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
      closeSession: body.closeSession === true,
    });

    // Tell the workspace where the session went: on to the next lead, or
    // offline because the agent asked to stop after this one.
    if (attempt.agentSessionId) {
      this.sseBridge.emit(
        `agent:${attempt.agentSessionId}`,
        "session.state",
        result.sessionClosed
          ? { status: "offline", reason: "closed_after_lead" }
          : { status: "ready" },
      );
    }

    return result;
  }

  /**
   * Drop a stored greeting onto the attempt's still-live call. Once the call
   * has ended, the post-call flow sends the voicemail as its own outbound
   * drop through `POST /voicemail-assets/send` instead.
   */
  @Post("voicemail-drop")
  async voicemailDrop(
    @Body() body: { callAttemptId: string; assetId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = this.requireOrg(user);
    const ctx = createOwnershipContext(user);
    if (!body?.assetId) {
      throw new BadRequestException("assetId is required");
    }
    const attempt = await this.callAttemptService.getAttemptById(
      body.callAttemptId,
    );
    if (!attempt?.callId) {
      throw new BadRequestException("No active call for this attempt");
    }
    await this.campaignService.assertCampaignInWorkspace(
      ctx,
      attempt.campaignId,
    );
    const call = await this.callService.findById(attempt.callId);
    if (!call?.callControlId) {
      throw new BadRequestException("No active call for this attempt");
    }
    if (call.organizationId !== orgId) {
      throw new ForbiddenException("Call does not belong to your organization");
    }
    await this.voicemailDropService.dropVoicemail(
      call.callControlId,
      body.assetId,
    );
    return { status: "voicemail_drop_started" };
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
