import { Injectable, Logger } from "@nestjs/common";
import {
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentCallStatus,
  AiVoiceAgentOutcome,
  AiVoiceAgentRepository,
  CallRepository,
  CallStatus,
} from "@ringee/database";
import {
  hashApiKey,
  safeHashEqual,
  type TelephonyConversationDetails,
  type TelephonyEvent,
} from "@ringee/platform";
import { VoiceAgentService } from "./voice-agent.service";
import type { VoiceAgentAnalysisSettings } from "./voice-agent.types";

/** Provider call statuses, mapped onto Ringee's own agent-call states. */
const PROVIDER_STATUS_MAP: Record<string, AiVoiceAgentCallStatus> = {
  initiated: AiVoiceAgentCallStatus.initiating,
  ringing: AiVoiceAgentCallStatus.ringing,
  "in-progress": AiVoiceAgentCallStatus.in_progress,
  answered: AiVoiceAgentCallStatus.in_progress,
  completed: AiVoiceAgentCallStatus.completed,
  busy: AiVoiceAgentCallStatus.busy,
  "no-answer": AiVoiceAgentCallStatus.no_answer,
  failed: AiVoiceAgentCallStatus.failed,
  canceled: AiVoiceAgentCallStatus.failed,
};

/** What a finished agent call looks like to every consumer (§16). */
export interface VoiceAgentCallResult {
  call_id: string;
  status: AiVoiceAgentCallStatus;
  outcome: AiVoiceAgentOutcome | null;
  summary: string | null;
  sentiment: string | null;
  extracted_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  appointment?: {
    id: string;
    start: string;
    end: string;
  };
}

/**
 * Turns provider conversation events into Ringee's normalized result.
 *
 * Every handler here is safe to run twice. Webhooks are retried, and the two
 * events that fill a result in can arrive in either order — or twice — so each
 * one writes only the half it owns and guards on what is already stored.
 */
@Injectable()
export class VoiceAgentResultService {
  private readonly logger = new Logger(VoiceAgentResultService.name);

  constructor(
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly agents: AiVoiceAgentRepository,
    private readonly agentService: VoiceAgentService,
    private readonly callRepository: CallRepository,
  ) {}

  /**
   * Handles the AI-conversation events. Returns true when the event belonged to
   * an agent call, so the ordinary call lifecycle leaves it alone.
   */
  async handleTelephonyEvent(event: TelephonyEvent): Promise<boolean> {
    if (
      event.type !== "call.conversation.ended" &&
      event.type !== "call.conversation.insights"
    ) {
      return false;
    }

    const conversation = event.conversation;
    if (!conversation) return false;

    const agentCall = await this.locate(event.callControlId, conversation);
    if (!agentCall) {
      // A conversation Ringee did not start — another integration on the same
      // provider account. Not an error, and not ours to record.
      this.logger.debug(
        `Ignoring ${event.providerEventType} for an unknown conversation`,
      );
      return true;
    }

    if (event.type === "call.conversation.ended") {
      await this.applyConversationEnded(agentCall, event, conversation);
    } else {
      await this.applyInsights(agentCall, conversation);
    }
    return true;
  }

  /**
   * Binds the conversation to the call and records that it finished. The
   * telephony status still comes from the call status callback — a conversation
   * that ended is not by itself proof the call completed normally.
   */
  private async applyConversationEnded(
    agentCall: AiVoiceAgentCall,
    event: TelephonyEvent,
    conversation: TelephonyConversationDetails,
  ): Promise<void> {
    await this.agentCalls.update(agentCall.id, {
      providerConversationId:
        agentCall.providerConversationId ?? conversation.conversationId,
      providerCallControlId:
        agentCall.providerCallControlId ?? event.callControlId,
      ...(agentCall.status === AiVoiceAgentCallStatus.in_progress ||
      agentCall.status === AiVoiceAgentCallStatus.ringing ||
      agentCall.status === AiVoiceAgentCallStatus.initiating
        ? { status: AiVoiceAgentCallStatus.completed }
        : {}),
    });

    // Bind the telephony row too: this is the first event that names the leg.
    if (agentCall.callId) {
      const call = await this.callRepository.findById(agentCall.callId);
      if (call && !call.callControlId) {
        await this.callRepository.attachTelephony(call.id, {
          callControlId: event.callControlId,
          callSessionId: event.callSessionId,
          callLegId: event.callLegId,
        });
      }
    }
  }

