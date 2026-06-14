import { Injectable } from "@nestjs/common";
import { Prisma, RegulatoryDocument } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  OwnershipContext,
  buildOwnershipFilter,
  buildOwnershipData,
} from "@ringee/platform";

@Injectable()
export class RegulatoryDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists the bucket of documents owned by the current workspace. */
  async findByOwner(ctx: OwnershipContext): Promise<RegulatoryDocument[]> {
    return this.prisma.regulatoryDocument.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "desc" },
    });
  }

  /** Reads a single document, scoped to its workspace owner. */
  async findOwnedById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<RegulatoryDocument | null> {
    return this.prisma.regulatoryDocument.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  findById(id: string): Promise<RegulatoryDocument | null> {
    return this.prisma.regulatoryDocument.findUnique({ where: { id } });
  }

  async create(
    ctx: OwnershipContext,
    data: Pick<
      Prisma.RegulatoryDocumentCreateInput,
      "filename" | "contentType" | "size" | "storageKey" | "url"
    >,
  ): Promise<RegulatoryDocument> {
    return this.prisma.regulatoryDocument.create({
      data: { ...data, ...buildOwnershipData(ctx) },
    });
  }

  update(
    id: string,
    data: Prisma.RegulatoryDocumentUpdateInput,
  ): Promise<RegulatoryDocument> {
    return this.prisma.regulatoryDocument.update({ where: { id }, data });
  }

  delete(id: string): Promise<RegulatoryDocument> {
    return this.prisma.regulatoryDocument.delete({ where: { id } });
  }
}
