import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  ContactRepository,
  CrmConnection,
  CrmContactLink,
  CrmContactLinkRepository,
  CrmOutboxRepository,
  Meeting,
} from "@ringee/database";
import {
  CrmProviderRegistry,
  normalizePhoneE164,
  OwnershipContext,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";
import { CrmMatchingService } from "./crm-matching.service";

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
    private readonly contactRepo: ContactRepository,
    private readonly matching: CrmMatchingService,
    private readonly registry: CrmProviderRegistry,
  ) {}

  /**
   * Ensure the meeting's contact is linked to a CRM record on this connection.
   * The meeting is often booked before the (deferred) call-log has synced, so
   * for a brand-new lead no link exists yet. Rather than skip the meeting note
   * (losing the Meet link), resolve an existing person by phone or create one
   * on the fly and persist the link — mirroring the call-log's on-the-fly
   * person creation. Best-effort: returns null if it can't be established.
   */
  private async establishLink(
    connection: CrmConnection,
    contactId: string,
  ): Promise<CrmContactLink | null> {
    const contact = await this.contactRepo
      .findById(contactId)
      .catch(() => null);
    if (!contact?.phoneNumber) return null;

    // Reuse the matching engine (creates a link when there's an exact match).
    const resolved = await this.matching
      .resolveByPhone(connection, contact.phoneNumber, contactId)
      .catch(() => null);
    if (resolved?.link) return resolved.link;

    const phoneE164 = normalizePhoneE164(contact.phoneNumber);
    if (!phoneE164) return null;
    try {
      const provider = this.registry.get(connection.provider);
      const ref = await this.connections.runWithFreshCredentials(
        connection,
        (creds) =>
          provider.upsertPerson(creds, {
            phoneE164,
            displayName: contact.name ?? null,
            firstName: contact.firstName ?? null,
            lastName: contact.lastName ?? null,
            email: contact.email ?? null,
          }),
      );
      return await this.linkRepo.upsertLink({
        connectionId: connection.id,
        provider: connection.provider,
        externalId: ref.externalId,
        externalType: ref.externalType,
        phoneNumberE164: phoneE164,
        contactId,
        matchConfidence: "created",
      });
    } catch (err) {
      this.logger.warn(
        `could not establish CRM link for contact=${contactId} on connection=${connection.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

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

      const attendees: Array<{ email?: string | null; name?: string | null }> =
        [];
      if (opts.attendeeEmail) {
        attendees.push({ email: opts.attendeeEmail, name: null });
      }

      for (const connection of connections) {
        let link = links.find((l) => l.connectionId === connection.id) ?? null;
        if (!link) {
          // No cached link — resolve/create the person so a brand-new lead's
          // meeting (and Meet link) still lands in the CRM.
          link = await this.establishLink(connection, meeting.contactId);
        }
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
          calendarEventId:
            opts.calendarEventId ?? meeting.externalEventId ?? null,
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
