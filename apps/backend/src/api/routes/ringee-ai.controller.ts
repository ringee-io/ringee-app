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
  UseGuards,
} from "@nestjs/common";
import { Observable, interval, map, merge } from "rxjs";
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
import { SSEBridgeService } from "@ringee/services";
import {
  createOwnershipContext,
  CurrentUser,
  CurrentUserData,
  Public,
} from "@ringee/platform";

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
   * SSE stream for a single conversation. Carries: text deltas, tool
   * start/complete, prospect-result cards, confirmation requests and
   * resolutions, errors, completion. Bound by the auth guard so other
   * users cannot subscribe to a conversation they do not own.
   */
  @Public()
  @Sse("conversations/:id/stream")
  stream(@Param("id") id: string): Observable<SseMessageEvent> {
    // EventSource cannot send Authorization headers, so this endpoint is
    // public. The conversation id is a UUID and acts as an unguessable
    // access token — same security model as the dialer SSE channel.
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
