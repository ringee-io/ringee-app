import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { DNCEntry } from "@prisma/client";

@Injectable()
export class DNCEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    phoneNumber: string;
    organizationId: string;
    reason?: string;
    source?: string;
    addedByUserId?: string;
  }): Promise<DNCEntry> {
    return this.prisma.dNCEntry.create({ data });
  }

  async createMany(
    entries: {
      phoneNumber: string;
      organizationId: string;
      reason?: string;
      source?: string;
      addedByUserId?: string;
    }[]
  ): Promise<number> {
    const result = await this.prisma.dNCEntry.createMany({
      data: entries,
      skipDuplicates: true,
    });
    return result.count;
  }

  async findByPhone(
    organizationId: string,
    phoneNumber: string
  ): Promise<DNCEntry | null> {
    return this.prisma.dNCEntry.findUnique({
      where: { organizationId_phoneNumber: { organizationId, phoneNumber } },
    });
  }

  async isOnDNC(
    organizationId: string,
    phoneNumber: string
  ): Promise<boolean> {
    const entry = await this.findByPhone(organizationId, phoneNumber);
    return entry !== null;
  }

  async listByOrganization(
    organizationId: string,
    options?: { search?: string; page?: number; limit?: number }
  ): Promise<{
    data: DNCEntry[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { search, page = 1, limit = 20 } = options || {};

    const where = {
      organizationId,
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

  async deleteByPhone(
    organizationId: string,
    phoneNumber: string
  ): Promise<DNCEntry> {
    return this.prisma.dNCEntry.delete({
      where: { organizationId_phoneNumber: { organizationId, phoneNumber } },
    });
  }
}
