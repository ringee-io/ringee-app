import { Injectable } from "@nestjs/common";
import {
  CustomIntegrationInboundEvent,
  CustomIntegrationInboundStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CustomIntegrationInboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a freshly received event. Returns null if the (integrationId,
   * externalEventId) combination already exists — caller should treat that
   * as a duplicate and respond `skipped`.
   */
  async insertReceived(input: {
    integrationId: string;
    eventType: string;
    externalEventId: string;
    rawPayload: Record<string, unknown>;
  }): Promise<CustomIntegrationInboundEvent | null> {
    try {
      return await this.prisma.customIntegrationInboundEvent.create({
        data: {
          integrationId: input.integrationId,
          eventType: input.eventType,
          externalEventId: input.externalEventId,
          rawPayload: input.rawPayload as Prisma.InputJsonValue,
          status: "received",
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return null;
      }
      throw err;
    }
  }

  markStatus(
    id: string,
    status: CustomIntegrationInboundStatus,
    errorMessage?: string | null,
  ): Promise<CustomIntegrationInboundEvent> {
    return this.prisma.customIntegrationInboundEvent.update({
      where: { id },
      data: {
        status,
        errorMessage: errorMessage ?? null,
        processedAt:
          status === "processed" || status === "failed" || status === "skipped"
            ? new Date()
            : undefined,
      },
    });
  }

  list(
    integrationId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<CustomIntegrationInboundEvent[]> {
    const limit = Math.min(options.limit ?? 50, 200);
    return this.prisma.customIntegrationInboundEvent.findMany({
      where: { integrationId },
      orderBy: { receivedAt: "desc" },
      take: limit,
      ...(options.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
    });
  }
}
