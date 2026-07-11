import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  Call,
  CallOutcome,
  CallRepository,
  ContactRepository,
  CrmCallSyncRepository,
  CrmOutboxRepository,
  NumberPurchasedRepository,
  UserRepository,
} from "@ringee/database";
import type { CrmCallLogInput } from "@ringee/platform";
import {
  normalizePhoneE164,
  OrchestratorService,
  OwnershipContext,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";
import { CrmMatchingService } from "./crm-matching.service";

const MIN_DURATION_SECONDS = 3;

function outcomeLabel(outcome?: CallOutcome | null): string | null {
  if (!outcome) return null;
  return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Turn a raw Call from/to value into a displayable E.164 number, or null.
 * WebRTC legs report SIP URIs — "sip:+1809...@sip.telnyx.com" (number
 * recoverable) or "sip:gencredXYZ@..." (browser credential, NOT a number) —
 * and Attio renders such values as an empty label, which is how "From:/To:"
 * showed up blank in the note. Credential usernames must never leak.
 */
function displayPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const sipUser = trimmed.match(/^sips?:([^@;]+)/i);
  const candidate = sipUser ? sipUser[1] : trimmed;
  if (!/^\+?[\d\s().-]+$/.test(candidate)) return null;
  return normalizePhoneE164(candidate);
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
    private readonly callRepo: CallRepository,
    private readonly userRepo: UserRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly orchestrator: OrchestratorService,
  ) {}

  /**
   * Resolve the note's From/To display numbers. Falls back to the presented
   * caller ID (outbound `from`, via the Call's callerId link) and the Ringee
   * contact's phone when the raw Call values aren't real numbers (SIP legs).
   */
  private async resolveDisplayNumbers(
    call: Call,
    direction: "inbound" | "outbound",
    contactPhone: string | null | undefined,
  ): Promise<{ from: string | null; to: string | null }> {
    let from = displayPhone(call.fromNumber);
    let to = displayPhone(call.toNumber);
    const counterpart = displayPhone(contactPhone);

    if (direction === "outbound") {
      to = to ?? counterpart;
      if (!from && call.callerIdId) {
        const number = await this.numberRepo
          .findById(call.callerIdId)
          .catch(() => null);
        from = displayPhone(number?.phoneNumber);
      }
    } else {
      from = from ?? counterpart;
    }
    return { from, to };
  }

  async handleCallCompleted(call: Call): Promise<void> {
    try {
      // Answered calls from a dialer UI hold their note at hangup: only the
      // sync snapshot is prepared, and the push happens exclusively when the
      // user saves an outcome / skips / closes (enqueueOutcomeUpdate) — there
      // is NO timed fallback. Calls that never get that request push straight
      // from the hangup webhook: unanswered attempts and desk-phone (SIP)
      // calls, which have no post-call view.
      const holdForDisposition =
        call.answeredAt != null && call.source !== "sip_device";
      await this.enqueueCallLog(call, { holdForDisposition });
    } catch (err) {
      this.logger.error(
        `crm call-log failed to enqueue for call=${call.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Start an on-demand Temporal crmDrain so the just-enqueued outbox events
   * push to the CRM now instead of on the next 60s schedule tick. Best-effort:
   * if Temporal is unreachable the scheduled drain still picks the events up.
   */
  private triggerImmediateDrain(callId: string): void {
    void this.orchestrator
      .triggerCrmDrain(`call:${callId}`)
      .catch((err: Error) =>
        this.logger.warn(
          `could not trigger immediate crm drain for call=${callId}: ${err.message}`,
        ),
      );
  }

  /** Best-effort display name of the agent who placed/received the call. */
  private async resolveAgentName(
    userId: string | null,
  ): Promise<string | null> {
    if (!userId) return null;
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return null;
      const name = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return name || null;
    } catch {
      return null;
    }
  }

  async enqueueCallLog(
    call: Call,
    opts: {
      meetingUrl?: string | null;
      /**
       * Prepare the sync snapshot but do NOT enqueue the outbox push — the
       * user's post-call request (save/skip/close, campaign dispose) fires it
       * via enqueueOutcomeUpdate. Recording/transcript folds keep working
       * against the prepared snapshot in the meantime.
       */
      holdForDisposition?: boolean;
      /**
       * Human label for the disposition when the Call has no CallOutcome —
       * campaign dispositions can use custom codes outside the enum.
       */
      fallbackOutcomeLabel?: string | null;
    } = {},
  ): Promise<void> {
    if (!call.userId) return;
    // Skip only trivially-short *answered* calls with no disposition (accidental
    // connects). Always log unanswered attempts (no answer / voicemail / etc.)
    // and anything the agent dispositioned — those belong in the CRM.
    const answered = call.answeredAt != null;
    const durationSeconds = call.durationSeconds ?? 0;
    const hasOutcome = call.outcome != null;
    if (answered && durationSeconds < MIN_DURATION_SECONDS && !hasOutcome) {
      return;
    }

    const agentName = await this.resolveAgentName(call.userId);

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

    let enqueuedNow = false;

    // If Ringee already has a contact for this call, propagate its
    // name/email to the CRM so the partner gets created with real data
    // instead of just the phone number.
    const ringeeContact = call.contactId
      ? await this.contactRepo.findById(call.contactId).catch(() => null)
      : null;

    const { from, to } = await this.resolveDisplayNumbers(
      call,
      direction,
      ringeeContact?.phoneNumber,
    );

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
        from,
        to,
        startedAt: call.startedAt ?? call.createdAt,
        endedAt: call.endedAt ?? null,
        durationSeconds: call.durationSeconds ?? null,
        outcome: call.outcome ?? null,
        outcomeLabel:
          outcomeLabel(call.outcome) ?? opts.fallbackOutcomeLabel ?? null,
        notes: call.outcomeNote ?? null,
        recordingUrl: null,
        transcript: null,
        transcriptUrl: null,
        summary: null,
        insights: null,
        agentName: agentName ?? null,
        agentEmail: null,
        meetingUrl: opts.meetingUrl ?? null,
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

      // Held notes only get their outbox event from the user's post-call
      // request (enqueueOutcomeUpdate) — never from the hangup webhook.
      if (opts.holdForDisposition) continue;

      await this.outbox.enqueue({
        connectionId: connection.id,
        provider: connection.provider,
        kind: "call.log",
        subjectId: sync.id,
        payload: { syncId: sync.id } as Record<string, unknown>,
        dedupeKey: `call.log:${connection.id}:${call.id}:v1`,
      });
      enqueuedNow = true;
    }

    // Due-now events (unanswered hangups, dispositions with no prior sync)
    // shouldn't wait for the next scheduled drain tick.
    if (enqueuedNow) this.triggerImmediateDrain(call.id);
  }

  /**
   * Fold the finalized disposition (outcome, notes, duration, agent) into the
   * call-log note and push it to the CRM immediately — this fires the moment
   * the user saves an outcome OR skips/closes the post-call view (and when a
   * campaign disposition is submitted). Mirrors {@link enqueueRecordingNote}:
   * - pending/failed sync → refresh the snapshot and enqueue due now;
   * - already-synced note → append a compact follow-up (late disposition);
   * - no sync yet → enqueue the log now with the finalized call.
   * Every path ends by kicking an on-demand Temporal crmDrain, so the note
   * lands in the CRM within seconds instead of on the next schedule tick.
   * Safe to call more than once (idempotency + dedupe keys).
   */
  async enqueueOutcomeUpdate(
    callId: string,
    opts: {
      meetingUrl?: string | null;
      /** Disposition label used when the Call has no CallOutcome (custom campaign codes). */
      fallbackOutcomeLabel?: string | null;
    } = {},
  ): Promise<void> {
    const call = await this.callRepo.findById(callId).catch(() => null);
    if (!call) return;
    const meetingUrl = opts.meetingUrl?.trim() || null;
    const label =
      outcomeLabel(call.outcome) ?? opts.fallbackOutcomeLabel ?? null;

    const syncs = await this.syncRepo.listByCall(callId);
    if (!syncs || syncs.length === 0) {
      // enqueueCallLog fires due-now events and triggers the drain itself.
      await this.enqueueCallLog(call, {
        meetingUrl,
        fallbackOutcomeLabel: opts.fallbackOutcomeLabel,
      });
      return;
    }

    const agentName = await this.resolveAgentName(call.userId);

    // Re-resolve the display numbers so snapshots that froze a raw SIP URI
    // (WebRTC legs) get the clean E.164 values before the note goes out.
    const direction: "inbound" | "outbound" = ["inbound", "incoming"].includes(
      call.direction ?? "",
    )
      ? "inbound"
      : "outbound";
    const contact = call.contactId
      ? await this.contactRepo.findById(call.contactId).catch(() => null)
      : null;
    const { from, to } = await this.resolveDisplayNumbers(
      call,
      direction,
      contact?.phoneNumber,
    );

    for (const sync of syncs) {
      if (sync.status === "pending" || sync.status === "failed") {
        const currentPayload = sync.payloadSnapshot as Record<string, unknown>;
        currentPayload.from = from;
        currentPayload.to = to;
        currentPayload.outcome = call.outcome ?? null;
        currentPayload.outcomeLabel = label;
        currentPayload.notes = call.outcomeNote ?? currentPayload.notes ?? null;
        currentPayload.durationSeconds =
          call.durationSeconds ?? currentPayload.durationSeconds ?? null;
        currentPayload.endedAt = call.endedAt ?? currentPayload.endedAt ?? null;
        if (agentName && !currentPayload.agentName)
          currentPayload.agentName = agentName;
        if (meetingUrl) currentPayload.meetingUrl = meetingUrl;

        await this.syncRepo.upsertPending({
          connectionId: sync.connectionId,
          provider: sync.provider,
          callId: sync.callId,
          idempotencyKey: sync.idempotencyKey,
          payload: currentPayload,
        });
        // The hangup log was held for this request; the disposition is in
        // now, so let it go.
        await this.outbox.enqueue({
          connectionId: sync.connectionId,
          provider: sync.provider,
          kind: "call.log",
          subjectId: sync.id,
          payload: { syncId: sync.id } as Record<string, unknown>,
          dedupeKey: `call.log:${sync.connectionId}:${sync.callId}:v1`,
          nextAttemptAt: new Date(),
        });
        continue;
      }

      // Note already in the CRM (e.g. outcome saved again later from history)
      // — append a compact disposition note so the info still lands.
      if (sync.status !== "done" || !sync.externalRecordId) continue;

      const parts: string[] = [];
      if (label) parts.push(`**Outcome:** ${label}`);
      if (call.outcomeNote && call.outcomeNote.trim()) {
        if (parts.length > 0) parts.push("");
        parts.push("**Notes**");
        parts.push(call.outcomeNote.trim());
      }
      if (meetingUrl) {
        if (parts.length > 0) parts.push("");
        parts.push(`[Join meeting](${meetingUrl})`);
      }
      if (parts.length === 0) continue;

      await this.outbox.enqueue({
        connectionId: sync.connectionId,
        provider: sync.provider,
        kind: "note.sync",
        subjectId: sync.id,
        payload: {
          recordId: sync.externalRecordId,
          recordType: sync.externalRecordType,
          title: "Call Disposition",
          body: parts.join("\n"),
        } as Record<string, unknown>,
        dedupeKey: `note.sync:${sync.connectionId}:${callId}:disposition:v1`,
      });
    }

    this.triggerImmediateDrain(callId);
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