  /**
   * Maps each analysis result back onto the field that asked for it. The
   * mapping is by insight id — the provider returns results in no particular
   * order, and matching on names would break the moment two agents share one.
   */
  private async applyInsights(
    agentCall: AiVoiceAgentCall,
    conversation: TelephonyConversationDetails,
  ): Promise<void> {
    const agent = await this.agents.findByIdForOwner(
      { userId: agentCall.userId, organizationId: agentCall.organizationId },
      agentCall.agentId,
    );
    if (!agent) return;

    const analysis: VoiceAgentAnalysisSettings =
      this.agentService.readAnalysis(agent);
    const bySlot = this.invert(analysis.insightIds);

    const update: {
      summary?: string;
      sentiment?: string;
      outcome?: AiVoiceAgentOutcome;
      extractedData?: object;
    } = {};

    for (const insight of conversation.insights) {
      const slot = bySlot.get(insight.insightId);
      if (!slot) continue;

      switch (slot) {
        case "summary":
          update.summary = insight.result.trim();
          break;
        case "sentiment":
          update.sentiment = this.readField<string>(
            insight.result,
            "sentiment",
          );
          break;
        case "outcome": {
          // The booking tool's own result is ground truth: it knows a meeting
          // was created. A later analysis may fill an empty outcome in, never
          // overwrite that one.
          if (agentCall.outcome === AiVoiceAgentOutcome.appointment_booked) {
            break;
          }
          const value = this.readField<string>(insight.result, "outcome");
          update.outcome = this.toOutcome(value);
          break;
        }
        case "extraction": {
          const parsed = this.parse(insight.result);
          if (parsed && typeof parsed === "object") {
            update.extractedData = parsed as object;
          }
          break;
        }
      }
    }

    if (Object.keys(update).length === 0) return;
    await this.agentCalls.update(agentCall.id, update);
  }

  /**
   * Applies a provider call-status callback. This is what moves an agent call
   * through ringing → in progress → completed.
   *
   * The telephony row is only settled at the end: the provider's intermediate
   * callbacks carry no handle for the leg, and the terminal one carries them
   * all, so binding and closing happen together through the same repository
   * methods every other call surface uses.
   */
  async applyStatus(
    agentCall: AiVoiceAgentCall,
    input: {
      providerStatus: string;
      callControlId?: string | null;
      callLegId?: string | null;
      callSessionId?: string | null;
      startedAt?: string | null;
      answeredAt?: string | null;
      endedAt?: string | null;
      hangupCause?: string | null;
    },
  ): Promise<AiVoiceAgentCall> {
    const status =
      PROVIDER_STATUS_MAP[input.providerStatus.toLowerCase()] ?? null;

    const updated = await this.agentCalls.update(agentCall.id, {
      ...(status ? { status } : {}),
      ...(input.callControlId
        ? { providerCallControlId: input.callControlId }
        : {}),
    });

    if (!agentCall.callId) return updated;

    if (input.callControlId) {
      const call = await this.callRepository.findById(agentCall.callId);
      if (call && !call.callControlId) {
        await this.callRepository.attachTelephony(call.id, {
          callControlId: input.callControlId,
          callSessionId: input.callSessionId,
          callLegId: input.callLegId,
          answeredAt: input.answeredAt,
          status: CallStatus.answered,
        });
      }
    }

    if (this.isTerminal(status) && input.callControlId) {
      // The shared settlement path: it computes the duration, records the
      // hangup cause and auto-dispositions a call that never connected.
      await this.callRepository.completeCall(
        input.callControlId,
        input.startedAt ?? new Date().toISOString(),
        input.endedAt ?? new Date().toISOString(),
        input.hangupCause ?? undefined,
      );
    }

    return updated;
  }

