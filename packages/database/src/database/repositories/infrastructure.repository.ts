import { Injectable } from "@nestjs/common";
import {
  Prisma,
  InfrastructureResource,
  InfrastructureConnection,
  InfrastructureEvent,
  InfrastructureResourceType,
  InfrastructureConnectionType,
  InfrastructureConnectionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  OwnershipContext,
  buildOwnershipFilter,
  buildOwnershipData,
} from "@ringee/platform";

export interface NewResource {
  type: InfrastructureResourceType;
  referenceId: string | null;
  name: string;
  status: string;
  positionX: number;
  positionY: number;
  metadata?: Prisma.InputJsonValue;
}

export interface NewConnection {
  sourceResourceId: string;
  targetResourceId: string;
  type: InfrastructureConnectionType;
  status: InfrastructureConnectionStatus;
  metadata?: Prisma.InputJsonValue;
}

export interface NewEvent {
  resourceId?: string | null;
  connectionId?: string | null;
  type: string;
  message: string;
  actorUserId?: string | null;
  payload?: Prisma.InputJsonValue;
}

/**
 * Data access for the Ringee Infra canvas overlay. Every query is scoped to the
 * active workspace via buildOwnershipFilter (organizationId when set, else the
 * personal userId scope).
 */
@Injectable()
export class InfrastructureRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Resources ─────────────────────────────────────────────────────────────

  listResources(ctx: OwnershipContext): Promise<InfrastructureResource[]> {
    return this.prisma.infrastructureResource.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "asc" },
    });
  }

  findResourceById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<InfrastructureResource | null> {
    return this.prisma.infrastructureResource.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  createManyResources(
    ctx: OwnershipContext,
    rows: NewResource[],
  ): Promise<Prisma.BatchPayload> {
    const owner = buildOwnershipData(ctx);
    return this.prisma.infrastructureResource.createMany({
      data: rows.map((r) => ({
        ...owner,
        type: r.type,
        referenceId: r.referenceId,
        name: r.name,
        status: r.status,
        positionX: r.positionX,
        positionY: r.positionY,
        metadata: r.metadata ?? {},
      })),
      skipDuplicates: true,
    });
  }

  createResource(
    ctx: OwnershipContext,
    row: NewResource,
  ): Promise<InfrastructureResource> {
    return this.prisma.infrastructureResource.create({
      data: {
        ...buildOwnershipData(ctx),
        type: row.type,
        referenceId: row.referenceId,
        name: row.name,
        status: row.status,
        positionX: row.positionX,
        positionY: row.positionY,
        metadata: row.metadata ?? {},
      },
    });
  }

  updatePosition(
    id: string,
    positionX: number,
    positionY: number,
  ): Promise<InfrastructureResource> {
    return this.prisma.infrastructureResource.update({
      where: { id },
      data: { positionX, positionY },
    });
  }

  updateResource(
    id: string,
    data: Prisma.InfrastructureResourceUpdateInput,
  ): Promise<InfrastructureResource> {
    return this.prisma.infrastructureResource.update({ where: { id }, data });
  }

  // ── Connections ─────────────────────────────────────────────────────────

  listConnections(ctx: OwnershipContext): Promise<InfrastructureConnection[]> {
    return this.prisma.infrastructureConnection.findMany({
      where: buildOwnershipFilter(ctx),
      orderBy: { createdAt: "asc" },
    });
  }

  findConnectionById(
    ctx: OwnershipContext,
    id: string,
  ): Promise<InfrastructureConnection | null> {
    return this.prisma.infrastructureConnection.findFirst({
      where: { id, ...buildOwnershipFilter(ctx) },
    });
  }

  async upsertConnection(
    ctx: OwnershipContext,
    row: NewConnection,
  ): Promise<InfrastructureConnection> {
    return this.prisma.infrastructureConnection.upsert({
      where: {
        sourceResourceId_targetResourceId_type: {
          sourceResourceId: row.sourceResourceId,
          targetResourceId: row.targetResourceId,
          type: row.type,
        },
      },
      update: { status: row.status, metadata: row.metadata ?? {} },
      create: {
        ...buildOwnershipData(ctx),
        sourceResourceId: row.sourceResourceId,
        targetResourceId: row.targetResourceId,
        type: row.type,
        status: row.status,
        metadata: row.metadata ?? {},
      },
    });
  }

  async deleteConnection(id: string): Promise<void> {
    await this.prisma.infrastructureConnection.delete({ where: { id } });
  }

  // ── Events ──────────────────────────────────────────────────────────────

  createEvent(
    ctx: OwnershipContext,
    row: NewEvent,
  ): Promise<InfrastructureEvent> {
    return this.prisma.infrastructureEvent.create({
      data: {
        ...buildOwnershipData(ctx),
        resourceId: row.resourceId ?? null,
        connectionId: row.connectionId ?? null,
        type: row.type,
        message: row.message,
        actorUserId: row.actorUserId ?? ctx.userId,
        payload: row.payload ?? Prisma.JsonNull,
      },
    });
  }

  listEvents(
    ctx: OwnershipContext,
    resourceId: string,
    limit = 50,
  ): Promise<InfrastructureEvent[]> {
    return this.prisma.infrastructureEvent.findMany({
      where: { ...buildOwnershipFilter(ctx), resourceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
