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
  MessageEvent,
  Query,
  UnauthorizedException,
  UseGuards,
  ServiceUnavailableException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import {
  Observable,
  defer,
  filter,
  from,
  merge,
  interval,
  map,
  switchMap,
  takeUntil,
  Subscription,
} from "rxjs";
import { isUUID } from "class-validator";
import { SseRateLimitGuard } from "../guards/sse-rate-limit.guard";
import {
  CurrentUser,
  createOwnershipContext,
  OwnershipContext,
  Public,
  signSseTicket,
  verifySseTicket,
} from "@ringee/platform";
import {
  AgentSessionService,
  DialerOrchestrationService,
  CallAttemptService,
  DispositionService,
  VoicemailDropService,
  SSEBridgeService,
  CampaignService,
  CallService,
  OrganizationService,
} from "@ringee/services";

/** How often an open event stream re-checks its reader still owns the session. */
const STREAM_ACCESS_RECHECK_MS = 60_000;
import type { AgentSession } from "@ringee/database";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

@Controller("dialer")
export class DialerController {
  private readonly logger = new Logger(DialerController.name);
  constructor(
    private readonly agentSessionService: AgentSessionService,
    private readonly dialerOrchestration: DialerOrchestrationService,
    private readonly callAttemptService: CallAttemptService,
    private readonly dispositionService: DispositionService,
    private readonly campaignService: CampaignService,
    private readonly callService: CallService,
    private readonly voicemailDropService: VoicemailDropService,
    private readonly sseBridge: SSEBridgeService,
    private readonly organizations: OrganizationService,
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
    @Body() body: { campaignId: string; waitForEvents?: boolean },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (
      body.waitForEvents !== undefined &&
      typeof body.waitForEvents !== "boolean"
    )
      throw new BadRequestException("waitForEvents must be a boolean");
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
      waitForEvents: body.waitForEvents === true,
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
    @Query("startedAt") startedAt: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
      user.id,
    );
    return this.agentSessionService.endSession(
      sessionId,
      this.sessionVersion(startedAt),
    );
  }

  @Patch("sessions/:sessionId/pause")
  async pause(
    @Param("sessionId") sessionId: string,
    @Query("startedAt") startedAt: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
      user.id,
    );
    return this.agentSessionService.pause(
      sessionId,
      this.sessionVersion(startedAt),
    );
  }

  @Patch("sessions/:sessionId/resume")
  async resume(
    @Param("sessionId") sessionId: string,
    @Query("startedAt") startedAt: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const session = await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
      user.id,
    );
    await this.campaignService.assertDialableCampaign(
      createOwnershipContext(user),
      session.campaignId,
      { isOrgAdmin: user.activeOrgRole === "org:admin" },
    );
    return this.agentSessionService.resume(
      sessionId,
      this.sessionVersion(startedAt),
    );
  }

  @Post("sessions/:sessionId/heartbeat")
  async heartbeat(
    @Param("sessionId") sessionId: string,
    @Body() body: { startedAt?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
      user.id,
    );
    return this.agentSessionService.heartbeat(
      sessionId,
      this.sessionVersion(body?.startedAt),
    );
  }

  @Post("dial")
  async manualDial(
    @Body() body: { sessionId: string; campaignId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.dialerOrchestration.manualDial(
      createOwnershipContext(user),
      body.sessionId,
      body.campaignId,
    );
  }

  /**
   * The browser could not place the call it was told to (no phone line, no
   * microphone, the leg failed before the provider acknowledged it). Hands the
   * assignment back and pauses the session.
   */
  @Post("abandon")
  async abandonDial(
    @Body()
    body: {
      sessionId: string;
      attemptId: string;
      reason?: string;
      /** Signed pre-dial token of an external carrier dial, if it was one. */
      callToken?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    this.requireOrg(user);
    if (!body?.sessionId || !body?.attemptId) {
      throw new BadRequestException("sessionId and attemptId are required");
    }
    return this.dialerOrchestration.abandonDial(
      createOwnershipContext(user),
      body.sessionId,
      body.attemptId,
      typeof body.reason === "string" ? body.reason : undefined,
      typeof body.callToken === "string" ? body.callToken : undefined,
    );
  }

  @Post("skip")
  async skipLead(
    @Body() body: { sessionId: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.agentSessionService.getByIdForOrg(
      body.sessionId,
      this.requireOrg(user),
      user.id,
    );
    return this.dialerOrchestration.skipLead(body.sessionId);
  }

  @Post("dispose")
  async submitDisposition(
    @Body()
    body: {
      callAttemptId: string;
      /** The disposition picked. Preferred over the code when both are sent. */
      dispositionId?: string;
      /** How every client named it before workspace dispositions. */
      dispositionCode?: string;
      note?: string;
      callbackScheduledAt?: string;
      callbackNote?: string;
      callbackTimezone?: string;
      followUpPurpose?: "booking" | "information";
      stopRequested?: boolean;
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

    // Resolved within what this campaign may record (DISP-004): its set, or
    // an active disposition of its own or its workspace's. An id from another
    // campaign or workspace, or an inactive one, reads as missing.
    if (!body.dispositionId && !body.dispositionCode) {
      throw new BadRequestException(
        "dispositionId or dispositionCode is required",
      );
    }
    if (body.dispositionId && !isUUID(body.dispositionId)) {
      throw new BadRequestException("dispositionId must be a UUID");
    }
    const disposition = await this.dispositionService.resolveForCampaign(
      attempt.campaignId,
      body.dispositionId
        ? { id: body.dispositionId }
        : { code: body.dispositionCode! },
    );
    if (!disposition) throw new BadRequestException("Disposition not found");

    const result = await this.callAttemptService.submitDisposition({
      callAttemptId: body.callAttemptId,
      disposition,
      note: body.note,
      callback:
        disposition.triggersCallback && body.callbackScheduledAt
          ? {
              scheduledAt: new Date(body.callbackScheduledAt),
              note: body.callbackNote,
              timezone: body.callbackTimezone,
            }
          : undefined,
      campaignDefaults: {
        maxAttempts: campaign.maxAttempts,
        retryDelayMin: campaign.retryDelayMin,
      },
      organizationId: orgId,
      closeSession: body.closeSession === true,
      followUpPurpose: body.followUpPurpose,
      stopRequested: body.stopRequested,
    });

    // Where the session went — on to the next lead, or offline because the
    // agent asked to stop after this one — is pushed over SSE by the service,
    // the moment it moves. Emitted from here, after the rest of the request,
    // it could land behind the next lead the poller had already assigned and
    // wipe that lead off the agent's screen mid-dial.
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
      user.id,
    );
  }

  /**
   * The ticket the session's event stream is opened with: EventSource cannot
   * send an Authorization header, so the agent's authenticated client asks for
   * it first, for a session that must be their own.
   */
  @Post("sessions/:sessionId/events-ticket")
  async eventsTicket(
    @Param("sessionId") sessionId: string,
    @Body() body: { startedAt?: string },
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ ticket: string }> {
    const session = await this.agentSessionService.getByIdForOrg(
      sessionId,
      this.requireOrg(user),
      user.id,
    );
    const version = this.sessionVersion(body?.startedAt);
    if (version && version.getTime() !== session.startedAt.getTime()) {
      throw new UnauthorizedException("This dialer session has been replaced.");
    }
    return {
      ticket: signSseTicket(
        this.streamPurpose(sessionId, session.startedAt),
        createOwnershipContext(user),
      ),
    };
  }

  /**
   * SSE endpoint for real-time dialer events: the leads assigned to this agent
   * session and the dial instructions for them.
   * Subscribes to the SSEBridgeService channel for this agent session.
   * Public only because EventSource cannot send Authorization headers; the
   * `ticket` from `events-ticket` is what admits the agent, and the stream
   * ends once the session is no longer theirs.
   */
  @Public()
  @Sse("sessions/:sessionId/events")
  @UseGuards(SseRateLimitGuard)
  events(
    @Param("sessionId") sessionId: string,
    @Query("ticket") ticket: string | undefined,
    @Query("startedAt") startedAt: string | undefined,
  ): Observable<MessageEvent> {
    const requestedVersion = this.sessionVersion(startedAt);
    let version: Date | undefined;
    const ctx = verifySseTicket(ticket, (subject) => {
      const prefix = `${this.streamPurpose(sessionId)}:`;
      if (!subject.startsWith(prefix)) return false;
      const signedVersion = new Date(subject.slice(prefix.length));
      if (
        !Number.isFinite(signedVersion.getTime()) ||
        (requestedVersion &&
          requestedVersion.getTime() !== signedVersion.getTime())
      )
        return false;
      version = signedVersion;
      return true;
    });
    if (!ctx || !version)
      throw new UnauthorizedException("Invalid stream ticket");
    return defer(() => from(this.ownsSession(ctx, sessionId, version))).pipe(
      switchMap((session) => {
        if (!session) throw new UnauthorizedException("Invalid stream ticket");
        const attachedVersion = session.startedAt;
        const revoked = interval(STREAM_ACCESS_RECHECK_MS).pipe(
          switchMap(() =>
            from(this.ownsSession(ctx, sessionId, attachedVersion)),
          ),
          filter((stillAllowed) => !stillAllowed),
        );
        return this.sessionEvents(
          sessionId,
          attachedVersion,
          version,
          requestedVersion === undefined,
        ).pipe(takeUntil(revoked));
      }),
    );
  }

  /** Whether the session is still `ctx`'s own, in an organization they belong to. */
  private async ownsSession(
    ctx: OwnershipContext,
    sessionId: string,
    startedAt?: Date,
  ): Promise<AgentSession | null> {
    if (!ctx.organizationId) return null;
    try {
      if (!(await this.organizations.isMember(ctx.userId, ctx.organizationId)))
        return null;
      const session = await this.agentSessionService.getByIdForOrg(
        sessionId,
        ctx.organizationId,
        ctx.userId,
      );
      return !startedAt || session.startedAt.getTime() === startedAt.getTime()
        ? session
        : null;
    } catch {
      return null;
    }
  }

  private sessionVersion(value?: string): Date | undefined {
    if (value === undefined) return undefined;
    const date = typeof value === "string" ? new Date(value) : new Date(NaN);
    if (!Number.isFinite(date.getTime()))
      throw new BadRequestException("Invalid session startedAt");
    return date;
  }

  private streamPurpose(sessionId: string, version?: Date): string {
    return `dialer:${sessionId}${version ? `:${version.toISOString()}` : ""}`;
  }

  private sessionEvents(
    sessionId: string,
    version: Date,
    activationVersion?: Date,
    allowLegacyFallback = false,
  ): Observable<MessageEvent> {
    const replaced = new UnauthorizedException(
      "This dialer session has been replaced.",
    );
    const relayUnavailable = new ServiceUnavailableException(
      "The dialer event relay is unavailable.",
    );
    // Merge real events from SSEBridge with a keepalive heartbeat every 15s
    const realEvents = new Observable<MessageEvent>((subscriber) => {
      let buffering = true;
      const buffered: MessageEvent[] = [];
      let subscription: Subscription | undefined;
      void (async () => {
        const ownership = await this.agentSessionService.claimEventStreamSetup(
          sessionId,
          version,
          allowLegacyFallback || activationVersion === undefined,
        );
        try {
          if (subscriber.closed) return;
          // Keep setup exclusive even after unsubscribe, until any in-flight
          // readiness write and its disconnected-stream cleanup have finished.
          // Subscribe before activating: the relay never replays a dial.
          subscription = this.sseBridge
            .subscribe(`agent:${sessionId}`)
            .subscribe({
              next: (event) => {
                if (event.type === "heartbeat") {
                  subscriber.next(event);
                  return;
                }
                const data =
                  typeof event.data === "string"
                    ? JSON.parse(event.data)
                    : event.data;
                if (
                  !data.sessionStartedAt ||
                  new Date(data.sessionStartedAt).getTime() !==
                    version.getTime()
                )
                  return;
                if (buffering) buffered.push(event);
                else subscriber.next(event);
              },
              error: (error: unknown) => subscriber.error(error),
              complete: () => subscriber.complete(),
            });
          let session = await this.agentSessionService.getById(sessionId);
          if (subscriber.closed) return;
          if (session.startedAt.getTime() !== version.getTime()) {
            throw replaced;
          }
          let awaiting =
            session.status === "offline" && session.endedAt === null;
          if (awaiting) {
            if (activationVersion?.getTime() !== version.getTime())
              throw replaced;
            if (!(await this.sseBridge.isRelayReady())) throw relayUnavailable;
            if (subscriber.closed) return;
            session = await this.agentSessionService.getById(sessionId);
            if (session.startedAt.getTime() !== version.getTime())
              throw replaced;
            if (subscriber.closed) return;
            awaiting = session.status === "offline" && session.endedAt === null;
          }
          if (awaiting) {
            const activated =
              await this.agentSessionService.activateAfterEvents(
                sessionId,
                session.startedAt,
                () => !subscriber.closed,
                ownership.renew,
                ownership.isSuperseded,
              );
            if (subscriber.closed) return;
            if (!activated) throw relayUnavailable;
            session = activated;
          }
          subscriber.next({
            type: "session.connected",
            data: JSON.stringify({
              status: session.status,
              sessionStartedAt: session.startedAt.toISOString(),
              currentLeadId: session.currentLeadId,
              assignmentVersion: session.reservedAt?.toISOString(),
              // Live events cannot overtake this snapshot during setup.
              snapshotStale: false,
              stats: {
                callsAttempted: session.callsAttempted,
                callsConnected: session.callsConnected,
                totalTalkSec: session.totalTalkSec,
              },
            }),
          });
          for (const event of buffered) subscriber.next(event);
          buffered.length = 0;
          buffering = false;
        } finally {
          await ownership.release().catch((error: unknown) => {
            this.logger.warn({
              event: "dialer.stream_setup_release_failed",
              errorType: error instanceof Error ? error.name : "unknown",
            });
          });
        }
      })().catch((error: unknown) => {
        if (
          error === replaced ||
          (error instanceof ConflictException &&
            error.message === replaced.message)
        ) {
          subscriber.error(replaced);
          return;
        }
        if (
          error === relayUnavailable ||
          (error instanceof ServiceUnavailableException &&
            error.message === relayUnavailable.message)
        ) {
          subscriber.error(relayUnavailable);
          return;
        }
        this.logger.error({
          event: "dialer.stream_setup_failed",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        subscriber.error(
          new ServiceUnavailableException(
            "The dialer event stream could not be opened.",
          ),
        );
      });
      return () => subscription?.unsubscribe();
    });
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
