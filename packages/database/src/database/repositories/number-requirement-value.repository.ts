import { Injectable } from "@nestjs/common";
import { Prisma, NumberRequirementValue } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/** Value persisted for one regulatory requirement, with its document joined. */
export type RequirementValueWithDocument = NumberRequirementValue & {
  regulatoryDocument: { id: string; filename: string } | null;
};

@Injectable()
export class NumberRequirementValueRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All saved form values for a number, with the linked document's name. */
  async findByNumber(
    numberPurchasedId: string,
  ): Promise<RequirementValueWithDocument[]> {
    return this.prisma.numberRequirementValue.findMany({
      where: { numberPurchasedId },
      include: {
        regulatoryDocument: { select: { id: true, filename: true } },
      },
    });
  }

  /**
   * Upserts one requirement value (keyed by number + requirement). Fields left
   * `undefined` are not touched on update; pass `addressJson: null` to clear it.
   */
  async upsert(
    numberPurchasedId: string,
    requirementId: string,
    data: {
      fieldType: string;
      textValue?: string | null;
      addressJson?: object | null;
      regulatoryDocumentId?: string | null;
      submittedAt?: Date | null;
    },
  ): Promise<NumberRequirementValue> {
    const mapped: Prisma.NumberRequirementValueUncheckedCreateInput = {
      numberPurchasedId,
      requirementId,
      fieldType: data.fieldType,
    };
    if (data.textValue !== undefined) mapped.textValue = data.textValue;
    if (data.regulatoryDocumentId !== undefined) {
      mapped.regulatoryDocumentId = data.regulatoryDocumentId;
    }
    if (data.submittedAt !== undefined) mapped.submittedAt = data.submittedAt;
    if (data.addressJson !== undefined) {
      mapped.addressJson =
        data.addressJson === null
          ? Prisma.JsonNull
          : (data.addressJson as Prisma.InputJsonValue);
    }

    const { numberPurchasedId: _n, requirementId: _r, ...update } = mapped;

    return this.prisma.numberRequirementValue.upsert({
      where: {
        numberPurchasedId_requirementId: { numberPurchasedId, requirementId },
      },
      create: mapped,
      update,
    });
  }
}
