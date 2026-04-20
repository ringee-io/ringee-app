import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  CrmContactLinkRepository,
  CrmOutboxRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

export type TaskSyncInput = {
  contactId: string;
  title: string;
  body?: string;
  dueAt?: Date;
  assigneeEmail?: string;
};

@Injectable()
export class CrmTaskSyncService {
  private readonly logger = new Logger(CrmTaskSyncService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly linkRepo: CrmContactLinkRepository,
    private readonly outbox: CrmOutboxRepository,
  ) {}

  async enqueueTask(
    ctx: OwnershipContext,
    input: TaskSyncInput,
  ): Promise<void> {
    try {
      const connections = await this.connections.listActive(ctx);
      if (connections.length === 0) return;

      const links = await this.linkRepo.listByContact(input.contactId);
      const now = Date.now();

      for (const connection of connections) {
        const capabilities = connection.capabilities as Record<string, unknown> | null;
        if (capabilities && capabilities.supportsTasks === false) continue;

        const link = links.find((l) => l.connectionId === connection.id);
        if (!link) {
          this.logger.debug(
            `no CRM link for contact=${input.contactId} on connection=${connection.id}, skipping`,
          );
          continue;
        }

        const idempotencyKey = createHash("sha1")
          .update(`${connection.id}|task|${input.contactId}|${input.title}|${now}`)
          .digest("hex");

        await this.outbox.enqueue({
          connectionId: connection.id,
          provider: connection.provider,
          kind: "task.sync",
          subjectId: input.contactId,
          payload: {
            title: input.title,
            body: input.body ?? null,
            dueAt: input.dueAt ? input.dueAt.toISOString() : null,
            assigneeEmail: input.assigneeEmail ?? null,
            linkedRecords: [
              { externalId: link.externalId, externalType: link.externalType },
            ],
            idempotencyKey,
          },
          dedupeKey: `task.sync:${idempotencyKey}`,
        });
      }
    } catch (err) {
      this.logger.error(
        `task sync enqueue failed for contact=${input.contactId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
