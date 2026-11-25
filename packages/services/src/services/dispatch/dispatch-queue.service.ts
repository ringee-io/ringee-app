import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AiVoiceAgentCallDispatchRepository,
  AiVoiceAgentCallDispatchState,
  AiVoiceAgentCallRepository,
} from "@ringee/database";
import {
  ProviderDispatchService,
  TRAFFIC_CLASSES,
  isDispatchSource,
  agedTrafficClass,
  resolveTrafficClass,
  workspaceOf,
  type DispatchSource,
} from "@ringee/platform";
import {
  DISPATCH_CLAIM_LEASE_MS,
  VoiceAgentCallService,
} from "../voice-agents/voice-agent-call.service";

export interface DispatchPassOptions {
  /** How long the pass may run before it hands back. */
  budgetMs: number;
  /** Seams for tests. */
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface DispatchPassSummary {
  placed: number;
  deferred: number;
  failed: number;
  inDoubt: number;
  skipped: number;
  expired: number;
  /** Calls still waiting when the pass ended. */
  remaining: number;
  /** Milliseconds until the next waiting call becomes due; `null` when none. */
  nextDueInMs: number | null;
}

const sleepFor = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Dispatches the agent calls waiting for provider capacity (CPS-006).
 *
 * One pass runs in the orchestrator, from the 15 s schedule or when an API
 * instance wakes it. Several can run at once without harm: a claim is a lease,
 * every grant comes from the one shared clock, and `VoiceAgentCallService`
 * places a call at most once.
 *
 * Fairness: only each workspace's best call competes, most urgent level first
 * and, within a level, the workspace served longest ago first — so a thousand
 * calls from one n8n workflow cannot make another workspace's one wait behind
 * them. Capacity is looked at without spending any (`peek`) before a call is
 * claimed, so a saturated clock costs a Redis read per workspace, not a write.
 */
@Injectable()
export class DispatchQueueService {
  private readonly logger = new Logger(DispatchQueueService.name);

  constructor(
    private readonly dispatch: ProviderDispatchService,
    private readonly dispatches: AiVoiceAgentCallDispatchRepository,
    private readonly calls: VoiceAgentCallService,
    private readonly agentCalls: AiVoiceAgentCallRepository,
  ) {}

  async runPass(options: DispatchPassOptions): Promise<DispatchPassSummary> {
    const now = options.nowMs ?? (() => Date.now());
    const sleep = options.sleep ?? sleepFor;
    const deadline = now() + options.budgetMs;
    const summary: DispatchPassSummary = {
      placed: 0,
      deferred: 0,
      failed: 0,
      inDoubt: 0,
      skipped: 0,
      expired: 0,
      remaining: 0,
      nextDueInMs: null,
    };

    // What waited too long is over, even while the queue is paused or off.
    summary.expired = (
      await this.dispatches.expireDue(new Date(now()), DISPATCH_CLAIM_LEASE_MS)
    ).length;

    const { settings } = await this.dispatch.getSettings();
    if (settings.queueEnabled && settings.mode !== "off") {
      while (now() < deadline) {
        const candidates = await this.dispatches.peekCandidates(
          new Date(now()),
          DISPATCH_CLAIM_LEASE_MS,
          25,
          settings.queueAgingMs,
        );
        if (candidates.length === 0) break;

        let progressed = false;
        let soonest = Number.POSITIVE_INFINITY;
        for (const candidate of candidates) {
          if (now() >= deadline) break;
          const source: DispatchSource = isDispatchSource(candidate.source)
            ? candidate.source
            : "agent_api";
          const workspace = {
            userId: candidate.userId,
            organizationId: candidate.organizationId,
          };

          const cls = agedTrafficClass(
            resolveTrafficClass(source, settings.classOverrides),
            candidate.queuedAt,
            now(),
            settings.queueAgingMs,
          );
          const capacity = await this.dispatch.peek({ source, workspace, cls });
          if (!capacity.free) {
            soonest = Math.min(soonest, capacity.retryAfterMs);
            continue;
          }

          const outcome = await this.calls.dispatchQueued(
            candidate.agentCallId,
            {
              maxWaitMs: Math.max(0, Math.min(500, deadline - now())),
            },
          );
          switch (outcome.outcome) {
            case "placed":
              summary.placed++;
              break;
            case "deferred":
              summary.deferred++;
              soonest = Math.min(soonest, outcome.retryAfterMs);
              break;
            case "failed":
              summary.failed++;
              break;
            case "in_doubt":
              summary.inDoubt++;
              break;
            default:
              summary.skipped++;
          }
          if (outcome.outcome !== "deferred" && outcome.outcome !== "skipped") {
            progressed = true;
          }
          // A grant moves the clocks and a refusal changes the order: look at
          // the queue again from the top rather than walk a stale list.
          if (outcome.outcome === "placed") break;
        }

        if (!progressed) {
          const wait = Math.min(
            Number.isFinite(soonest) ? soonest : 1_000,
            2_000,
            deadline - now(),
          );
          if (wait <= 0) break;
          await sleep(wait + Math.floor(Math.random() * 15));
        }
      }
    }

    const depth = await this.dispatches.depth(new Date(now()));
    summary.remaining = depth.reduce((sum, level) => sum + level.queued, 0);
    const next = summary.remaining
      ? await this.dispatches.earliestDueAt(new Date(now()))
      : null;
    summary.nextDueInMs = next ? Math.max(0, next.getTime() - now()) : null;
    if (
      summary.placed ||
      summary.failed ||
      summary.expired ||
      summary.inDoubt
    ) {
      this.logger.log(
        `Dispatch pass: ${summary.placed} placed, ${summary.deferred} deferred, ${summary.failed} failed, ${summary.inDoubt} in doubt, ${summary.expired} expired, ${summary.remaining} waiting`,
      );
    }
    return summary;
  }

  /**
   * The queue as staff see it (CPS-010). The number is masked: the view is for
   * judging what is waiting and why, not for reading a customer's leads.
   */
  async listQueue(options: {
    state?: AiVoiceAgentCallDispatchState;
    workspaceKey?: string;
    limit: number;
    offset: number;
  }) {
    const page = await this.dispatches.listForAdmin(options);
    return {
      total: page.total,
      rows: page.rows.map((row) => ({
        id: row.agentCallId,
        state: row.state,
        class: TRAFFIC_CLASSES[row.trafficLevel] ?? null,
        source: row.source,
        workspaceKey: row.workspaceKey,
        agentId: row.agentCall.agentId,
        to: maskNumber(row.agentCall.toNumber),
        status: row.agentCall.status,
        queuedAt: row.queuedAt,
        notBefore: row.notBefore,
        expiresAt: row.expiresAt,
        attempts: row.attempts,
        claimed: row.claimedAt !== null && row.state === "queued",
        reason: row.reason,
      })),
    };
  }

  /**
   * Cancels a waiting call on staff's behalf. It acts inside the call's OWN
   * workspace (rebuilt from the stored row), so the same rules apply as when
   * its owner cancels it: a call already dialing cannot be cancelled.
   */
  async cancelAsStaff(agentCallId: string) {
    const row = await this.agentCalls.findById(agentCallId);
    if (!row) throw new NotFoundException("AI voice agent call not found");
    return this.calls.cancelQueued(workspaceOf(row), agentCallId);
  }
}

/** `+12025550123` → `••••0123`. */
export function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : "••••";
}