  private isTerminal(status: AiVoiceAgentCallStatus | null): boolean {
    return (
      status === AiVoiceAgentCallStatus.completed ||
      status === AiVoiceAgentCallStatus.no_answer ||
      status === AiVoiceAgentCallStatus.busy ||
      status === AiVoiceAgentCallStatus.failed
    );
  }

  /**
   * Entry point for the provider's call-status callback.
   *
   * The route it arrives on is public, so authorization is proved here: a
   * single-use token whose hash was stored on the row when the call was
   * placed, compared in constant time. An unknown call or a token that does
   * not match is treated identically — nothing is written and nothing is
   * disclosed.
   */
  async applyStatusCallback(
    agentCallId: string,
    token: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const agentCall = await this.agentCalls.findById(agentCallId);
    if (!agentCall?.callbackTokenHash) return false;
    if (!safeHashEqual(agentCall.callbackTokenHash, hashApiKey(token))) {
      this.logger.warn(
        `Rejected a status callback for agent call ${agentCallId} (bad token)`,
      );
      return false;
    }

    const status = this.text(payload.CallStatus);
    if (!status) return true;

    await this.applyStatus(agentCall, {
      providerStatus: status,
      callControlId: this.text(payload.CallControlId),
      callLegId: this.text(payload.CallLegId),
      callSessionId: this.text(payload.CallSessionId),
      startedAt: this.text(payload.StartTime),
      answeredAt: this.text(payload.AnsweredTime),
      endedAt: this.text(payload.EndTime),
      hangupCause: this.text(payload.HangupCause),
    });
    return true;
  }

  private text(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  /** The §16 shape, assembled from the row. */
  toResult(agentCall: AiVoiceAgentCall): VoiceAgentCallResult {
    return {
      call_id: agentCall.id,
      status: agentCall.status,
      outcome: agentCall.outcome,
      summary: agentCall.summary,
      sentiment: agentCall.sentiment,
      extracted_data:
        (agentCall.extractedData as Record<string, unknown>) ?? {},
      metadata: (agentCall.metadata as Record<string, unknown>) ?? {},
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async locate(
    callControlId: string,
    conversation: TelephonyConversationDetails,
  ): Promise<AiVoiceAgentCall | null> {
    if (conversation.conversationId) {
      const byConversation = await this.agentCalls.findByConversationId(
        conversation.conversationId,
      );
      if (byConversation) return byConversation;
    }
    return this.agentCalls.findByCallControlId(callControlId);
  }

  private invert(
    insightIds: VoiceAgentAnalysisSettings["insightIds"],
  ): Map<string, keyof VoiceAgentAnalysisSettings["insightIds"]> {
    const map = new Map<
      string,
      keyof VoiceAgentAnalysisSettings["insightIds"]
    >();
    for (const [slot, id] of Object.entries(insightIds)) {
      if (id) {
        map.set(id, slot as keyof VoiceAgentAnalysisSettings["insightIds"]);
      }
    }
    return map;
  }

  /** Structured insights return JSON; a malformed one is dropped, not guessed. */
  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private readField<T>(raw: string, field: string): T | undefined {
    const parsed = this.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    return (parsed as Record<string, T>)[field];
  }

  /**
   * The outcome is a closed set (§18). A value the model invented is recorded
   * as unknown rather than written through, so consumers can always branch.
   */
  private toOutcome(value: string | undefined): AiVoiceAgentOutcome {
    if (!value) return AiVoiceAgentOutcome.unknown;
    const match = Object.values(AiVoiceAgentOutcome).find(
      (outcome) => outcome === value,
    );
    if (!match) {
      this.logger.warn(`Analysis returned an unknown outcome "${value}"`);
      return AiVoiceAgentOutcome.unknown;
    }
    return match;
  }
}
