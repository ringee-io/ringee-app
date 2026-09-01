import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  CallRepository,
  RecordingRepository,
} from "@ringee/database";
import {
  VoiceAgentProviderService,
  type OwnershipContext,
  type VoiceAgentUsageRecord,
} from "@ringee/platform";
import { CreditService } from "../credit.service";
import { calculateCallCharge } from "../call-cost.util";
import { RecordingProcessingService } from "../recording-processing.service";
import { VoiceAgentResultService } from "./voice-agent-result.service";

/** Rounding unit for a USD amount, matching the rest of the ledger. */
const USD_PRECISION = 1e6;

/**
 * How long after a call Ringee keeps looking for its recording and transcript,
 * and how long it waits before the first look. The provider finalizes both
 * shortly after the call ends; the window is what stops a call that never
 * produced either from being chased for the rest of its life.
 */
const ARTIFACT_RETRY_WINDOW_MS = 6 * 60 * 60 * 1000;
const ARTIFACT_SETTLE_DELAY_MS = 2 * 60 * 1000;

export interface VoiceAgentSettlement {
  settled: boolean;
  /** What the provider charged for the AI half, before margin. */
  providerCostUsd: number;
  /** What Ringee debited for the AI half. */
  chargedCredits: number;
  /** What the provider charged for the voice leg, before margin. */
  telephonyCostUsd?: number;
  reason?: string;
}

/**
 * Cost reconciliation for an agent call, read from the provider's own billing
 * records rather than waited for.
 *
 * An agent call is billed in two halves. The voice leg is the ordinary
 * `call.cost` charge (BILL-012); the conversation engine and its tokens are
 * metered separately (BILL-013's shape, `AI_VOICE_AGENT_PROFIT_MARGIN`). Both
 * are published to the provider's usage records some minutes after the call
 * ends, and both are debited exactly once (BILL-003).
 *
 * Why polling and not the webhook: an agent's calls go out through a calling
 * application the provider provisions, and `call.cost` and
 * `call.recording.saved` are events of that application rather than callbacks
 * of the call. An application left on the provider's defaults announces neither
 * — so a call priced only by webhook is a call priced at nothing. The usage
 * records are keyed by the control id Ringee already writes down when it
 * places the call, which makes them reconcilable, replayable, and independent
 * of whether any event was ever delivered.
 *
 * The same sweep recovers what the call left behind. The recording and the
 * conversation transcript are published on their own schedule rather than the
 * usage records', so they get a pass of their own (`sweepArtifacts`): a call
 * whose money settles on the first attempt has already left the billing list,
 * and without that pass an artifact that arrived a minute late was never
 * fetched again.
 */
@Injectable()
export class VoiceAgentBillingService {
  private readonly logger = new Logger(VoiceAgentBillingService.name);

  constructor(
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly calls: CallRepository,
    private readonly recordings: RecordingRepository,
    private readonly provider: VoiceAgentProviderService,
    private readonly credits: CreditService,
    private readonly recordingProcessing: RecordingProcessingService,
    private readonly results: VoiceAgentResultService,
  ) {}

