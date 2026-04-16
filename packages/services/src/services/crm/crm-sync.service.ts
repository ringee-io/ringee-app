import { Injectable, Logger } from "@nestjs/common";
import {
  CrmCallSync,
  CrmCallSyncRepository,
  CrmConnection,
  CrmOutboxEvent,
  CrmOutboxRepository,
} from "@ringee/database";
import type {
  CrmCallLogInput,
  CrmNoteInput,
  CrmRecordRef,
  CrmTaskInput,
} from "@ringee/platform";
import {
  CrmError,
  CrmProviderRegistry,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

const MAX_OUTBOX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly connections: CrmConnectionService,
    private readonly outbox: CrmOutboxRepository,
    private readonly syncRepo: CrmCallSyncRepository,
  ) {}

  async drain(batchSize = 20): Promise<number> {
    const events = await this.outbox.claimDueBatch(new Date(), batchSize);
    for (const event of events) {
      await this.processEvent(event);
    }
    return events.length;
  }

  private async processEvent(event: CrmOutboxEvent): Promise<void> {
    try {
      switch (event.kind) {
        case "call.log":
          await this.processCallLog(event);
          break;
        case "note.sync":
          await this.processNoteSync(event);
          break;
        case "task.sync":
          await this.processTaskSync(event);
          break;
        default:
          this.logger.warn(`unknown outbox kind: ${event.kind}`);
          await this.outbox.markFailed(event.id, `unknown kind: ${event.kind}`);
      }
    } catch (err) {
      await this.handleFailure(event, err);
    }
  }

  private async processCallLog(event: CrmOutboxEvent): Promise<void> {
    const payload = event.payload as { syncId?: string } | null;
    const syncId = payload?.syncId;
    if (!syncId) {
      await this.outbox.markFailed(event.id, "missing syncId in payload");
      return;
    }

    const sync = await this.syncRepo.findById(syncId);
    if (!sync) {
      await this.outbox.markFailed(event.id, `sync ${syncId} not found`);
      return;
    }
    if (sync.status === "done") {
      await this.outbox.markSent(event.id);
      return;
    }
    if (sync.status === "needs_resolution") {
      await this.outbox.markFailed(event.id, "needs user resolution");
      return;
    }

    const connection = await this.connections.findById(sync.connectionId);
    if (!connection || connection.status !== "active") {
      await this.outbox.markFailed(event.id, `connection ${sync.connectionId} not active`);
      return;
    }

    const provider = this.registry.get(connection.provider);
    await this.syncRepo.markInProgress(sync.id);

    const logInput = sync.payloadSnapshot as unknown as CrmCallLogInput;
    // Dates come back as strings from JSON.
    logInput.startedAt = new Date(logInput.startedAt);
    if (logInput.endedAt) logInput.endedAt = new Date(logInput.endedAt);

    const decrypted = await this.connections.decrypt(connection);

    try {
      const result = await provider.logCall(
        {
          accessToken: decrypted.accessToken,
          refreshToken: decrypted.refreshToken,
          accountId: connection.externalAccountId,
          connectionId: connection.id,
        },
        logInput,
      );

      await this.syncRepo.markDone(sync.id, {
        externalActivityId: result.externalId,
        externalRecordId: logInput.linkedRecords[0]?.externalId ?? result.externalId,
        externalRecordType: logInput.linkedRecords[0]?.externalType ?? result.externalType,
      });
      await this.connections.touchLastSync(connection.id);
      await this.outbox.markSent(event.id);
    } catch (err) {
      await this.handleCallLogError(event, sync, connection, err);
    }
  }

  private async processNoteSync(event: CrmOutboxEvent): Promise<void> {
    const payload = event.payload as {
      recordId?: string;
      recordType?: string;
      title?: string;
      body?: string;
    } | null;
    if (!payload?.recordId || !payload?.body) {
      await this.outbox.markFailed(event.id, "missing recordId or body");
      return;
    }
    if (!event.connectionId) {
      await this.outbox.markFailed(event.id, "missing connectionId");
      return;
    }

    const connection = await this.connections.findById(event.connectionId);
    if (!connection || connection.status !== "active") {
      await this.outbox.markFailed(event.id, "connection not active");
      return;
    }

    const provider = this.registry.get(connection.provider);
    const decrypted = await this.connections.decrypt(connection);

    const noteInput: CrmNoteInput = {
      recordId: payload.recordId,
      recordType: (payload.recordType as "person" | "company") ?? "person",
      title: payload.title ?? "Note from Ringee",
      body: payload.body,
    };

    await provider.addNote(
      {
        accessToken: decrypted.accessToken,
        refreshToken: decrypted.refreshToken,
        accountId: connection.externalAccountId,
        connectionId: connection.id,
      },
      noteInput,
    );

    await this.connections.touchLastSync(connection.id);
    await this.outbox.markSent(event.id);
  }

  private async processTaskSync(event: CrmOutboxEvent): Promise<void> {
    const payload = event.payload as {
      title?: string;
      body?: string | null;
      dueAt?: string | null;
      assigneeEmail?: string | null;
      linkedRecords?: CrmRecordRef[];
    } | null;
    if (!payload?.title) {
      await this.outbox.markFailed(event.id, "missing task title");
      return;
    }
    if (!event.connectionId) {
      await this.outbox.markFailed(event.id, "missing connectionId");
      return;
    }

    const connection = await this.connections.findById(event.connectionId);
    if (!connection || connection.status !== "active") {
      await this.outbox.markFailed(event.id, "connection not active");
      return;
    }

    const provider = this.registry.get(connection.provider);
    if (!provider.createTask) {
      await this.outbox.markFailed(event.id, `${connection.provider} does not support tasks`);
      return;
    }

    const decrypted = await this.connections.decrypt(connection);

    const taskInput: CrmTaskInput = {
      title: payload.title,
      body: payload.body ?? null,
      dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
      assigneeEmail: payload.assigneeEmail ?? null,
      linkedRecords: payload.linkedRecords ?? [],
    };

    await provider.createTask(
      {
        accessToken: decrypted.accessToken,
        refreshToken: decrypted.refreshToken,
        accountId: connection.externalAccountId,
        connectionId: connection.id,
      },
      taskInput,
    );

    await this.connections.touchLastSync(connection.id);
    await this.outbox.markSent(event.id);
  }

  private async handleCallLogError(
    event: CrmOutboxEvent,
    sync: CrmCallSync,
    connection: CrmConnection,
    err: unknown,
  ): Promise<void> {
    if (err instanceof CrmError) {
      const message = `${err.code}: ${err.message}`;
      if (err.code === "AUTH_REVOKED") {
        await this.connections.markStatus(connection.id, "revoked", err.code);
        await this.syncRepo.markStatus(sync.id, "failed", message);
        await this.outbox.markFailed(event.id, message);
        return;
      }
      if (err.code === "VALIDATION" || err.code === "CONFLICT" || err.code === "NOT_FOUND") {
        await this.syncRepo.markStatus(sync.id, "failed", message);
        await this.outbox.markFailed(event.id, message);
        return;
      }
      if (err.retryable && event.attemptCount + 1 < MAX_OUTBOX_ATTEMPTS) {
        const nextAttemptAt = this.computeBackoff(event.attemptCount + 1, err.retryAfterMs);
        await this.syncRepo.scheduleRetry(sync.id, nextAttemptAt, message);
        await this.outbox.scheduleRetry(event.id, nextAttemptAt, message);
        return;
      }
      await this.syncRepo.markStatus(sync.id, "failed", message);
      await this.outbox.markFailed(event.id, message);
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    if (event.attemptCount + 1 < MAX_OUTBOX_ATTEMPTS) {
      const nextAttemptAt = this.computeBackoff(event.attemptCount + 1);
      await this.syncRepo.scheduleRetry(sync.id, nextAttemptAt, message);
      await this.outbox.scheduleRetry(event.id, nextAttemptAt, message);
      return;
    }
    await this.syncRepo.markStatus(sync.id, "failed", message);
    await this.outbox.markFailed(event.id, message);
  }

  private async handleFailure(event: CrmOutboxEvent, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`outbox event ${event.id} failed: ${message}`);
    if (event.attemptCount + 1 < MAX_OUTBOX_ATTEMPTS) {
      await this.outbox.scheduleRetry(
        event.id,
        this.computeBackoff(event.attemptCount + 1),
        message,
      );
    } else {
      await this.outbox.markFailed(event.id, message);
    }
  }

  private computeBackoff(attempt: number, retryAfterMs?: number): Date {
    if (retryAfterMs && retryAfterMs > 0) {
      return new Date(Date.now() + Math.min(retryAfterMs, MAX_BACKOFF_MS));
    }
    const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * exp * 0.25);
    return new Date(Date.now() + exp + jitter);
  }
}
