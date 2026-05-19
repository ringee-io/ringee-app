import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiConversationRepository,
  AiMessageRepository,
  AiToolEventRepository,
} from "@ringee/database";
import {
  AiProviderRegistry,
  OwnershipContext,
  computeTokenCost,
  isModelPriced,
} from "@ringee/platform";
import type { AiUsage } from "@ringee/platform";
import { SSEBridgeService } from "../outbound/sse-bridge.service";
import { CreditService } from "../credit.service";
import { AgentRegistry, RunnableAgent } from "./agent.registry";
import { AiContextBuilder } from "./ai-context.builder";
import { AiConversationService } from "./ai-conversation.service";
import { AiSummarizerService } from "./ai-summarizer.service";
import { AiChatStreamEvent } from "./ai-event.types";
import { AgentTool, AgentToolEvent } from "./tool.types";

// Generous tool-hop budget. The prospecting agent's first-turn protocol can
// chain: detect_connected_providers → analyze_past_buyers → search_prospects
// → (optional auto-retry with looser filters) → final answer, plus reveal /
// save / list_create on subsequent turns. Six was too tight when the model
// retries searches; bump to ten with healthy headroom.
const MAX_TOOL_HOPS = 10;

export interface SendMessageInput {
  conversationId: string;
  text: string;
}

@Injectable()
export class AiChatOrchestrator {
  private readonly logger = new Logger(AiChatOrchestrator.name);

  constructor(
    private readonly conversations: AiConversationService,
    private readonly conversationsRepo: AiConversationRepository,
    private readonly messages: AiMessageRepository,
    private readonly toolEvents: AiToolEventRepository,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly agents: AgentRegistry,
    private readonly contextBuilder: AiContextBuilder,
    private readonly summarizer: AiSummarizerService,
    private readonly sse: SSEBridgeService,
    private readonly credits: CreditService,
  ) {}

  channel(conversationId: string): string {
    return `ai:${conversationId}`;
  }

  emitConfirmationResolved(
    conversationId: string,
    confirmationId: string,
    accepted: boolean,
    result?: Record<string, unknown>,
  ): void {
    this.emit(conversationId, {
      type: "confirmation_resolved",
      confirmationId,
      accepted,
      result,
    });
  }

  /**
   * Process a user message: persist it, kick off the streamed agent run,
   * emit SSE events as the model and its tools execute.
   */
  async sendMessage(
    ctx: OwnershipContext,
    input: SendMessageInput,
  ): Promise<void> {
    if (!input.text?.trim()) {
      throw new BadRequestException("Message text is required");
    }

    const conversation = await this.conversations.getByIdScoped(
      ctx,
      input.conversationId,
    );
    if (!this.agents.isActive(conversation.agent)) {
      throw new BadRequestException(
        `Agent ${conversation.agent} is not enabled in this build.`,
      );
    }
    const agent = this.agents.getRunnable(conversation.agent);

    // Block the whole turn if the user is out of credit — never start a run
    // we can't pay for. The frontend renders a dedicated out-of-credit state
    // off this error code.
    const balance = await this.credits.getBalance(ctx);
    if (balance <= 0) {
      throw new BadRequestException({
        code: "INSUFFICIENT_CREDIT",
        message:
          "You've run out of credit. Add credit to keep using Ringee AI.",
      });
    }

    // Persist the user message immediately so the UI history is consistent.
    await this.messages.create({
      conversationId: conversation.id,
      userId: ctx.userId,
      role: "user",
      content: input.text.trim(),
    });
    await this.conversationsRepo.touchLastMessageAt(conversation.id);

    if (!conversation.title) {
      await this.conversationsRepo.updateTitle(
        conversation.id,
        deriveTitle(input.text),
      );
    }

    // Fire the streamed run in the background — the controller streams events
    // out via SSE; the HTTP POST returns 202 immediately.
    void this.runTurn(ctx, conversation.id, agent).catch((err) => {
      this.logger.error(
        `AI run failed for conversation ${conversation.id}`,
        err as Error,
      );
      this.emit(conversation.id, {
        type: "error",
        message: errorMessage(err),
      });
      this.emit(conversation.id, {
        type: "completed",
        finishReason: "error",
      });
    });
  }

