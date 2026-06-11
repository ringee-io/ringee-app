import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Disposition, DispositionCategory } from "@prisma/client";

@Injectable()
export class DispositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string;
    code: string;
    label: string;
    category: DispositionCategory;
    color?: string;
    sortOrder?: number;
    triggersRetry?: boolean;
    triggersCompletion?: boolean;
    triggersDnc?: boolean;
    triggersCallback?: boolean;
    isSystem?: boolean;
  }): Promise<Disposition> {
    return this.prisma.disposition.create({ data });
  }

  async createMany(
    dispositions: {
      campaignId: string;
      code: string;
      label: string;
      category: DispositionCategory;
      color?: string;
      sortOrder?: number;
      triggersRetry?: boolean;
      triggersCompletion?: boolean;
      triggersDnc?: boolean;
      triggersCallback?: boolean;
      isSystem?: boolean;
    }[],
  ): Promise<number> {
    const result = await this.prisma.disposition.createMany({
      data: dispositions,
      skipDuplicates: true,
    });
    return result.count;
  }

  async findById(id: string): Promise<Disposition | null> {
    return this.prisma.disposition.findUnique({ where: { id } });
  }

  async findByCampaign(campaignId: string): Promise<Disposition[]> {
    return this.prisma.disposition.findMany({
      where: { campaignId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findByCampaignAndCode(
    campaignId: string,
    code: string,
  ): Promise<Disposition | null> {
    return this.prisma.disposition.findUnique({
      where: { campaignId_code: { campaignId, code } },
    });
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Disposition,
        | "label"
        | "color"
        | "sortOrder"
        | "triggersRetry"
        | "triggersCompletion"
        | "triggersDnc"
        | "triggersCallback"
        | "isActive"
      >
    >,
  ): Promise<Disposition> {
    return this.prisma.disposition.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Disposition> {
    return this.prisma.disposition.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
