import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  Call,
  CallOutcome,
  CrmCallSyncRepository,
  CrmOutboxRepository,
} from "@ringee/database";
import type { CrmCallLogInput } from "@ringee/platform";
import { OwnershipContext } from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";
import { CrmMatchingService } from "./crm-matching.service";

const MIN_DURATION_SECONDS = 3;

function outcomeLabel(outcome?: CallOutcome | null): string | null {
  if (!outcome) return null;
  return outcome
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

@Injectable()
export class CrmCallLogService {
  private readonly logger = new Logger(CrmCallLogService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly matching: CrmMatchingService,
    private readonly syncRepo: CrmCallSyncRepository,
    private readonly outbox: CrmOutboxRepository,
  ) {}

  /**
   * Call this after a Call transitions to a terminal state (hangup).
   * Fire-and-forget — never throws to the caller.
   */
  async handleCallCompleted(
    call: Call,
    opts: { recordingUrl?: string | null; notes?: string | null; agentName?: string | null } = {},
  ): Promise<void> {
    try {
      await this.enqueueCallLog(call, opts);
    } catch (err) {
      this.logger.error(
        `crm call-log failed to enqueue for call=${call.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async enqueueCallLog(
    call: Call,
    opts: { recordingUrl?: string | null; notes?: string | null; agentName?: string | null } = {},
  ): Promise<void> {
    if (!call.userId) return;
    if ((call.durationSeconds ?? 0) < MIN_DURATION_SECONDS) return;

    const ctx: OwnershipContext = {
      userId: call.userId,
      organizationId: call.organizationId ?? null,
    };

    const connection = await this.connections.findActive(ctx, "attio");
    if (!connection) return;

    const direction: "inbound" | "outbound" =
      call.direction === "inbound" ? "inbound" : "outbound";
    const counterpartPhone = direction === "outbound" ? call.toNumber : call.fromNumber;

    const matchResult = await this.matching.resolveByPhone(connection, counterpartPhone);

    const linkedRecords = matchResult.link
      ? [
          {
            externalId: matchResult.link.externalId,
            externalType: matchResult.link.externalType,
          },
        ]
      : [];

    const needsPersonCreation =
      linkedRecords.length === 0 && matchResult.phoneE164
        ? {
            phoneE164: matchResult.phoneE164,
            displayName: null,
            firstName: null,
            lastName: null,
            email: null,
          }
        : null;

    const idempotencyKey = createHash("sha1")
      .update(`${connection.id}|${call.id}|v1`)
      .digest("hex");

    const payload: CrmCallLogInput = {
      idempotencyKey,
      ringeeCallId: call.id,
      direction,
      from: call.fromNumber,
      to: call.toNumber,
      startedAt: call.startedAt ?? call.createdAt,
      endedAt: call.endedAt ?? null,
      durationSeconds: call.durationSeconds ?? null,
      outcome: call.outcome ?? null,
      outcomeLabel: outcomeLabel(call.outcome),
      notes: opts.notes ?? call.outcomeNote ?? null,
      recordingUrl: opts.recordingUrl ?? null,
      transcriptUrl: null,
      agentName: opts.agentName ?? null,
      agentEmail: null,
      linkedRecords,
      needsPersonCreation,
    };

    const sync = await this.syncRepo.upsertPending({
      connectionId: connection.id,
      provider: connection.provider,
      callId: call.id,
      idempotencyKey,
      payload: payload as unknown as Record<string, unknown>,
    });

    if (matchResult.candidates.length > 1 && !matchResult.link) {
      await this.syncRepo.markStatus(
        sync.id,
        "needs_resolution",
        `${matchResult.candidates.length} candidates — user must pick one`,
      );
      return;
    }

    await this.outbox.enqueue({
      connectionId: connection.id,
      provider: connection.provider,
      kind: "call.log",
      subjectId: sync.id,
      payload: { syncId: sync.id } as Record<string, unknown>,
      dedupeKey: `call.log:${connection.id}:${call.id}:v1`,
    });
  }

  async manualRetry(syncId: string): Promise<void> {
    const sync = await this.syncRepo.findById(syncId);
    if (!sync) return;
    await this.syncRepo.markStatus(sync.id, "pending", null);
    await this.outbox.enqueue({
      connectionId: sync.connectionId,
      provider: sync.provider,
      kind: "call.log",
      subjectId: sync.id,
      payload: { syncId: sync.id } as Record<string, unknown>,
      dedupeKey: `call.log:${sync.connectionId}:${sync.callId}:v1`,
      nextAttemptAt: new Date(),
    });
  }
}