  /** Run a full streaming turn (model → optional tool loops → final answer). */
  private async runTurn(
    ctx: OwnershipContext,
    conversationId: string,
    agent: RunnableAgent,
  ): Promise<void> {
    const provider = this.providerRegistry.get(apiConfiguration.AI_PROVIDER);
    const toolsByName = new Map<string, AgentTool>(
      agent.tools().map((t) => [t.name, t]),
    );
    const toolSchemas = agent.toolSchemas();

    let hops = 0;
    while (hops < MAX_TOOL_HOPS) {
      hops += 1;

      // Mid-turn credit cutoff: if a prior hop's tool work drained the
      // balance, stop before calling the model again instead of running up
      // negative credit.
      if (hops > 1) {
        const balance = await this.credits.getBalance(ctx);
        if (balance <= 0) {
          this.emit(conversationId, {
            type: "error",
            message:
              "You've run out of credit. The assistant stopped before finishing — add credit to continue.",
            code: "insufficient_credit",
          });
          this.emit(conversationId, {
            type: "completed",
            finishReason: "error",
          });
          return;
        }
      }

      const conversation = await this.conversationsRepo.findById(conversationId);
      if (!conversation) return;

      const built = await this.contextBuilder.build(
        conversation,
        agent.systemPrompt(conversation),
      );

      // Assistant row is created lazily: only when the first text delta or
      // tool_call arrives. This avoids an empty placeholder bubble in the UI
      // when the model goes straight to a tool call without prefacing text.
      // Wrap the slot in an object so TypeScript narrowing survives closure
      // mutation in ensureAssistantRow.
      const slot: { row: { id: string; createdAt: Date } | null } = { row: null };
      const ensureAssistantRow = async (): Promise<{
        id: string;
        createdAt: Date;
      }> => {
        if (slot.row) return slot.row;
        const created = await this.messages.create({
          conversationId,
          role: "assistant",
          status: "streaming",
          content: "",
          model: apiConfiguration.AI_PROVIDER,
        });
        slot.row = { id: created.id, createdAt: created.createdAt };
        this.emit(conversationId, {
          type: "message_started",
          messageId: created.id,
          role: "assistant",
          createdAt: created.createdAt.toISOString(),
        });
        return slot.row;
      };

      let accumulatedText = "";
      const completedToolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }> = [];
      let finishReason:
        | "stop"
        | "tool_calls"
        | "length"
        | "error"
        | "cancelled" = "stop";
      let usage: AiUsage | undefined;

      try {
        for await (const ev of provider.stream({
          system: built.system,
          messages: built.messages,
          tools: toolSchemas,
          toolChoice: "auto",
          // temperature: apiConfiguration.AI_TEMPERATURE,
        })) {
          if (ev.type === "text_delta") {
            const row = await ensureAssistantRow();
            accumulatedText += ev.delta;
            this.emit(conversationId, {
              type: "text_delta",
              messageId: row.id,
              delta: ev.delta,
            });
          } else if (ev.type === "tool_call_started") {
            this.emit(conversationId, {
              type: "tool_started",
              toolCallId: ev.id,
              toolName: ev.name,
            });
          } else if (ev.type === "tool_call_completed") {
            completedToolCalls.push({
              id: ev.id,
              name: ev.name,
              arguments: ev.arguments,
            });
          } else if (ev.type === "completed") {
            finishReason = ev.finishReason;
            usage = ev.usage;
          } else if (ev.type === "error") {
            this.emit(conversationId, {
              type: "error",
              message: ev.error,
            });
          }
        }
      } catch (err) {
        this.emit(conversationId, {
          type: "error",
          message: errorMessage(err),
        });
        if (slot.row) {
          await this.messages.finalize({
            id: slot.row.id,
            content: accumulatedText,
            status: "failed",
          });
        }
        this.emit(conversationId, {
          type: "completed",
          finishReason: "error",
        });
        return;
      }

      // Price this model turn and debit the user's credits before doing
      // anything else with the result.
      const charge = await this.chargeTurn(ctx, conversationId, usage);

      // Finalize the assistant row for this hop.
      if (completedToolCalls.length > 0) {
        // OpenAI accepts a single assistant message carrying BOTH content and
        // tool_calls. Persist them on the same row when text was streamed, so
        // we never produce an orphan "empty assistant bubble" and so the
        // context replay matches what the model sees.
        const first = completedToolCalls[0];
        let toolCallMsg: { id: string };
        if (slot.row) {
          const updated = await this.messages.attachToolCall({
            id: slot.row.id,
            toolName: first.name,
            toolPayload: first.arguments,
            content: accumulatedText || null,
            status: "completed",
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            cachedTokens: usage?.cachedInputTokens ?? null,
            cacheWriteTokens: usage?.cacheWriteTokens ?? null,
            costCredits: charge.costCredits,
            model: usage?.model ?? null,
          });
          toolCallMsg = { id: updated.id };
          this.emit(conversationId, {
            type: "message_completed",
            messageId: slot.row.id,
            content: accumulatedText,
          });
        } else {
          const created = await this.messages.create({
            conversationId,
            role: "assistant",
            content: null,
            toolName: first.name,
            toolPayload: first.arguments,
            status: "completed",
            model: usage?.model ?? null,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            cachedTokens: usage?.cachedInputTokens ?? null,
            cacheWriteTokens: usage?.cacheWriteTokens ?? null,
            costCredits: charge.costCredits,
          });
          toolCallMsg = { id: created.id };
        }

        // Surface the usage/cost for this hop so the UI total updates live.
        this.emitUsage(conversationId, toolCallMsg.id, usage, charge);

        // Execute the tool — only the first; the others (if any) are ignored
        // and recorded so the model can retry next hop.
        const tool = toolsByName.get(first.name);
        if (!tool) {
          await this.messages.create({
            conversationId,
            role: "tool",
            toolName: first.name,
            content: `Tool "${first.name}" not found`,
            toolPayload: {
              _toolCallMessageId: toolCallMsg.id,
              result: { error: "tool_not_found" },
            },
          });
          this.emit(conversationId, {
            type: "tool_completed",
            toolCallId: first.id,
            toolName: first.name,
            ok: false,
            summary: "Unknown tool",
          });
          continue;
        }

        let result: unknown;
        let ok = true;
        try {
          const freshForTool = await this.conversationsRepo.findById(conversationId);
          if (!freshForTool) throw new Error("Conversation disappeared mid-run");
          result = await tool.execute(first.arguments, {
            ctx,
            conversation: freshForTool,
            agent: agent.id,
            emit: (event) => this.emitToolEvent(conversationId, toolCallMsg.id, event),
          });
        } catch (err) {
          ok = false;
          result = { error: errorMessage(err) };
          this.logger.warn(
            `Tool ${first.name} failed: ${errorMessage(err)}`,
          );
        }

        // Persist the tool result so the next hop's context includes it.
        // We tag the row with the originating assistant tool-call message id
        // so the context builder can rebuild a valid OpenAI tool/assistant
        // pair (the tool_call_id on the tool message MUST match an id in the
        // previous assistant message's tool_calls).
        await this.messages.create({
          conversationId,
          role: "tool",
          toolName: first.name,
          content: typeof result === "string" ? result : null,
          toolPayload: {
            _toolCallMessageId: toolCallMsg.id,
            result:
              typeof result === "object" && result !== null
                ? (result as Record<string, unknown>)
                : { value: result ?? null },
          },
        });

        this.emit(conversationId, {
          type: "tool_completed",
          toolCallId: first.id,
          toolName: first.name,
          ok,
        });

        // Loop back so the model can summarize the tool result for the user.
        continue;
      }

      // No tool calls — this is the final assistant turn.
      if (slot.row) {
        await this.messages.finalize({
          id: slot.row.id,
          content: accumulatedText,
          status: "completed",
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          cachedTokens: usage?.cachedInputTokens ?? null,
          cacheWriteTokens: usage?.cacheWriteTokens ?? null,
          costCredits: charge.costCredits,
          model: usage?.model ?? null,
        });
        this.emit(conversationId, {
          type: "message_completed",
          messageId: slot.row.id,
          content: accumulatedText,
        });
        this.emitUsage(conversationId, slot.row.id, usage, charge);
      } else if (accumulatedText) {
        // No streaming row was created but text arrived via a bulk delta —
        // persist it now so history stays consistent.
        const created = await this.messages.create({
          conversationId,
          role: "assistant",
          status: "completed",
          content: accumulatedText,
          model: usage?.model ?? null,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          cachedTokens: usage?.cachedInputTokens ?? null,
          cacheWriteTokens: usage?.cacheWriteTokens ?? null,
          costCredits: charge.costCredits,
        });
        this.emit(conversationId, {
          type: "message_completed",
          messageId: created.id,
          content: accumulatedText,
        });
        this.emitUsage(conversationId, created.id, usage, charge);
      }
      await this.conversationsRepo.touchLastMessageAt(conversationId);
      this.emit(conversationId, {
        type: "completed",
        finishReason,
      });

      // Background summarization if context is getting big.
      const fresh = await this.conversationsRepo.findById(conversationId);
      if (fresh && this.summarizer.shouldSummarize(built.estimatedTokens, fresh)) {
        void this.summarizer.summarize(fresh).catch((err) => {
          this.logger.warn(
            `summarize failed for ${conversationId}: ${errorMessage(err)}`,
          );
        });
      }
      return;
    }

