import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiPipelineType,
  PendingActionPriority,
  PendingActionSource,
  PendingActionType,
} from "@ringee/database";
import {
  AiPipelineDefinition,
  AnalyzedCall,
  ConfidenceLevel,
  PendingActionDraft,
  PipelineRunInput,
  PipelineRunResult,
} from "../ai-pipeline.types";
import { FollowUpAiBatchService } from "./follow-up-ai-batch.service";

/** Outcomes that make a call count toward Follow-up in any context. */
const ELIGIBLE_OUTCOMES = new Set<string>([
  "interested",
  "follow_up",
  "callback_scheduled",
  "meeting_booked",
  "sale",
]);

function inDays(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

export interface FollowUpRunResult {
  enrichedCount: number;
  skipped: boolean;
  reason?: string;
  model?: string;
}

/**
 * Follow-up Recommendations — "Turn every call outcome into the next best
 * action."
 *
 * Layer 1 (onCallFinalized): immediate, rule-based, NO AI. Maps an outcome to
 * exactly one next-best-action with a sensible priority, due date and decay.
 *
 * Layer 2 (run): batch AI enrichment, gated behind AI_FOLLOWUP_AI_ENABLED.
 * Improves the rule drafts (priority/reason/message/next best action) and may
 * mark some for dismissal. Output is validated before it is returned.
 */
@Injectable()
export class FollowUpRecommendationsPipeline
  implements AiPipelineDefinition<FollowUpRunResult>
{
  private readonly logger = new Logger(FollowUpRecommendationsPipeline.name);

  readonly type = "follow_up_recommendations" as const;
  readonly pipelineEnum = AiPipelineType.follow_up_recommendations;
  readonly name = "Follow-up Recommendations";
  readonly valueProposition =
    "Turn every call outcome into the next best action.";
  readonly detailRoute = "/dashboard/ai-pipeline/follow-up-recommendations";
  readonly implemented = true;

  readonly cadence = {
    byTimeMs: 4 * 60 * 60 * 1000, // every 4h
    byNewEligible: 25, // or every 25 new eligible
    minEligibleForAuto: 5, // never auto-run below 5
  };

  constructor(private readonly aiBatch: FollowUpAiBatchService) {}

  isEligible(call: AnalyzedCall): boolean {
    if (call.durationBucket === "too_short") return false;
    return ELIGIBLE_OUTCOMES.has(call.outcomeClass);
  }

  confidence(eligibleCount: number): ConfidenceLevel {
    if (eligibleCount < 5) return "low";
    if (eligibleCount < 20) return "medium";
    return "high";
  }

  // ── Layer 1: rule-based, immediate, no AI ──
  onCallFinalized(call: AnalyzedCall): PendingActionDraft[] {
    if (call.durationBucket === "too_short") return [];

    const base = {
      source: PendingActionSource.rule,
      callId: call.callId,
      contactId: call.contactId,
    };
    const draft = (
      d: Omit<PendingActionDraft, "source" | "callId" | "contactId">,
    ): PendingActionDraft => ({
      ...base,
      ...d,
      groupKey: `followup:${call.callId}:${d.type}`,
    });

    switch (call.outcomeClass) {
      case "callback_scheduled":
        return [
          draft({
            type: PendingActionType.create_callback,
            priority: PendingActionPriority.high,
            title: "Make the scheduled callback",
            reason: "You agreed to call this contact back.",
            nextBestAction: "Call the contact at the agreed time.",
            dueAt: inDays(1),
            expiresAt: inDays(7),
          }),
        ];

      case "follow_up":
        return [
          draft({
            type: PendingActionType.send_follow_up,
            priority: PendingActionPriority.medium,
            title: "Send a follow-up message",
            reason: "The call ended with a follow-up to send.",
            suggestedMessage:
              "Hi, thanks for taking my call earlier. Following up as promised — let me know if you have any questions and we can find a time to continue the conversation.",
            nextBestAction: "Send the follow-up and propose next steps.",
            dueAt: inDays(1),
            expiresAt: inDays(14),
          }),
        ];

      case "interested": {
        const wantsInfo =
          call.intentSignals.includes("pricing_interest") ||
          call.intentSignals.includes("requested_info");
        return [
          wantsInfo
            ? draft({
                type: PendingActionType.send_pricing_or_info,
                priority: PendingActionPriority.high,
                title: "Send the requested information",
                reason: "The contact is interested and asked for details.",
                suggestedMessage:
                  "Hi, great speaking with you. As requested, I'll send over the details we discussed — happy to walk you through anything that needs clarifying.",
                nextBestAction:
                  "Send the materials, then follow up to book a meeting.",
                dueAt: inDays(1),
                expiresAt: inDays(10),
              })
            : draft({
                type: PendingActionType.book_meeting,
                priority: PendingActionPriority.high,
                title: "Book a meeting",
                reason: "The contact showed interest on the call.",
                nextBestAction: "Propose two time slots for a short meeting.",
                dueAt: inDays(2),
                expiresAt: inDays(14),
              }),
        ];
      }

      case "meeting_booked":
        // Confirmation/check only — no aggressive follow-up.
        return [
          draft({
            type: PendingActionType.review_call,
            priority: PendingActionPriority.low,
            title: "Confirm the upcoming meeting",
            reason: "A meeting was booked on this call.",
            nextBestAction: "Send a calendar invite / confirmation.",
            dueAt: inDays(1),
            expiresAt: inDays(5),
          }),
        ];

      case "sale":
        return [
          draft({
            type: PendingActionType.update_crm,
            priority: PendingActionPriority.medium,
            title: "Log the sale and hand off",
            reason: "This call resulted in a sale.",
            nextBestAction: "Update the CRM and start the handoff/onboarding.",
            dueAt: inDays(1),
            expiresAt: inDays(14),
          }),
        ];

      case "not_interested": {
        // Only suggest a soft nurture path if the transcript hints at openness.
        const softOpening =
          call.intentSignals.includes("positive") ||
          call.intentSignals.includes("requested_info");
        if (!softOpening) return [];
        return [
          draft({
            type: PendingActionType.add_to_nurture,
            priority: PendingActionPriority.low,
            title: "Add to nurture",
            reason:
              "Not interested now, but the conversation left an opening for later.",
            nextBestAction: "Add to a long-term nurture sequence.",
            expiresAt: inDays(30),
          }),
        ];
      }

      // no_answer, voicemail, wrong_number, gatekeeper → none (campaign
      // retry/voicemail flows own these).
      default:
        return [];
    }
  }

  // ── Layer 2: batch AI enrichment, gated behind a feature flag ──
  async run(
    input: PipelineRunInput,
  ): Promise<PipelineRunResult<FollowUpRunResult>> {
    const eligibleCount = input.eligibleCalls.length;
    const confidence = this.confidence(eligibleCount);

    if (!apiConfiguration.AI_FOLLOWUP_AI_ENABLED) {
      return {
        result: {
          enrichedCount: 0,
          skipped: true,
          reason: "AI layer disabled (AI_FOLLOWUP_AI_ENABLED=false)",
        },
        confidence,
        pendingActions: [],
        eligibleCount,
      };
    }

    try {
      const { enrichment, model } = await this.aiBatch.enrich(input);

      // Merge AI enrichment onto the rule drafts (same groupKey), so the AI
      // layer improves existing rule actions rather than creating parallel
      // ones. dismiss drops the action from this run's output.
      const drafts: PendingActionDraft[] = [];
      for (const call of input.eligibleCalls) {
        const e = enrichment.get(call.callId);
        if (e?.dismiss) continue;
        for (const d of this.onCallFinalized(call)) {
          drafts.push({
            ...d,
            source: e ? PendingActionSource.ai : d.source,
            priority: e?.priority ?? d.priority,
            reason: e?.reason ?? d.reason,
            suggestedMessage: e?.suggestedMessage ?? d.suggestedMessage,
            nextBestAction: e?.nextBestAction ?? d.nextBestAction,
            dueAt: e?.dueInDays != null ? inDays(e.dueInDays) : d.dueAt,
          });
        }
      }

      return {
        result: { enrichedCount: enrichment.size, skipped: false, model },
        confidence,
        pendingActions: drafts,
        eligibleCount,
      };
    } catch (err) {
      this.logger.error(`Follow-up AI batch failed: ${(err as Error).message}`);
      return {
        result: {
          enrichedCount: 0,
          skipped: true,
          reason: `AI batch error: ${(err as Error).message}`,
        },
        confidence,
        pendingActions: [],
        eligibleCount,
      };
    }
  }
}
