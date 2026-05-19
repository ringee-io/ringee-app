import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  AiMessageRepository,
  AiToolEventRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { LeadSearchService } from "../enrichment/lead-search.service";
import { AiConversationService } from "./ai-conversation.service";
import { AiChatOrchestrator } from "./ai-chat.orchestrator";
import { TagService } from "../tag.service";

/**
 * Resolves user confirmations for gated actions: reveal contact data,
 * save prospects to Ringee, create a list. The orchestrator never runs
 * these directly — the user must confirm in the UI, which routes here.
 */
@Injectable()
export class AiConfirmationService {
  private readonly logger = new Logger(AiConfirmationService.name);

  constructor(
    private readonly conversations: AiConversationService,
    private readonly toolEvents: AiToolEventRepository,
    private readonly messages: AiMessageRepository,
    private readonly orchestrator: AiChatOrchestrator,
    private readonly leadSearch: LeadSearchService,
    private readonly tags: TagService,
  ) {}

  async accept(
    ctx: OwnershipContext,
    conversationId: string,
    confirmationId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const event = await this.toolEvents.findById(confirmationId);
    if (!event || event.conversationId !== conversationId) {
      throw new BadRequestException("Confirmation not found");
    }
    if (event.resolved) {
      return { status: "already_resolved" };
    }
    const conversation = await this.conversations.getByIdScoped(ctx, conversationId);
    if (!conversation) throw new BadRequestException("Conversation not found");

    const payload = unwrapConfirmationPayload(
      event.payload as Record<string, unknown>,
    );
    const action = String(payload.action ?? "");

    let result: Record<string, unknown> = {};
    switch (action) {
      case "reveal":
        result = await this.executeReveal(ctx, payload, overrides);
        break;
      case "save":
        result = await this.executeSave(ctx, payload, overrides);
        break;
      case "list_create":
        result = await this.executeCreateList(ctx, payload, overrides);
        break;
      default:
        throw new BadRequestException(`Unknown confirmation action: ${action}`);
    }

    await this.toolEvents.resolve(confirmationId, { accepted: true, ...result });
    // Inject the result back as a tool-style message so the agent can keep
    // going on its own loop on the next user turn.
    await this.messages.create({
      conversationId,
      role: "tool",
      toolName: `${action}_confirmed`,
      content: null,
      toolPayload: result,
    });
    this.orchestrator.emitConfirmationResolved(
      conversationId,
      confirmationId,
      true,
      result,
    );

    return result;
  }

  async decline(
    ctx: OwnershipContext,
    conversationId: string,
    confirmationId: string,
  ): Promise<void> {
    const event = await this.toolEvents.findById(confirmationId);
    if (!event || event.conversationId !== conversationId) {
      throw new BadRequestException("Confirmation not found");
    }
    if (event.resolved) return;
    await this.conversations.getByIdScoped(ctx, conversationId);

    await this.toolEvents.resolve(confirmationId, { accepted: false });
    await this.messages.create({
      conversationId,
      role: "user",
      content: "[user declined the requested action]",
    });
    this.orchestrator.emitConfirmationResolved(conversationId, confirmationId, false);
  }

  private async executeReveal(
    ctx: OwnershipContext,
    payload: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const jobId = String(payload.jobId ?? "");
    const externalIdsInput =
      (overrides.externalIds as string[] | undefined) ??
      (payload.externalIds as string[]);
    const revealPhone =
      (overrides.revealPhone as boolean | undefined) ??
      (payload.revealPhone as boolean | undefined) ??
      false;
    if (!jobId || !Array.isArray(externalIdsInput) || externalIdsInput.length === 0) {
      throw new BadRequestException("jobId + externalIds are required to reveal");
    }

    const revealed: Array<{
      externalId: string;
      contactId: string | null;
      emailRevealed: boolean;
      phoneRevealed: boolean;
    }> = [];
    for (const externalId of externalIdsInput) {
      try {
        const r = await this.leadSearch.revealCandidate(ctx, jobId, externalId, {
          revealPhone,
        });
        revealed.push({
          externalId,
          contactId: r.contactId,
          emailRevealed: r.emailRevealed,
          phoneRevealed: r.phoneRevealed,
        });
      } catch (err) {
        this.logger.warn(
          `reveal failed for ${externalId}: ${(err as Error).message}`,
        );
      }
    }
    return { revealed };
  }

  private async executeSave(
    ctx: OwnershipContext,
    payload: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const jobId = String(payload.jobId ?? "");
    const externalIds =
      (overrides.externalIds as string[] | undefined) ??
      (payload.externalIds as string[]);
    if (!jobId || !Array.isArray(externalIds) || externalIds.length === 0) {
      throw new BadRequestException("jobId + externalIds are required to save");
    }
    // The lead-search service `revealCandidate` already upserts a contact when
    // a reveal happens. For "save only" (no reveal), we still call reveal with
    // email-only as the cheapest reliable path to upsert.
    const saved: Array<{ externalId: string; contactId: string | null }> = [];
    for (const externalId of externalIds) {
      try {
        const r = await this.leadSearch.revealCandidate(ctx, jobId, externalId, {
          revealPhone: false,
        });
        saved.push({ externalId, contactId: r.contactId });
      } catch (err) {
        this.logger.warn(
          `save failed for ${externalId}: ${(err as Error).message}`,
        );
      }
    }

    const listName =
      (overrides.listName as string | undefined) ??
      (payload.listName as string | undefined);
    let tagId: string | null = null;
    if (listName) {
      try {
        const tag = await this.tags.createTag(ctx, { name: listName });
        tagId = tag.id;
      } catch (err) {
        this.logger.warn(`createTag failed: ${(err as Error).message}`);
      }
    }
    return { saved, listTagId: tagId };
  }

  private async executeCreateList(
    ctx: OwnershipContext,
    payload: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const name =
      (overrides.name as string | undefined) ??
      (payload.name as string | undefined);
    if (!name) throw new BadRequestException("List name is required");
    const tag = await this.tags.createTag(ctx, { name });
    return { tagId: tag.id, name: tag.name };
  }
}

/**
 * The orchestrator stores `confirmation_request` tool-event rows whose
 * `payload` is the entire emitted AgentToolEvent (`{ kind, action, payload:
 * {...}, summary, ... }`) — so the actual action data is one level deeper.
 * The tool layer separately persists a row with the flat shape `{ action,
 * jobId, externalIds }`. Either shape can land here depending on which row
 * the UI confirmed against; unwrap to the inner record either way.
 */
function unwrapConfirmationPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  // Flat shape from the tool-created row.
  if (typeof payload.action === "string" && "jobId" in payload) {
    return payload;
  }
  const nested = payload.payload;
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    // Action lives at the top of the wrapper; preserve it on the unwrapped
    // record so the switch below still finds it.
    if (!inner.action && typeof payload.action === "string") {
      return { ...inner, action: payload.action };
    }
    return inner;
  }
  return payload;
}
