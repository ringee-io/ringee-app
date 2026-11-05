import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { DNCEntry, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export interface DNCOwnerScope {
  userId: string;
  organizationId?: string | null;
}

export interface DNCCreateInput {
  phoneNumber: string;
  userId: string;
  organizationId?: string | null;
  reason?: string;
  source?: string;
  addedByUserId?: string;
}

@Injectable()
export class DNCEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the WHERE clause for the owner's DNC list. Org context queries the
   * org list only; freelancer context queries the user's personal list only.
   * The two are never mixed.
   */
  private ownerWhere(owner: DNCOwnerScope): Prisma.DNCEntryWhereInput {
    return owner.organizationId
      ? { organizationId: owner.organizationId }
      : { userId: owner.userId, organizationId: null };
  }

  async create(data: DNCCreateInput): Promise<DNCEntry> {
    return this.prisma.dNCEntry.create({
      data: {
        phoneNumber: data.phoneNumber,
        userId: data.userId,
        organizationId: data.organizationId ?? null,
        reason: data.reason,
        source: data.source,
        addedByUserId: data.addedByUserId,
      },
    });
  }

  /** Only a duplicate on this workspace's phone key is accepted. Using the
   * partial index as the conflict target keeps a surrounding transaction usable. */
  async createOnce(
    data: DNCCreateInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<DNCEntry> {
    const conflict = data.organizationId
      ? Prisma.sql`("organizationId", "phoneNumber") WHERE "organizationId" IS NOT NULL`
      : Prisma.sql`("userId", "phoneNumber") WHERE "organizationId" IS NULL`;
    const [entry] = await tx.$queryRaw<DNCEntry[]>`
      INSERT INTO "DNCEntry"
        ("id", "phoneNumber", "userId", "organizationId", "reason", "source", "addedByUserId", "createdAt")
      VALUES (${randomUUID()}::uuid, ${data.phoneNumber}, ${data.userId}::uuid,
        ${data.organizationId ?? null}::uuid, ${data.reason ?? null},
        ${data.source ?? "manual"}, ${data.addedByUserId ?? null}::uuid, NOW())
      ON CONFLICT ${conflict} DO UPDATE SET "phoneNumber" = EXCLUDED."phoneNumber"
      RETURNING *
    `;
    return entry;
  }

  async createMany(entries: DNCCreateInput[]): Promise<number> {
    const result = await this.prisma.dNCEntry.createMany({
      data: entries.map((e) => ({
        phoneNumber: e.phoneNumber,
        userId: e.userId,
        organizationId: e.organizationId ?? null,
        reason: e.reason,
        source: e.source,
        addedByUserId: e.addedByUserId,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async findByPhone(
    owner: DNCOwnerScope,
    phoneNumber: string,
  ): Promise<DNCEntry | null> {
    return this.prisma.dNCEntry.findFirst({
      where: { ...this.ownerWhere(owner), phoneNumber },
    });
  }

  /** Which of `phoneNumbers` are on the owner's list. */
  async findListedPhones(
    owner: DNCOwnerScope,
    phoneNumbers: string[],
  ): Promise<Set<string>> {
    if (phoneNumbers.length === 0) return new Set();
    const rows = await this.prisma.dNCEntry.findMany({
      where: { ...this.ownerWhere(owner), phoneNumber: { in: phoneNumbers } },
      select: { phoneNumber: true },
    });
    return new Set(rows.map((row) => row.phoneNumber));
  }

  async isOnDNC(owner: DNCOwnerScope, phoneNumber: string): Promise<boolean> {
    const count = await this.prisma.dNCEntry.count({
      where: { ...this.ownerWhere(owner), phoneNumber },
    });
    return count > 0;
  }

  async listForOwner(
    owner: DNCOwnerScope,
    options?: { search?: string; page?: number; limit?: number },
  ): Promise<{
    data: DNCEntry[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { search, page = 1, limit = 20 } = options || {};

    const where: Prisma.DNCEntryWhereInput = {
      ...this.ownerWhere(owner),
      ...(search ? { phoneNumber: { contains: search } } : {}),
    };

    const total = await this.prisma.dNCEntry.count({ where });
    const data = await this.prisma.dNCEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async delete(id: string): Promise<DNCEntry> {
    return this.prisma.dNCEntry.delete({ where: { id } });
  }

  /** One of the owner's entries; another list's reads as missing. */
  async findByIdForOwner(
    owner: DNCOwnerScope,
    id: string,
  ): Promise<DNCEntry | null> {
    return this.prisma.dNCEntry.findFirst({
      where: { id, ...this.ownerWhere(owner) },
    });
  }

  async deleteByPhone(
    owner: DNCOwnerScope,
    phoneNumber: string,
  ): Promise<number> {
    const result = await this.prisma.dNCEntry.deleteMany({
      where: { ...this.ownerWhere(owner), phoneNumber },
    });
    return result.count;
  }
}
