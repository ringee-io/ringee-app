import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  CrmContactLink,
  CrmContactLinkRepository,
  CrmOutboxRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

export type NoteSyncInput = {
  contactId: string;
  title?: string;
  body: string;
};

@Injectable()
export class CrmNoteSyncService {
  private readonly logger = new Logger(CrmNoteSyncService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly linkRepo: CrmContactLinkRepository,
    private readonly outbox: CrmOutboxRepository,
  ) {}

  async enqueueNote(
    ctx: OwnershipContext,
    input: NoteSyncInput,
  ): Promise<void> {
    try {
      const connection = await this.connections.findActive(ctx, "attio");
      if (!connection) return;

      const links = await this.linkRepo.listByContact(input.contactId);
      const link = links.find((l) => l.connectionId === connection.id);
      if (!link) {
        this.logger.debug(`no CRM link for contact=${input.contactId}, skipping note sync`);
        return;
      }

      const idempotencyKey = createHash("sha1")
        .update(`${connection.id}|note|${input.contactId}|${Date.now()}`)
        .digest("hex");

      await this.outbox.enqueue({
        connectionId: connection.id,
        provider: connection.provider,
        kind: "note.sync",
        subjectId: input.contactId,
        payload: {
          recordId: link.externalId,
          recordType: link.externalType,
          title: input.title ?? "Note from Ringee",
          body: input.body,
          idempotencyKey,
        },
        dedupeKey: `note.sync:${idempotencyKey}`,
      });
    } catch (err) {
      this.logger.error(
        `note sync enqueue failed for contact=${input.contactId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
