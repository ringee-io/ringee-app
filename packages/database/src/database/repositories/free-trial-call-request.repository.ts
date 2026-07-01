import { Injectable } from "@nestjs/common";
import { FreeTrialCallRequest } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class FreeTrialCallRequestRepository {
  constructor(private prisma: PrismaService) {}

  findByUserId(userId: string): Promise<FreeTrialCallRequest | null> {
    return this.prisma.freeTrialCallRequest.findUnique({
      where: { userId },
    });
  }

  create(userId: string, note?: string | null): Promise<FreeTrialCallRequest> {
    return this.prisma.freeTrialCallRequest.create({
      data: { userId, note: note?.trim() || null },
    });
  }
}
