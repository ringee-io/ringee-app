import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  CrmContactLinkRepository,
  CrmOutboxRepository,
  Meeting,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

export type MeetingSyncOpts = {
  calendarProvider?: string | null;
  calendarEventId?: string | null;
  meetingUrl?: string | null;
  attendeeEmail?: string | null;
  recordingUrl?: string | null;
  sourceCallUrl?: string | null;
  ringeeMeetingUrl?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

@Injectable()
export class CrmMeetingSyncService {
  private readonly logger = new Logger(CrmMeetingSyncService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly linkRepo: CrmContactLinkRepository,
    private readonly outbox: CrmOutboxRepository,
  ) {}

  async enqueueMeetingSync(
    ctx: OwnershipContext,
    meeting: Meeting,
    opts: MeetingSyncOpts = {},
  ): Promise<void> {
    try {
      if (!meeting.contactId) return;

      const connections = await this.connections.listActive(ctx);
      if (connections.length === 0) return;

      const links = await this.linkRepo.listByContact(meeting.contactId);

      const endAt = new Date(
        meeting.scheduledAt.getTime() + (meeting.duration ?? 30) * 60 * 1000,
      );

      const attendees: Array<{ email?: string | null; name?: string | null }> = [];
      if (opts.attendeeEmail) {
        attendees.push({ email: opts.attendeeEmail, name: null });
      }

      for (const connection of connections) {
        const link = links.find((l) => l.connectionId === connection.id);
        if (!link) {
          this.logger.debug(
            `no CRM link for contact=${meeting.contactId} on connection=${connection.id}, skipping meeting sync`,
          );
          continue;
        }

        const idempotencyKey = createHash("sha1")
          .update(`${connection.id}|${meeting.id}|v1`)
          .digest("hex");

        const payload = {
          idempotencyKey,
          ringeeMeetingId: meeting.id,
          callId: meeting.callId ?? null,
          title: meeting.title || "Meeting via Ringee",
          description: meeting.notes ?? null,
          startAt: meeting.scheduledAt.toISOString(),
          endAt: endAt.toISOString(),
          timezone: null,
          meetingUrl: opts.meetingUrl ?? meeting.location ?? null,
          ringeeMeetingUrl: opts.ringeeMeetingUrl ?? null,
          calendarProvider: opts.calendarProvider ?? null,
          calendarEventId: opts.calendarEventId ?? meeting.externalEventId ?? null,
          recordingUrl: opts.recordingUrl ?? null,
          sourceCallUrl: opts.sourceCallUrl ?? null,
          attendees,
          ownerName: opts.ownerName ?? null,
          ownerEmail: opts.ownerEmail ?? null,
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
          kind: "meeting.sync",
          subjectId: meeting.id,
          payload: payload as Record<string, unknown>,
          dedupeKey: `meeting.sync:${connection.id}:${meeting.id}:v1`,
        });
      }
    } catch (err) {
      this.logger.error(
        `meeting sync enqueue failed for meeting=${meeting.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