  /**
   * Settles one call: the AI usage, the voice leg, and the artifacts the
   * provider kept for it — the recording and the conversation transcript.
   *
   * Safe to call repeatedly. Each part carries its own durable marker, so a
   * part that has already landed is skipped and a part the provider had not
   * published yet is simply retried on the next sweep. Returns `settled: false`
   * only when the provider has published nothing at all — that is a "try again
   * later", never a zero charge.
   */
  async settle(agentCallId: string): Promise<VoiceAgentSettlement> {
    const agentCall = await this.agentCalls.findById(agentCallId);
    if (!agentCall) {
      return this.notSettled("The agent call no longer exists.");
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

    // The engine records name the conversation even when no webhook ever did.
    // Writing it down is what lets the token records — which carry no other
    // handle — be found on the next sweep, and what binds insights to the call.
    const current = await this.bindConversation(agentCall, records);

    const ai = await this.settleAiUsage(current, records);
    const telephonyCostUsd = await this.settleTelephonyLeg(current, records);
    await this.recoverArtifacts(current);

    return { ...ai, telephonyCostUsd };
  }

  /**
   * Settles every call whose usage is still outstanding. Runs on a schedule
   * because the provider publishes its records some minutes after a call ends,
   * so the first attempt often finds nothing.
   */
  async sweep(): Promise<{
    settled: number;
    pending: number;
    recovered: number;
  }> {
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

    const recovered = await this.sweepArtifacts();
    return { settled, pending: pending.length - settled, recovered };
  }

  /**
   * Fetches the recordings and transcripts that were not ready when the money
   * settled.
   *
   * A settled call leaves the billing list, so without this pass an artifact
   * that was published a minute late was simply never fetched: the recording
   * is finalized after the call ends, the usage records arrive on their own
   * schedule, and nothing guarantees the first is ready before the second.
   */
  private async sweepArtifacts(): Promise<number> {
    const now = Date.now();
    const outstanding = await this.agentCalls.listMissingArtifacts({
      endedAfter: new Date(now - ARTIFACT_RETRY_WINDOW_MS),
      updatedBefore: new Date(now - ARTIFACT_SETTLE_DELAY_MS),
    });

    let recovered = 0;
    for (const call of outstanding) {
      try {
        await this.recoverArtifacts(call);
        recovered += 1;
      } catch (error) {
        this.logger.warn(
          `Could not recover artifacts for agent call ${call.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return recovered;
  }

  /**
   * Everything a finished agent call leaves behind besides its price: the
   * audio, and the conversation the provider transcribed while it happened.
   *
   * Both are best-effort and separately idempotent — an artifact already
   * stored is skipped, one not published yet is simply retried on the next
   * sweep, and neither may hold up the money.
   *
   * The transcript goes first, and the order is not cosmetic: storing the
   * recording is what triggers the workspace's optional Deepgram pass over it,
   * and that pass skips a call that already has a transcript. Recovering the
   * free one first is the difference between having the text and paying for it
   * twice.
   */
  private async recoverArtifacts(agentCall: AiVoiceAgentCall): Promise<void> {
    await this.results.recoverTranscript(agentCall);
    await this.recoverRecording(agentCall);
  }

  /**
   * Calls whose usage has still not settled. The sweep exists because the
   * records are published asynchronously and a single retry window is not
   * enough to guarantee they were there.
   */
  listPending(olderThanMinutes = 5, take = 50): Promise<AiVoiceAgentCall[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    return this.agentCalls.listUnsettled(cutoff, take);
  }

  // ── The AI half ──────────────────────────────────────────────

  /**
   * Prices and debits the conversation engine and its tokens.
   *
   * The claim is written before the debit, so whoever wins the update owns the
   * charge and a concurrent retry cannot double it. The two writes have no
   * transaction around them, so "claimed" is tracked apart from "debited": a
   * call interrupted between them comes back here and finishes the debit rather
   * than being written off.
   */
  private async settleAiUsage(
    agentCall: AiVoiceAgentCall,
    records: VoiceAgentUsageRecord[],
  ): Promise<VoiceAgentSettlement> {
    if (agentCall.costSettledAt) {
      // Priced already. Finish the debit if it never landed — the price was
      // fixed when the claim was written, so it is not recomputed here.
      const providerCostUsd = agentCall.aiCostUsd ?? 0;
      const chargedCredits = agentCall.aiChargedCredits ?? 0;
      if (!agentCall.aiCostDebitedAt) {
        await this.debitAi(agentCall, chargedCredits);
      }
      return { settled: true, providerCostUsd, chargedCredits };
    }

    const providerCostUsd = this.sum(records, "voice_agent", "inference");
    const chargedCredits = this.round(
      providerCostUsd * apiConfiguration.AI_VOICE_AGENT_PROFIT_MARGIN,
    );

    if (chargedCredits <= 0) {
      // A real conversation that cost nothing is possible for a call that never
      // connected. Mark it settled so the reconciler stops chasing it.
      if (await this.agentCalls.settleAiCostOnce(agentCall.id, 0, 0)) {
        await this.agentCalls.markAiCostDebited(agentCall.id);
      }
      return { settled: true, providerCostUsd: 0, chargedCredits: 0 };
    }

    const claimed = await this.agentCalls.settleAiCostOnce(
      agentCall.id,
      providerCostUsd,
      chargedCredits,
    );
    if (!claimed) {
      return this.notSettled("Another worker settled this call first.");
    }

    await this.debitAi(agentCall, chargedCredits);
    this.logger.log(
      `💳 Agent call ${agentCall.id} AI usage settled: provider $${providerCostUsd}, charged ${chargedCredits}`,
    );
    return { settled: true, providerCostUsd, chargedCredits };
  }

  /**
   * Takes the credits for a claim that has already been written, then records
   * that it happened.
   *
   * The claim is never released on failure: the ledger key makes the debit
   * itself idempotent, so retrying is safe while un-claiming would open the
   * door to charging twice. What makes the retry actually arrive is
   * `aiCostDebitedAt` staying null — the sweep looks for exactly that.
   */
  private async debitAi(
    agentCall: AiVoiceAgentCall,
    chargedCredits: number,
  ): Promise<void> {
    try {
      if (chargedCredits > 0) {
        await this.credits.consumeCredits(
          this.owner(agentCall),
          chargedCredits,
          {
            idempotencyKey: `ai-voice-agent-cost:${agentCall.id}`,
            source: "ai.voice_agent.call",
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Agent call ${agentCall.id} was settled but the debit failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
    await this.agentCalls.markAiCostDebited(agentCall.id);
  }

  // ── The voice leg ────────────────────────────────────────────

  /**
   * Prices and debits the telephony leg onto the `Call` row, exactly as the
   * cost webhook would have.
   *
   * It shares that path's ledger key (`call-cost:<call id>`) on purpose: the
   * key is globally unique, so if the webhook ever does arrive for the same
   * call only one of the two can charge for it. `totalCost` is the marker both
   * paths read, which is what keeps them from pricing the same leg twice.
   *
   * Returns what the provider charged, or undefined when there was nothing to
   * settle from — the leg is left outstanding rather than priced at zero.
   */
  private async settleTelephonyLeg(
    agentCall: AiVoiceAgentCall,
    records: VoiceAgentUsageRecord[],
  ): Promise<number | undefined> {
    if (!agentCall.callId) return undefined;

    const call = await this.calls.findById(agentCall.callId);
    if (!call) return undefined;
    if (call.totalCost != null) return undefined;
    // `updateCost` keys on the control id. Checking it before the debit keeps a
    // charge from being taken for a row the settlement could not then write.
    if (!call.callControlId) return undefined;

    const legs = records.filter((record) => record.kind === "telephony");
    // The leg is reported once the call clears the switch. Nothing yet means
    // "not published", and pricing that at zero would give the call away.
    if (legs.length === 0) return undefined;

    // A call can produce several legs — a failed attempt before the one that
    // connected — and the charge is all of them, not the first.
    const providerCostUsd = this.sum(records, "telephony");
    const breakdown = calculateCallCharge({
      costParts: null,
      totalCost: providerCostUsd,
      callProfitMultiplier: apiConfiguration.CALL_PROFIT_MARGIN,
      recordingProfitMultiplier: apiConfiguration.CALL_RECORDING_PROFIT_MARGIN,
    });
    const totalCost = this.round(breakdown.computedTotalCost);

    const balanceBefore = await this.credits
      .getBalance(this.owner(agentCall))
      .catch(() => 0);

    if (totalCost > 0) {
      await this.credits.consumeCredits(this.owner(agentCall), totalCost, {
        idempotencyKey: `call-cost:${call.id}`,
        source: "telnyx.detail_records.call",
      });
    }

    await this.calls.updateCost(call.callControlId, totalCost, {
      // The same envelope the webhook stores, so the call detail view reads one
      // shape whichever path priced the call. `detail_records` is the provider
      // record type these numbers came from.
      total_cost: String(providerCostUsd),
      billed_duration_secs: this.billedSeconds(legs),
      source: "detail_records",
      ringeeCostBreakdown: {
        ...breakdown,
        callProfitMultiplier: apiConfiguration.CALL_PROFIT_MARGIN,
        recordingProfitMultiplier:
          apiConfiguration.CALL_RECORDING_PROFIT_MARGIN,
      },
      ringeeComputedTotalCost: breakdown.computedTotalCost,
      ringeeBalanceBefore: balanceBefore,
      ringeeChargeCapped: false,
    });

    this.logger.log(
      `💳 Agent call ${agentCall.id} voice leg settled: provider $${providerCostUsd}, charged ${totalCost}`,
    );
    return providerCostUsd;
  }

  // ── The recording ────────────────────────────────────────────

  /**
   * Stores the recording the provider kept for the call.
   *
   * Every agent call is recorded, unconditionally — the agent path does not
   * consult the workspace's `recordAllCalls` preference, which continues to
   * govern every other call surface. What was missing was the delivery: the
   * provider announces a saved recording as an event of the calling
   * application, so the audio existed on the provider and never reached Ringee.
   *
   * Best-effort by design. A recording that cannot be fetched must never hold
   * up the money, so a failure here is logged and the settlement stands.
   */
  private async recoverRecording(agentCall: AiVoiceAgentCall): Promise<void> {
    if (!agentCall.callId) return;

    try {
      const existing = await this.recordings.findByCallId(agentCall.callId);
      // Already stored. Re-processing would download and write a second copy.
      if (existing.some((recording) => recording.status === "completed")) {
        return;
      }

      const call = await this.calls.findById(agentCall.callId);
      if (!call?.callSessionId || !call.callControlId) return;

      const available = await this.provider.fetchRecordings(call.callSessionId);
      const recording = available.find((item) => item.downloadUrl);
      // Finalized after the call ends, so "none yet" is not "never recorded".
      if (!recording?.downloadUrl) return;

      await this.recordingProcessing.processCallRecording({
        callControlId: call.callControlId,
        recording: {
          publicUrl: recording.downloadUrl,
          privateUrl: recording.downloadUrl,
          recordingStartedAt: (recording.startedAt ?? new Date()).toISOString(),
          recordingEndedAt: (recording.endedAt ?? new Date()).toISOString(),
        },
      });
      this.logger.log(`💾 Agent call ${agentCall.id} recording recovered`);
    } catch (error) {
      this.logger.warn(
        `Could not recover the recording for agent call ${agentCall.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  /**
   * Writes down the conversation the provider's own records name, for a call
   * whose conversation webhook never arrived. Returns the row to keep working
   * from — the caller's copy is stale once this writes.
   */
  private async bindConversation(
    agentCall: AiVoiceAgentCall,
    records: VoiceAgentUsageRecord[],
  ): Promise<AiVoiceAgentCall> {
    if (agentCall.providerConversationId) return agentCall;

    const conversationId = records.find(
      (record) => record.conversationId,
    )?.conversationId;
    if (!conversationId) return agentCall;

    try {
      return await this.agentCalls.update(agentCall.id, {
        providerConversationId: conversationId,
      });
    } catch (error) {
      // `providerConversationId` is unique. Another row already claiming it
      // means this call is not the one that conversation belongs to — worth
      // knowing about, never worth failing the settlement over.
      this.logger.warn(
        `Could not bind conversation ${conversationId} to agent call ${agentCall.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return agentCall;
    }
  }

  private sum(
    records: VoiceAgentUsageRecord[],
    ...kinds: VoiceAgentUsageRecord["kind"][]
  ): number {
    return this.round(
      records
        .filter((record) => kinds.includes(record.kind))
        .reduce((total, record) => total + record.costUsd, 0),
    );
  }

  private billedSeconds(records: VoiceAgentUsageRecord[]): number {
    return records.reduce(
      (total, record) => total + (record.billedSeconds ?? 0),
      0,
    );
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
