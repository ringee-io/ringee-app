import { Injectable } from "@nestjs/common";
import { PersonalApiKey, PersonalApiKeySource, User } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export type PersonalApiKeyWithUser = PersonalApiKey & { user: User };

/**
 * Personal API keys are owned by a USER, not a workspace: every query is
 * scoped by `userId` (the workspace is resolved per request elsewhere).
 */
@Injectable()
export class PersonalApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    name: string;
    source: PersonalApiKeySource;
    prefix: string;
    keyHash: string;
  }): Promise<PersonalApiKey> {
    return this.prisma.personalApiKey.create({ data });
  }

  listActiveForUser(userId: string): Promise<PersonalApiKey[]> {
    return this.prisma.personalApiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  findByHash(keyHash: string): Promise<PersonalApiKeyWithUser | null> {
    return this.prisma.personalApiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });
  }

  /** Revoke one of the user's own keys. False when there was nothing to revoke. */
  async revokeForUser(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.personalApiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  async touch(
    id: string,
    client?: { name: string; version: string | null } | null,
  ): Promise<void> {
    await this.prisma.personalApiKey.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        ...(client
          ? { lastClientName: client.name, lastClientVersion: client.version }
          : {}),
      },
    });
  }

  countActive(): Promise<number> {
    return this.prisma.personalApiKey.count({ where: { revokedAt: null } });
  }

  async countCreatedBySource(
    start: Date,
    end: Date,
  ): Promise<Record<PersonalApiKeySource, number>> {
    const rows = await this.prisma.personalApiKey.groupBy({
      by: ["source"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    });
    const out: Record<PersonalApiKeySource, number> = { dashboard: 0, cli: 0 };
    for (const r of rows) out[r.source] = r._count._all;
    return out;
  }
}
