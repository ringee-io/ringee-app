import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { AiVoiceAgentCall, AiVoiceAgentCallRepository } from "@ringee/database";
import {
  VoiceAgentProviderService,
  type OwnershipContext,
} from "@ringee/platform";
import { CreditService } from "../credit.service";

/** Rounding unit for a USD amount, matching the rest of the ledger. */
const USD_PRECISION = 1e6;

export interface VoiceAgentSettlement {
  settled: boolean;
  /** What the provider charged, before margin. */
  providerCostUsd: number;
  /** What Ringee debited. */
  chargedCredits: number;
  reason?: string;
}

/**
 * AI usage settlement.
 *
 * The voice leg still settles through the ordinary `call.cost` path
 * (BILL-012). This covers the other half — the provider's conversation engine
 * and its LLM tokens — which is metered separately and only appears in the
 * provider's usage records some time after the call ends.
 *
 * Price is the provider's own reported cost times `AI_VOICE_AGENT_PROFIT_MARGIN`
 * (BILL-013's shape), debited exactly once per call (BILL-003).
 */
@Injectable()
export class VoiceAgentBillingService {
  private readonly logger = new Logger(VoiceAgentBillingService.name);

  constructor(
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly provider: VoiceAgentProviderService,
    private readonly credits: CreditService,
  ) {}

  /**
   * Settles one call. Safe to call repeatedly: the settlement marker on the row
   * is claimed before the debit, so a retry that arrives after a successful
   * settlement does nothing.
   *
   * Returns `settled: false` when the provider has not published its records
   * yet — that is a "try again later", never a zero charge.
   */
  async settle(agentCallId: string): Promise<VoiceAgentSettlement> {
    const agentCall = await this.agentCalls.findById(agentCallId);
    if (!agentCall) {
      return this.notSettled("The agent call no longer exists.");
    }
    if (agentCall.costSettledAt) {
      return {
        settled: true,
        providerCostUsd: agentCall.aiCostUsd ?? 0,
        chargedCredits: agentCall.aiChargedCredits ?? 0,
      };
    }
    if (!agentCall.providerConversationId && !agentCall.providerCallControlId) {
      return this.notSettled("The call has no provider handle yet.");
    }

    const records = await this.provider.fetchUsageRecords({
      ...(agentCall.providerConversationId
        ? { conversationId: agentCall.providerConversationId }
        : {}),
      ...(agentCall.providerCallControlId
        ? { callControlId: agentCall.providerCallControlId }
        : {}),
    });

    if (records.length === 0) {
      // Records appear with a lag. An empty answer means "not published yet",
      // and settling at zero here would silently give the call away.
      return this.notSettled(
        "The provider has not published usage records yet.",
      );
    }

    const providerCostUsd = this.round(
      records.reduce((total, record) => total + record.costUsd, 0),
    );
    const chargedCredits = this.round(
      providerCostUsd * apiConfiguration.AI_VOICE_AGENT_PROFIT_MARGIN,
    );

    if (chargedCredits <= 0) {
      // A real conversation that cost nothing is possible for a call that never
      // connected. Mark it settled so the reconciler stops chasing it.
      await this.agentCalls.settleAiCostOnce(agentCall.id, 0, 0);
      return { settled: true, providerCostUsd: 0, chargedCredits: 0 };
    }

    // Claim the settlement before spending: whoever wins this update owns the
    // debit, so a concurrent retry cannot double-charge.
    const claimed = await this.agentCalls.settleAiCostOnce(
      agentCall.id,
      providerCostUsd,
      chargedCredits,
    );
    if (!claimed) {
      return this.notSettled("Another worker settled this call first.");
    }

    try {
      await this.credits.consumeCredits(this.owner(agentCall), chargedCredits, {
        idempotencyKey: `ai-voice-agent-cost:${agentCall.id}`,
        source: "ai.voice_agent.call",
      });
    } catch (error) {
      // The claim stands: the ledger key is idempotent, so a later retry of the
      // debit is safe, and releasing the claim here would risk a double charge.
      this.logger.error(
        `Agent call ${agentCall.id} was settled but the debit failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }

    this.logger.log(
      `💳 Agent call ${agentCall.id} settled: provider $${providerCostUsd}, charged ${chargedCredits}`,
    );
    return { settled: true, providerCostUsd, chargedCredits };
  }

  /**
   * Settles every call whose AI usage is still outstanding. Runs on a schedule
   * because the provider publishes its records some minutes after a call ends,
   * so the first attempt often finds nothing.
   */
  async sweep(): Promise<{ settled: number; pending: number }> {
    const pending = await this.listPending();
    let settled = 0;

    for (const call of pending) {
      try {
        const result = await this.settle(call.id);
        if (result.settled) settled += 1;
      } catch (error) {
        this.logger.error(
          `Could not settle agent call ${call.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return { settled, pending: pending.length - settled };
  }

  /**
   * Calls whose AI usage has still not settled. The sweep exists because the
   * records are published asynchronously and a single retry window is not
   * enough to guarantee they were there.
   */
  listPending(olderThanMinutes = 5, take = 50): Promise<AiVoiceAgentCall[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    return this.agentCalls.listUnsettled(cutoff, take);
  }

  private owner(agentCall: AiVoiceAgentCall): OwnershipContext {
    return {
      userId: agentCall.userId,
      organizationId: agentCall.organizationId,
    };
  }

  private round(value: number): number {
    return Math.round(value * USD_PRECISION) / USD_PRECISION;
  }

  private notSettled(reason: string): VoiceAgentSettlement {
    return { settled: false, providerCostUsd: 0, chargedCredits: 0, reason };
  }
}
