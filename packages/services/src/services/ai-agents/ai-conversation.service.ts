import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AiAgentType,
  AiConversation,
  AiConversationRepository,
  AiMessage,
  AiMessageRepository,
  AiToolEvent,
  AiToolEventRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import type { ProspectingMode } from "./agents/prospecting-expert.agent";

@Injectable()
export class AiConversationService {
  constructor(
    private readonly conversations: AiConversationRepository,
    private readonly messages: AiMessageRepository,
    private readonly events: AiToolEventRepository,
  ) {}

  async create(
    ctx: OwnershipContext,
    input: {
      agent: AiAgentType;
      title?: string | null;
      /** Prospecting entry mode — persisted on agentState so the agent can
       *  pick the matching playbook on every turn. */
      mode?: ProspectingMode | null;
    },
  ): Promise<AiConversation> {
    return this.conversations.create({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      agent: input.agent,
      title: input.title ?? null,
      agentState: input.mode ? { mode: input.mode } : null,
    });
  }

  async list(
    ctx: OwnershipContext,
    agent?: AiAgentType,
  ): Promise<AiConversation[]> {
    return this.conversations.listForOwner({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      agent,
    });
  }

  async getByIdScoped(
    ctx: OwnershipContext,
    id: string,
  ): Promise<AiConversation> {
    const conv = await this.conversations.findById(id);
    if (!conv) throw new NotFoundException("Conversation not found");
    this.assertAccess(ctx, conv);
    return conv;
  }

  async listMessages(
    ctx: OwnershipContext,
    conversationId: string,
  ): Promise<AiMessage[]> {
    await this.getByIdScoped(ctx, conversationId);
    return this.messages.listForConversation(conversationId);
  }

  async listToolEvents(
    ctx: OwnershipContext,
    conversationId: string,
  ): Promise<AiToolEvent[]> {
    await this.getByIdScoped(ctx, conversationId);
    return this.events.listForConversation(conversationId);
  }

  assertAccess(ctx: OwnershipContext, conv: AiConversation): void {
    if (conv.organizationId) {
      if (conv.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Conversation belongs to another organization");
      }
      return;
    }
    if (conv.userId !== ctx.userId) {
      throw new ForbiddenException("Conversation belongs to another user");
    }
  }

  async rename(
    ctx: OwnershipContext,
    id: string,
    title: string,
  ): Promise<AiConversation> {
    await this.getByIdScoped(ctx, id);
    return this.conversations.updateTitle(id, title.slice(0, 200));
  }

  async archive(ctx: OwnershipContext, id: string): Promise<AiConversation> {
    await this.getByIdScoped(ctx, id);
    return this.conversations.archive(id);
  }
}
