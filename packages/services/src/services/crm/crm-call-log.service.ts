import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  Call,
  CallOutcome,
  ContactRepository,
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
  return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

@Injectable()
export class CrmCallLogService {
  private readonly logger = new Logger(CrmCallLogService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly matching: CrmMatchingService,
    private readonly syncRepo: CrmCallSyncRepository,
    private readonly outbox: CrmOutboxRepository,
    private readonly contactRepo: ContactRepository,
  ) {}

  async handleCallCompleted(
    call: Call,
    opts: {
      recordingUrl?: string | null;
      notes?: string | null;
      agentName?: string | null;
      transcript?: string | null;
      transcriptUrl?: string | null;
      summary?: string | null;
      insights?: Record<string, unknown> | null;
    } = {},
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
    opts: {
      recordingUrl?: string | null;
      notes?: string | null;
      agentName?: string | null;
      transcript?: string | null;
      transcriptUrl?: string | null;
      summary?: string | null;
      insights?: Record<string, unknown> | null;
    } = {},
  ): Promise<void> {
    if (!call.userId) return;
    if ((call.durationSeconds ?? 0) < MIN_DURATION_SECONDS) return;

    const ctx: OwnershipContext = {
      userId: call.userId,
      organizationId: call.organizationId ?? null,
    };

    const connections = await this.connections.listActive(ctx);
    if (connections.length === 0) return;

    const direction: "inbound" | "outbound" = ["inbound", "incoming"].includes(
      call.direction ?? "",
    )
      ? "inbound"
      : "outbound";

    const counterpartPhone =
      direction === "outbound" ? call.toNumber : call.fromNumber;

    // If Ringee already has a contact for this call, propagate its
    // name/email to the CRM so the partner gets created with real data
    // instead of just the phone number.
    const ringeeContact = call.contactId
      ? await this.contactRepo.findById(call.contactId).catch(() => null)
      : null;

    for (const connection of connections) {
      const matchResult = await this.matching.resolveByPhone(
        connection,
        counterpartPhone,
        call.contactId,
      );

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
              displayName: ringeeContact?.name ?? null,
              firstName: ringeeContact?.firstName ?? null,
              lastName: ringeeContact?.lastName ?? null,
              email: ringeeContact?.email ?? null,
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
        transcript: opts.transcript ?? null,
        transcriptUrl: opts.transcriptUrl ?? null,
        summary: opts.summary ?? null,
        insights: opts.insights ?? null,
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
        continue;
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

  async enqueueRecordingNote(
    callId: string,
    recordingUrl: string,
  ): Promise<void> {
    const syncs = await this.syncRepo.listByCall(callId);
    if (!syncs || syncs.length === 0) return;

    for (const sync of syncs) {
      if (
        sync.status === "pending" ||
        sync.status === "needs_resolution" ||
        sync.status === "failed"
      ) {
        const currentPayload = sync.payloadSnapshot as any;
        currentPayload.recordingUrl = recordingUrl;
        await this.syncRepo.upsertPending({
          connectionId: sync.connectionId,
          provider: sync.provider,
          callId: sync.callId,
          idempotencyKey: sync.idempotencyKey,
          payload: currentPayload,
        });
        continue;
      }

      if (!sync.externalRecordId) continue; // If an active operation is midway or lacks it

      // We enqueue a note.sync for the given record
      await this.outbox.enqueue({
        connectionId: sync.connectionId,
        provider: sync.provider,
        kind: "note.sync",
        subjectId: sync.id,
        payload: {
          recordId: sync.externalRecordId,
          recordType: sync.externalRecordType,
          title: "Call Recording Link",
          body: `Recording link for call: ${recordingUrl}`,
        } as Record<string, unknown>,
        dedupeKey: `note.sync:${sync.connectionId}:${callId}:recording:v1`,
      });
    }
  }

  /**
   * Attach a call's transcript to the CRM record. Transcription finishes
   * asynchronously (after the recording is processed), so this runs separately
   * from the initial call log:
   * - if the call.log is still pending, fold the transcript into its payload so
   *   the single note carries it;
   * - if the call.log already synced, push the transcript as its own note.
   * Mirrors {@link enqueueRecordingNote}; safe to call more than once (the
   * note.sync is dedupe-keyed).
   */
  async enqueueTranscriptSync(
    callId: string,
    opts: { transcript?: string | null; transcriptUrl?: string | null },
  ): Promise<void> {
    const transcript = opts.transcript?.trim() || null;
    const transcriptUrl = opts.transcriptUrl?.trim() || null;
    if (!transcript && !transcriptUrl) return;

    const syncs = await this.syncRepo.listByCall(callId);
    if (!syncs || syncs.length === 0) return;

    for (const sync of syncs) {
      if (
        sync.status === "pending" ||
        sync.status === "needs_resolution" ||
        sync.status === "failed"
      ) {
        const currentPayload = sync.payloadSnapshot as any;
        if (transcript) currentPayload.transcript = transcript;
        if (transcriptUrl) currentPayload.transcriptUrl = transcriptUrl;
        await this.syncRepo.upsertPending({
          connectionId: sync.connectionId,
          provider: sync.provider,
          callId: sync.callId,
          idempotencyKey: sync.idempotencyKey,
          payload: currentPayload,
        });
        continue;
      }

      // Only the terminal, successfully-linked syncs can receive a follow-up
      // note; skip in-progress ones (drain will pick the payload up if pending).
      if (sync.status !== "done" || !sync.externalRecordId) continue;

      const body = transcript
        ? transcriptUrl
          ? `[View transcript](${transcriptUrl})\n\n${transcript}`
          : transcript
        : `[View transcript](${transcriptUrl})`;

      await this.outbox.enqueue({
        connectionId: sync.connectionId,
        provider: sync.provider,
        kind: "note.sync",
        subjectId: sync.id,
        payload: {
          recordId: sync.externalRecordId,
          recordType: sync.externalRecordType,
          title: "Call Transcript",
          body,
        } as Record<string, unknown>,
        dedupeKey: `note.sync:${sync.connectionId}:${callId}:transcript:v1`,
      });
    }
  }
}
