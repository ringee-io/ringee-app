import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  Call,
  CallRepository,
  CrmConnection,
  CrmContactLinkRepository,
  CrmOutboxRepository,
  PublicRecordingRepository,
  RecordingRepository,
  UserRepository,
} from "@ringee/database";
import {
  CrmRecordRef,
  normalizePhoneE164,
  OwnershipContext,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";
import { CustomIntegrationOutboundService } from "../custom-integrations/custom-integration-outbound.service";
import { buildRecordingEventData } from "../custom-integrations/custom-integration-event-builders";

/**
 * Sanitise a string for safe use as a file-path segment.
 * Replaces anything that isn't alphanumeric, dot, dash, or underscore
 * with a dash, collapses consecutive dashes, and trims dashes from ends.
 */
function sanitizePathSegment(s: string): string {
  return (
    s
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function buildRecordingFileName(
  callerName: string | null | undefined,
  outcome: string | null | undefined,
  recordingId: string,
): string {
  const who = sanitizePathSegment(callerName || "unknown");
  const out = sanitizePathSegment(outcome || "unknown-outcome");
  const recId = sanitizePathSegment(recordingId);
  return `${who}-${out}-${recId}.mp3`;
}

@Injectable()
export class CrmRecordingUploadService {
  private readonly logger = new Logger(CrmRecordingUploadService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly callRepo: CallRepository,
    private readonly linkRepo: CrmContactLinkRepository,
    private readonly outbox: CrmOutboxRepository,
    private readonly userRepo: UserRepository,
    private readonly recordingRepo: RecordingRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
    private readonly publicRecordingRepo: PublicRecordingRepository,
  ) {}

  async enqueueRecordingUpload(
    callId: string,
    recordingId: string,
    publicRecordingUrl: string,
  ): Promise<void> {
    try {
      const call = await this.callRepo.findById(callId);
      if (!call || !call.userId) return;

      const ctx: OwnershipContext = {
        userId: call.userId,
        organizationId: call.organizationId ?? null,
      };

      // Fire recording.ready to any Custom Integration subscribed to it.
      try {
        const recording = await this.recordingRepo.findById?.(recordingId);
        if (recording) {
          void this.customIntegrationOutbound.enqueue({
            ctx,
            eventEnum: "recording_ready",
            subjectId: recordingId,
            data: buildRecordingEventData(recording, publicRecordingUrl),
          });
        }
      } catch (err) {
        this.logger.debug(
          `custom-integrations recording.ready enqueue skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const connections = await this.connections.listActive(ctx);
      if (connections.length === 0) return;

      const callerPhone = counterpartPhone(call);
      const fileName = await this.recordingFileName(call, recordingId);

      // Get CRM links for this contact
      const links = call.contactId
        ? await this.linkRepo.listByContact(call.contactId)
        : [];

      // Fallback lookup key: the counterpart's phone. Links created at call
      // time are keyed by phone and (for historical calls) may lack a
      // contactId, so listByContact alone misses them.
      const counterpartE164 = normalizePhoneE164(callerPhone ?? "");

      for (const connection of connections) {
        // A portal can decline the scope uploads need (HubSpot's optional
        // `files.write`); the connection records that at connect time.
        if (!this.connections.allows(connection, "supportsRecordingUpload")) {
          continue;
        }

        let link = links.find((l) => l.connectionId === connection.id);
        if (!link && counterpartE164) {
          link =
            (await this.linkRepo.findByPhone(connection.id, counterpartE164)) ??
            undefined;
        }
        if (!link) {
          this.logger.debug(
            `no CRM link for contact=${call.contactId} on connection=${connection.id}, skipping recording upload`,
          );
          continue;
        }

        await this.enqueueUpload(connection, {
          callId,
          recordingId,
          publicRecordingUrl,
          fileName,
          record: {
            externalId: link.externalId,
            externalType: link.externalType,
          },
        });
      }
    } catch (err) {
      this.logger.error(
        `recording upload enqueue failed for call=${callId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Sends the recording of a call whose log just reached the CRM, to the
   * record the log landed on. The recording is usually processed before the
   * agent saves the outcome, and for a person the log had to create there was
   * nothing to attach it to then. The dedupe key is the upload's own, so a
   * recording already sent is not sent again. Nothing to do until the
   * recording exists: its own upload then finds the record linked.
   */
  async enqueueForLoggedCall(
    call: Call,
    connection: CrmConnection,
    record: CrmRecordRef,
  ): Promise<void> {
    if (record.externalType === "list") return;
    if (!this.connections.allows(connection, "supportsRecordingUpload")) {
      return;
    }
    const [recordings, publicRecording] = await Promise.all([
      this.recordingRepo.findByCallId(call.id),
      this.publicRecordingRepo.findLatestByCallId(call.id),
    ]);
    const recording = recordings
      .filter((candidate) => candidate.status === "completed")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!recording || !publicRecording) return;

    await this.enqueueUpload(connection, {
      callId: call.id,
      recordingId: recording.id,
      publicRecordingUrl: publicRecording.url,
      fileName: await this.recordingFileName(call, recording.id),
      record,
    });
  }

  /** The file is named after the member, else the other party's number. */
  private async recordingFileName(
    call: Call,
    recordingId: string,
  ): Promise<string> {
    let callerName: string | null = null;
    try {
      const user = call.userId
        ? await this.userRepo.findById(call.userId)
        : null;

      if (user) {
        callerName = `${user.firstName} ${user.lastName}`.trim();
      }
    } catch {
      // Non-fatal
    }

    if (!callerName) callerName = counterpartPhone(call) ?? null;

    return buildRecordingFileName(callerName, call.outcome, recordingId);
  }

  private async enqueueUpload(
    connection: CrmConnection,
    input: {
      callId: string;
      recordingId: string;
      publicRecordingUrl: string;
      fileName: string;
      record: CrmRecordRef;
    },
  ): Promise<void> {
    const idempotencyKey = createHash("sha1")
      .update(`${connection.id}|${input.recordingId}|v1`)
      .digest("hex");

    const payload = {
      idempotencyKey,
      recordingId: input.recordingId,
      callId: input.callId,
      fileName: input.fileName,
      publicRecordingUrl: input.publicRecordingUrl,
      linkedRecords: [input.record],
    };

    await this.outbox.enqueue({
      connectionId: connection.id,
      provider: connection.provider,
      kind: "recording.upload",
      subjectId: input.recordingId,
      payload: payload as Record<string, unknown>,
      dedupeKey: `recording.upload:${connection.id}:${input.recordingId}:v1`,
    });
  }
}

/** The other party's number: who was called, or who called in. */
function counterpartPhone(call: Call): string | null {
  return ["outbound", "outgoing"].includes(call.direction ?? "")
    ? call.toNumber
    : call.fromNumber;
}
