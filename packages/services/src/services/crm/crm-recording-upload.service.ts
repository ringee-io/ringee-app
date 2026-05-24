import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  CallRepository,
  CrmContactLinkRepository,
  CrmOutboxRepository,
  RecordingRepository,
  UserRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";
import { CustomIntegrationOutboundService } from "../custom-integrations/custom-integration-outbound.service";
import { buildRecordingEventData } from "../custom-integrations/custom-integration-event-builders";

/**
 * Sanitise a string for safe use as a file-path segment.
 * Replaces anything that isn't alphanumeric, dot, dash, or underscore
 * with a dash, collapses consecutive dashes, and trims dashes from ends.
 */
function sanitizePathSegment(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
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
  ) { }

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

      // Resolve caller identity for folder naming
      let callerName: string | null = null;
      const callerPhone = ["outbound", "outgoing"].includes(call.direction ?? "") ? call.toNumber : call.fromNumber;

      try {
        const user = await this.userRepo.findById(call.userId);

        if (user) {
          callerName = `${user.firstName} ${user.lastName}`.trim();
        }
      } catch {
        // Non-fatal
      }

      if (!callerName) callerName = callerPhone ?? null;

      const fileName = buildRecordingFileName(
        callerName,
        call.outcome,
        recordingId,
      );

      // Get CRM links for this contact
      const links = call.contactId
        ? await this.linkRepo.listByContact(call.contactId)
        : [];

      for (const connection of connections) {
        const link = links.find((l) => l.connectionId === connection.id);
        if (!link) {
          this.logger.debug(
            `no CRM link for contact=${call.contactId} on connection=${connection.id}, skipping recording upload`,
          );
          continue;
        }

        const idempotencyKey = createHash("sha1")
          .update(`${connection.id}|${recordingId}|v1`)
          .digest("hex");

        const payload = {
          idempotencyKey,
          recordingId,
          callId,
          fileName,
          publicRecordingUrl,
          linkedRecords: [
            {
              externalId: link.externalId,
              externalType: link.externalType,
            },
          ],
        };

        await this.outbox.enqueue({
          connectionId: connection.id,
          provider: connection.provider,
          kind: "recording.upload",
          subjectId: recordingId,
          payload: payload as Record<string, unknown>,
          dedupeKey: `recording.upload:${connection.id}:${recordingId}:v1`,
        });
      }
    } catch (err) {
      this.logger.error(
        `recording upload enqueue failed for call=${callId}: ${err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
