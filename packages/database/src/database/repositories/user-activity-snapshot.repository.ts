import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export interface UserActivitySnapshotRecord {
  userId: string;
  firstCallCompletedAt: Date | null;
  firstCallEmittedAt: Date | null;
  lastActiveAt: Date | null;
  lastActiveEmittedAt: Date | null;
  lastInactiveEmittedAt: Date | null;
  updatedAt: Date;
}

@Injectable()
export class UserActivitySnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get delegate() {
    return (
      this.prisma as unknown as {
        userActivitySnapshot: {
          findUnique: (
            args: unknown,
          ) => Promise<UserActivitySnapshotRecord | null>;
          findMany: (args: unknown) => Promise<UserActivitySnapshotRecord[]>;
          upsert: (args: unknown) => Promise<UserActivitySnapshotRecord>;
        };
      }
    ).userActivitySnapshot;
  }

  findByUserId(userId: string): Promise<UserActivitySnapshotRecord | null> {
    return this.delegate.findUnique({ where: { userId } });
  }

  /**
   * Idempotent upsert. Only fields explicitly passed are written — this is
   * intentional because different code paths touch different fields (e.g.
   * a call completion only updates lastActiveAt and firstCallCompletedAt,
   * but the inactivity worker only updates lastInactiveEmittedAt).
   */
  async upsert(
    userId: string,
    patch: Partial<{
      firstCallCompletedAt: Date | null;
      firstCallEmittedAt: Date | null;
      lastActiveAt: Date | null;
      lastActiveEmittedAt: Date | null;
      lastInactiveEmittedAt: Date | null;
    }>,
  ): Promise<UserActivitySnapshotRecord> {
    return this.delegate.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    });
  }

  /**
   * Finds users who crossed the inactivity threshold AND for whom we have
   * not yet emitted an inactive notification in this inactive phase. A
   * subsequent active event clears `lastInactiveEmittedAt`, so the next
   * time they go inactive they'll be picked up again.
   */
  async findInactiveCandidates(params: {
    threshold: Date;
    limit: number;
  }): Promise<UserActivitySnapshotRecord[]> {
    return this.delegate.findMany({
      where: {
        lastActiveAt: { lt: params.threshold, not: null },
        lastInactiveEmittedAt: null,
      },
      take: params.limit,
      orderBy: { lastActiveAt: "asc" },
    });
  }
}
