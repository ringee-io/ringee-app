import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  Observable,
  defer,
  filter,
  from,
  interval,
  map,
  merge,
  switchMap,
  takeUntil,
} from "rxjs";
import {
  AiAgentType,
  AiConversation,
  AiMessage,
  AiToolEvent,
} from "@ringee/database";
import {
  AgentRegistry,
  AiChatOrchestrator,
  AiConfirmationService,
  AiConversationService,
  isProspectingMode,
  ProspectingMode,
} from "@ringee/services";
import { OrganizationService, SSEBridgeService } from "@ringee/services";
import {
  createOwnershipContext,
  CurrentUser,
  CurrentUserData,
  OwnershipContext,
  Public,
  signSseTicket,
  verifySseTicket,
} from "@ringee/platform";

/** How often an open stream re-checks that its reader still has access. */
const STREAM_ACCESS_RECHECK_MS = 60_000;

interface SseMessageEvent {
  data: string;
  type?: string;
  id?: string;
  retry?: number;
}

@Controller("ai")
export class RingeeAiController {
  constructor(
    private readonly conversations: AiConversationService,
    private readonly orchestrator: AiChatOrchestrator,
    private readonly confirmation: AiConfirmationService,
    private readonly agents: AgentRegistry,
    private readonly sse: SSEBridgeService,
    private readonly organizations: OrganizationService,
  ) {}

  @Get("agents")
  listAgents() {
    return this.agents.listDescriptors();
  }

  @Get("conversations")
  async listConversations(
    @CurrentUser() user: CurrentUserData,
    @Query("agent") agent?: string,
  ): Promise<AiConversation[]> {
    const ctx = createOwnershipContext(user);
    return this.conversations.list(ctx, agent as AiAgentType | undefined);
  }

  @Post("conversations")
  async createConversation(
    @CurrentUser() user: CurrentUserData,
    @Body()
    body: {
      agent: AiAgentType;
      title?: string | null;
      mode?: string | null;
    },
  ): Promise<AiConversation> {
    if (!body?.agent) throw new BadRequestException("agent is required");
    if (!this.agents.isActive(body.agent)) {
      throw new BadRequestException(
        `Agent ${body.agent} is not enabled in this build.`,
      );
    }
    let mode: ProspectingMode | null = null;
    if (body.mode != null && body.mode !== "") {
      if (!isProspectingMode(body.mode)) {
        throw new BadRequestException(
          `Invalid prospecting mode "${body.mode}".`,
        );
      }
      mode = body.mode;
    }
    const ctx = createOwnershipContext(user);
    return this.conversations.create(ctx, {
      agent: body.agent,
      title: body.title ?? null,
      mode,
    });
  }

  @Get("conversations/:id")
  async getConversation(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AiConversation> {
    const ctx = createOwnershipContext(user);
    return this.conversations.getByIdScoped(ctx, id);
  }

  @Get("conversations/:id/messages")
  async listMessages(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ messages: AiMessage[]; toolEvents: AiToolEvent[] }> {
    const ctx = createOwnershipContext(user);
    const [messages, toolEvents] = await Promise.all([
      this.conversations.listMessages(ctx, id),
      this.conversations.listToolEvents(ctx, id),
    ]);
    return { messages, toolEvents };
  }

  @Post("conversations/:id/messages")
  @HttpCode(202)
  async postMessage(
    @Param("id") id: string,
    @Body() body: { text: string },
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ accepted: true }> {
    if (!body?.text?.trim()) throw new BadRequestException("text is required");
    const ctx = createOwnershipContext(user);
    await this.orchestrator.sendMessage(ctx, {
      conversationId: id,
      text: body.text,
    });
    return { accepted: true };
  }

  /**
   * The ticket the conversation's stream is opened with. EventSource cannot
   * send an Authorization header, so the authenticated client asks for this
   * first, after the same access check every other conversation read makes.
   */
  @Post("conversations/:id/stream-ticket")
  async streamTicket(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ ticket: string }> {
    const ctx = createOwnershipContext(user);
    await this.conversations.getByIdScoped(ctx, id);
    return { ticket: signSseTicket(`ai:${id}`, ctx) };
  }

  /**
   * SSE stream for a single conversation. Carries: text deltas, tool
   * start/complete, prospect-result cards, confirmation requests and
   * resolutions, errors, completion.
   *
   * Public only because EventSource cannot authenticate with a header: the
   * `ticket` from `stream-ticket` is what admits the reader, and the stream
   * ends as soon as they lose access to the conversation.
   */
  @Public()
  @Sse("conversations/:id/stream")
  stream(
    @Param("id") id: string,
    @Query("ticket") ticket: string | undefined,
  ): Observable<SseMessageEvent> {
    const ctx = verifySseTicket(ticket, `ai:${id}`);
    if (!ctx) throw new UnauthorizedException("Invalid stream ticket");
    return defer(() => from(this.canRead(ctx, id))).pipe(
      switchMap((allowed) => {
        if (!allowed) throw new UnauthorizedException("Invalid stream ticket");
        const revoked = interval(STREAM_ACCESS_RECHECK_MS).pipe(
          switchMap(() => from(this.canRead(ctx, id))),
          filter((stillAllowed) => !stillAllowed),
        );
        return this.conversationEvents(id).pipe(takeUntil(revoked));
      }),
    );
  }

  /** Whether `ctx` may still read the conversation, membership included. */
  private async canRead(ctx: OwnershipContext, id: string): Promise<boolean> {
    try {
      if (
        ctx.organizationId &&
        !(await this.organizations.isMember(ctx.userId, ctx.organizationId))
      ) {
        return false;
      }
      await this.conversations.getByIdScoped(ctx, id);
      return true;
    } catch {
      return false;
    }
  }

  private conversationEvents(id: string): Observable<SseMessageEvent> {
    const channel = this.orchestrator.channel(id);
    const realEvents = this.sse.subscribe(
      channel,
    ) as Observable<SseMessageEvent>;
    const heartbeat = interval(15000).pipe(
      map(
        (): SseMessageEvent => ({
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

  @Post("conversations/:id/confirm/:confirmationId")
  async confirm(
    @Param("id") id: string,
    @Param("confirmationId") confirmationId: string,
    @Body() body: { accepted: boolean; overrides?: Record<string, unknown> },
    @CurrentUser() user: CurrentUserData,
  ): Promise<Record<string, unknown>> {
    const ctx = createOwnershipContext(user);
    if (body?.accepted === false) {
      await this.confirmation.decline(ctx, id, confirmationId);
      return { ok: true, accepted: false };
    }
    const result = await this.confirmation.accept(
      ctx,
      id,
      confirmationId,
      body?.overrides ?? {},
    );
    return { ok: true, accepted: true, result };
  }

  @Post("conversations/:id/rename")
  async rename(
    @Param("id") id: string,
    @Body() body: { title: string },
    @CurrentUser() user: CurrentUserData,
  ): Promise<AiConversation> {
    if (!body?.title?.trim())
      throw new BadRequestException("title is required");
    const ctx = createOwnershipContext(user);
    return this.conversations.rename(ctx, id, body.title);
  }

  @Post("conversations/:id/archive")
  async archive(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AiConversation> {
    const ctx = createOwnershipContext(user);
    return this.conversations.archive(ctx, id);
  }
}
