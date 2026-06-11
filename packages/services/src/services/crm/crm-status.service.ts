import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CrmCallSync,
  CrmCallSyncRepository,
  CrmConnection,
  CrmProviderType,
  CrmSyncStatus,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

export type CrmConnectionSummary = {
  id: string;
  provider: CrmProviderType;
  scope: "personal" | "organization";
  status: CrmConnection["status"];
  accountName: string | null;
  accountId: string;
  lastSyncAt: Date | null;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  pending: number;
  failed: number;
  needsResolution: number;
  done: number;
};

@Injectable()
export class CrmStatusService {
  constructor(
    private readonly connections: CrmConnectionService,
    private readonly syncRepo: CrmCallSyncRepository,
  ) {}

  async listConnections(
    ctx: OwnershipContext,
  ): Promise<CrmConnectionSummary[]> {
    const conns = await this.connections.listVisible(ctx);
    return Promise.all(
      conns.map(async (c) => {
        const counts = await this.syncRepo.countByConnection(c.id);
        return {
          id: c.id,
          provider: c.provider,
          scope: c.scope as "personal" | "organization",
          status: c.status,
          accountName: c.externalAccountName,
          accountId: c.externalAccountId,
          lastSyncAt: c.lastSyncAt,
          lastErrorCode: c.lastErrorCode,
          lastErrorAt: c.lastErrorAt,
          createdAt: c.createdAt,
          pending: counts.pending + counts.in_progress,
          failed: counts.failed,
          needsResolution: counts.needs_resolution,
          done: counts.done,
        };
      }),
    );
  }

  async listRecentSyncs(
    ctx: OwnershipContext,
    connectionId: string,
    opts: { status?: CrmSyncStatus[]; limit?: number } = {},
  ): Promise<CrmCallSync[]> {
    const conn = await this.connections.findById(connectionId);
    if (!conn) throw new NotFoundException("connection not found");
    await this.connections.assertAccess(ctx, conn);
    return this.syncRepo.listByConnection(connectionId, {
      status: opts.status,
      limit: opts.limit ?? 50,
    });
  }

  async listSyncsForCall(
    ctx: OwnershipContext,
    callId: string,
  ): Promise<CrmCallSync[]> {
    const syncs = await this.syncRepo.listByCall(callId);
    const filtered: CrmCallSync[] = [];
    for (const s of syncs) {
      const conn = await this.connections.findById(s.connectionId);
      if (!conn) continue;
      try {
        await this.connections.assertAccess(ctx, conn);
        filtered.push(s);
      } catch {
        // not visible to this ctx — skip
      }
    }
    return filtered;
  }
}