    // Tool-loop budget exhausted.
    this.emit(conversationId, {
      type: "error",
      message:
        "The agent exceeded the tool-call budget for this turn. Please rephrase or try again.",
    });
    this.emit(conversationId, {
      type: "completed",
      finishReason: "length",
    });
  }

  /**
   * Handle user confirmation for a pending tool-emitted confirmation_request
   * (reveal / save / list_create). Persists resolution, runs the actual
   * downstream operation through the existing services, and emits a result
   * event back over SSE so the agent can react.
   */
  async resolveConfirmation(
    ctx: OwnershipContext,
    conversationId: string,
    confirmationId: string,
    accepted: boolean,
    overrides?: Record<string, unknown>,
  ): Promise<void> {
    const conversation = await this.conversations.getByIdScoped(
      ctx,
      conversationId,
    );
    const event = await this.toolEvents.findById(confirmationId);
    if (!event || event.conversationId !== conversation.id) {
      throw new BadRequestException("Confirmation not found for this conversation");
    }
    if (event.resolved) return;

    await this.toolEvents.resolve(confirmationId, {
      accepted,
      overrides: overrides ?? null,
    });
    this.emit(conversation.id, {
      type: "confirmation_resolved",
      confirmationId,
      accepted,
      result: overrides ?? {},
    });

    // Persist a synthetic user "system" note so the agent can incorporate the
    // decision when it next runs. The actual execution of the action (reveal,
    // save, list create) is performed by the higher-level controller, which
    // can debit credits, etc.
    await this.messages.create({
      conversationId: conversation.id,
      role: "user",
      content: `[user ${accepted ? "approved" : "declined"} ${
        (event.payload as { action?: string })?.action ?? "action"
      }${overrides ? ` with overrides ${JSON.stringify(overrides)}` : ""}]`,
    });
  }

  /**
   * Price a single model turn against the per-model rate table, debit the
   * user's credits, and add it to the conversation's running total. Returns
   * the values to persist on the assistant row and stream to the UI.
   */
  private async chargeTurn(
    ctx: OwnershipContext,
    conversationId: string,
    usage: AiUsage | undefined,
  ): Promise<{ costCredits: number; conversationTotalCost: number }> {
    const { chargedCredits } = computeTokenCost(
      usage?.model,
      {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        cachedInputTokens: usage?.cachedInputTokens,
        cacheWriteTokens: usage?.cacheWriteTokens,
      },
      apiConfiguration.AI_TOKEN_MARGIN,
    );
    // Round to micro-credit precision to avoid float dust accumulating.
    const cost = Math.round(chargedCredits * 1e6) / 1e6;

    if (cost <= 0) {
      if (usage?.model && !isModelPriced(usage.model)) {
        this.logger.warn(
          `AI turn for ${conversationId} used unpriced model "${usage.model}" — no credits charged. Add it to the pricing table.`,
        );
      }
      const fresh = await this.conversationsRepo.findById(conversationId);
      return {
        costCredits: 0,
        conversationTotalCost: fresh?.totalCostCredits ?? 0,
      };
    }

    try {
      await this.credits.consumeCredits(ctx, cost);
    } catch (err) {
      this.logger.warn(
        `AI credit debit failed for ${conversationId}: ${errorMessage(err)}`,
      );
    }
    let conversationTotalCost = cost;
    try {
      const updated = await this.conversationsRepo.incrementCost(
        conversationId,
        cost,
      );
      conversationTotalCost = updated.totalCostCredits;
    } catch (err) {
      this.logger.warn(
        `AI cost rollup failed for ${conversationId}: ${errorMessage(err)}`,
      );
    }
    return { costCredits: cost, conversationTotalCost };
  }

  private emitUsage(
    conversationId: string,
    messageId: string,
    usage: AiUsage | undefined,
    charge: { costCredits: number; conversationTotalCost: number },
  ): void {
    this.emit(conversationId, {
      type: "usage",
      messageId,
      model: usage?.model ?? null,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cachedTokens: usage?.cachedInputTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      costCredits: charge.costCredits,
      conversationTotalCost: charge.conversationTotalCost,
    });
  }

  private emit(conversationId: string, event: AiChatStreamEvent): void {
    this.sse.emit(this.channel(conversationId), event.type, event);
  }

  private async emitToolEvent(
    conversationId: string,
    messageId: string,
    event: AgentToolEvent,
  ): Promise<void> {
    const kind = event.kind;

    // confirmation_request is special: the tool that emits it has ALREADY
    // persisted the confirmation_request row itself (it needs the row id
    // synchronously to hand a confirmationId back to the model) and passes
    // that id here as `requestId`. Reuse it. Creating a second row would
    // leave the tool's row orphaned and unresolved — and since the UI lists
    // every confirmation_request row on reload, that orphan resurfaces as a
    // stuck "Action required" card even after the user approved.
    if (kind === "confirmation_request") {
      this.emit(conversationId, {
        type: "confirmation_request",
        confirmationId: event.requestId,
        action: event.action,
        summary: event.summary,
        payload: event.payload,
        estimatedCreditCost: event.estimatedCreditCost ?? null,
      });
      return;
    }

    if (
      kind === "prospect_results" ||
      kind === "prospects_saved" ||
      kind === "list_created"
    ) {
      const row = await this.toolEvents.create({
        conversationId,
        messageId,
        kind,
        payload: event as unknown as Record<string, unknown>,
      });
      this.emit(conversationId, {
        type: "tool_event",
        toolEventId: row.id,
        kind,
        payload: event as unknown as Record<string, unknown>,
      });
      return;
    }
    // tool_progress and duplicate_search_detected — UI-only ephemeral events.
    // They are advisory (a progress ping, a "you already searched this"
    // prompt) and carry no server-side state to resolve, so they are streamed
    // but not persisted as AiToolEvent rows.
    this.emit(conversationId, {
      type: "tool_event",
      toolEventId: "",
      kind,
      payload: event as unknown as Record<string, unknown>,
    });
  }
}

function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

