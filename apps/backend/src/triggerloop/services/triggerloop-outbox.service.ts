import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OutboxKind, TriggerLoopOutboxRepository } from "@ringee/database";
import { TriggerLoopClient } from "./triggerloop.client";

export interface OutboxSendInput {
  kind: OutboxKind;
  endpoint: string;
  payload: Record<string, unknown>;
}

const MAX_RETRY_ATTEMPTS = 10;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;
const RESERVATION_WINDOW_MS = 60_000;

/**
 * Durable outbox for outbound TriggerLoop calls.
 *
 * Every outbound call flows through here:
 *   1. Attempt direct delivery via TriggerLoopClient (which itself retries
 *      transient failures a few times with small backoff).
 *   2. If the direct send returns { ok: false, retryable: true } — i.e. the
 *      product path saw a network blip, 5xx, or rate limit — persist the
 *      payload to `TriggerLoopOutboxEvent` so a background worker will keep
 *      retrying it with exponential backoff.
 *   3. If the send returns { ok: false, retryable: false } — i.e. 4xx caused
 *      by our payload — log and drop, since re-sending won't help.
 *
 * The `drainOnce` method is called by the worker on an interval to replay
 * persisted rows.
 */
@Injectable()
export class TriggerLoopOutboxService {
  private readonly logger = new Logger(TriggerLoopOutboxService.name);

  constructor(
    private readonly client: TriggerLoopClient,
    private readonly outbox: TriggerLoopOutboxRepository,
  ) {}

  async send(input: OutboxSendInput): Promise<void> {
    const result = await this.client.sendRaw(input.endpoint, input.payload);
    if (result.ok) return;

    if (!result.retryable) {
      this.logger.warn(
        `TriggerLoop ${input.kind} to ${input.endpoint} dropped (non-retryable status ${result.status}): ${result.error}`,
      );
      return;
    }

    // Persist for background retry. Enqueue failures must not bubble into
    // the product path — we've already lost the direct send, so the caller
    // shouldn't also get an exception.
    try {
      await this.outbox.enqueue({
        kind: input.kind,
        endpoint: input.endpoint,
        payload: input.payload as Prisma.InputJsonValue,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue outbox row for ${input.kind} ${input.endpoint}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Process a batch of due outbox rows. Intended to be invoked on an
   * interval by the worker. Safe to run concurrently across multiple
   * workers because `claimDueBatch` atomically bumps `nextAttemptAt` by a
   * reservation window before returning the rows.
   */
  async drainOnce(batchSize = 50): Promise<{
    processed: number;
    sent: number;
    retried: number;
    dropped: number;
  }> {
    const now = new Date();
    const batch = await this.outbox.claimDueBatch(now, batchSize);
    if (batch.length === 0) {
      return { processed: 0, sent: 0, retried: 0, dropped: 0 };
    }

    let sent = 0;
    let retried = 0;
    let dropped = 0;

    for (const row of batch) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const result = await this.client.sendRaw(row.endpoint, payload);

      if (result.ok) {
        await this.outbox.markSent(row.id);
        sent += 1;
        continue;
      }

      if (!result.retryable) {
        await this.outbox.markFailed(
          row.id,
          `non-retryable ${result.status}: ${result.error ?? "unknown"}`,
        );
        dropped += 1;
        continue;
      }

      // Row.attemptCount was already incremented by claimDueBatch.
      if (row.attemptCount >= MAX_RETRY_ATTEMPTS) {
        await this.outbox.markFailed(
          row.id,
          `exhausted after ${row.attemptCount} attempts: ${result.error ?? "unknown"}`,
        );
        dropped += 1;
        continue;
      }

      const backoff = Math.min(
        BASE_RETRY_DELAY_MS * 2 ** Math.max(0, row.attemptCount - 1),
        MAX_RETRY_DELAY_MS,
      );
      const nextAttemptAt = new Date(Date.now() + backoff);
      await this.outbox.scheduleRetry(
        row.id,
        nextAttemptAt,
        result.error ?? `status ${result.status ?? "network"}`,
      );
      retried += 1;
    }

    return { processed: batch.length, sent, retried, dropped };
  }

  get reservationWindowMs(): number {
    return RESERVATION_WINDOW_MS;
  }
}
