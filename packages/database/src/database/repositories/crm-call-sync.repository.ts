import { Injectable } from "@nestjs/common";
import {
  CrmCallSync,
  CrmProviderType,
  CrmRecordType,
  CrmSyncStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CrmCallSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByConnectionCall(
    connectionId: string,
    callId: string,
  ): Promise<CrmCallSync | null> {
    return this.prisma.crmCallSync.findUnique({
      where: { connectionId_callId: { connectionId, callId } },
    });
  }

  findById(id: string): Promise<CrmCallSync | null> {
    return this.prisma.crmCallSync.findUnique({ where: { id } });
  }

  upsertPending(input: {
    connectionId: string;
    provider: CrmProviderType;
    callId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<CrmCallSync> {
    return this.prisma.crmCallSync.upsert({
      where: {
        connectionId_callId: {
          connectionId: input.connectionId,
          callId: input.callId,
        },
      },
      create: {
        connectionId: input.connectionId,
        provider: input.provider,
        callId: input.callId,
        idempotencyKey: input.idempotencyKey,
        payloadSnapshot: input.payload as Prisma.InputJsonValue,
        status: "pending",
      },
      update: {
        payloadSnapshot: input.payload as Prisma.InputJsonValue,
        status: "pending",
        lastError: null,
      },
    });
  }

  markInProgress(id: string): Promise<CrmCallSync> {
    return this.prisma.crmCallSync.update({
      where: { id },
      data: {
        status: "in_progress",
        attemptCount: { increment: 1 },
      },
    });
  }

  markDone(
    id: string,
    data: {
      externalActivityId?: string | null;
      externalRecordId?: string | null;
      externalRecordType?: CrmRecordType | null;
    },
  ): Promise<CrmCallSync> {
    return this.prisma.crmCallSync.update({
      where: { id },
      data: {
        status: "done",
        externalActivityId: data.externalActivityId ?? null,
        externalRecordId: data.externalRecordId ?? null,
        externalRecordType: data.externalRecordType ?? null,
        lastError: null,
        nextAttemptAt: null,
      },
    });
  }

  scheduleRetry(
    id: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<CrmCallSync> {
    return this.prisma.crmCallSync.update({
      where: { id },
      data: { status: "pending", nextAttemptAt, lastError: error },
    });
  }

  markStatus(
    id: string,
    status: CrmSyncStatus,
    error?: string | null,
  ): Promise<CrmCallSync> {
    return this.prisma.crmCallSync.update({
      where: { id },
      data: { status, lastError: error ?? null },
    });
  }

  listByCall(callId: string): Promise<CrmCallSync[]> {
    return this.prisma.crmCallSync.findMany({ where: { callId } });
  }

  listByConnection(
    connectionId: string,
    opts: { status?: CrmSyncStatus[]; limit?: number } = {},
  ): Promise<CrmCallSync[]> {
    return this.prisma.crmCallSync.findMany({
      where: {
        connectionId,
        ...(opts.status ? { status: { in: opts.status } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: opts.limit ?? 50,
    });
  }

  countByConnection(
    connectionId: string,
  ): Promise<Record<CrmSyncStatus, number>> {
    return this.prisma.crmCallSync
      .groupBy({
        by: ["status"],
        where: { connectionId },
        _count: { _all: true },
      })
      .then((rows) => {
        const base = {
          pending: 0,
          in_progress: 0,
          done: 0,
          failed: 0,
          skipped: 0,
          needs_resolution: 0,
        } as Record<CrmSyncStatus, number>;
        for (const r of rows) base[r.status as CrmSyncStatus] = r._count._all;
        return base;
      });
  }
}
