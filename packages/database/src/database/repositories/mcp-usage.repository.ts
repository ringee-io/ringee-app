import { Injectable } from "@nestjs/common";
import {
  McpUsageAuthMethod,
  McpUsageEventType,
  McpUsageSurface,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface McpUsageEventInput {
  type: McpUsageEventType;
  surface: McpUsageSurface;
  authMethod: McpUsageAuthMethod;
  userId: string;
  organizationId: string | null;
  apiKeyId: string | null;
  clientName: string | null;
  clientVersion: string | null;
  toolName?: string | null;
  success?: boolean;
  durationMs?: number | null;
}

export interface McpUsageSurfaceRow {
  surface: McpUsageSurface;
  users: number;
  connects: number;
  toolCalls: number;
  errors: number;
}

export interface McpUsageClientRow {
  surface: McpUsageSurface;
  clientName: string | null;
  users: number;
  toolCalls: number;
  lastSeenAt: Date;
}

export interface McpUsageAuthRow {
  authMethod: McpUsageAuthMethod;
  users: number;
  toolCalls: number;
}

export interface McpUsageToolRow {
  toolName: string;
  calls: number;
  users: number;
  errors: number;
  avgDurationMs: number | null;
}

export interface McpUsageDailyRow {
  day: Date;
  surface: McpUsageSurface;
  users: number;
  toolCalls: number;
}

export interface McpUsageUserRow {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  surfaces: McpUsageSurface[];
  clients: string[];
  toolCalls: number;
  lastSeenAt: Date;
}

const num = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/**
 * Append-only usage log of the MCP endpoint and the CLI. Reads are
 * cross-tenant aggregates for the super-admin backoffice only.
 */
@Injectable()
export class McpUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: McpUsageEventInput): Promise<void> {
    await this.prisma.mcpUsageEvent.create({ data: event });
  }

  /**
   * Delete up to `batchSize` events older than `cutoff`, oldest first. Bounded
   * so one retention pass never holds a long lock on a busy table.
   */
  deleteOlderThan(cutoff: Date, batchSize: number): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "McpUsageEvent"
      WHERE id IN (
        SELECT id FROM "McpUsageEvent"
        WHERE "createdAt" < ${cutoff}
        ORDER BY "createdAt"
        LIMIT ${batchSize}
      )
    `);
  }

  async distinctUsers(start: Date, end: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ users: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "userId") AS users
      FROM "McpUsageEvent"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
    `);
    return num(row?.users);
  }

  async bySurface(start: Date, end: Date): Promise<McpUsageSurfaceRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        surface: McpUsageSurface;
        users: bigint;
        connects: bigint;
        toolCalls: bigint;
        errors: bigint;
      }[]
    >(Prisma.sql`
      SELECT surface,
             COUNT(DISTINCT "userId") AS users,
             COUNT(*) FILTER (WHERE type = 'connect') AS connects,
             COUNT(*) FILTER (WHERE type = 'tool_call') AS "toolCalls",
             COUNT(*) FILTER (WHERE type = 'tool_call' AND NOT success) AS errors
      FROM "McpUsageEvent"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY surface
    `);
    return rows.map((r) => ({
      surface: r.surface,
      users: num(r.users),
      connects: num(r.connects),
      toolCalls: num(r.toolCalls),
      errors: num(r.errors),
    }));
  }

  async byClient(start: Date, end: Date): Promise<McpUsageClientRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        surface: McpUsageSurface;
        clientName: string | null;
        users: bigint;
        toolCalls: bigint;
        lastSeenAt: Date;
      }[]
    >(Prisma.sql`
      SELECT surface, "clientName",
             COUNT(DISTINCT "userId") AS users,
             COUNT(*) FILTER (WHERE type = 'tool_call') AS "toolCalls",
             MAX("createdAt") AS "lastSeenAt"
      FROM "McpUsageEvent"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY surface, "clientName"
      ORDER BY users DESC, "toolCalls" DESC
    `);
    return rows.map((r) => ({
      surface: r.surface,
      clientName: r.clientName,
      users: num(r.users),
      toolCalls: num(r.toolCalls),
      lastSeenAt: r.lastSeenAt,
    }));
  }

  async byAuthMethod(start: Date, end: Date): Promise<McpUsageAuthRow[]> {
    const rows = await this.prisma.$queryRaw<
      { authMethod: McpUsageAuthMethod; users: bigint; toolCalls: bigint }[]
    >(Prisma.sql`
      SELECT "authMethod",
             COUNT(DISTINCT "userId") AS users,
             COUNT(*) FILTER (WHERE type = 'tool_call') AS "toolCalls"
      FROM "McpUsageEvent"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY "authMethod"
      ORDER BY users DESC
    `);
    return rows.map((r) => ({
      authMethod: r.authMethod,
      users: num(r.users),
      toolCalls: num(r.toolCalls),
    }));
  }

  async topTools(
    start: Date,
    end: Date,
    limit = 25,
  ): Promise<McpUsageToolRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        toolName: string;
        calls: bigint;
        users: bigint;
        errors: bigint;
        avgDurationMs: number | null;
      }[]
    >(Prisma.sql`
      SELECT "toolName",
             COUNT(*) AS calls,
             COUNT(DISTINCT "userId") AS users,
             COUNT(*) FILTER (WHERE NOT success) AS errors,
             AVG("durationMs")::float AS "avgDurationMs"
      FROM "McpUsageEvent"
      WHERE type = 'tool_call' AND "toolName" IS NOT NULL
        AND "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY "toolName"
      ORDER BY calls DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      toolName: r.toolName,
      calls: num(r.calls),
      users: num(r.users),
      errors: num(r.errors),
      avgDurationMs:
        r.avgDurationMs == null ? null : Math.round(r.avgDurationMs),
    }));
  }

  /** Active users and tool calls per UTC day and surface. */
  async daily(start: Date, end: Date): Promise<McpUsageDailyRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        day: Date;
        surface: McpUsageSurface;
        users: bigint;
        toolCalls: bigint;
      }[]
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, surface,
             COUNT(DISTINCT "userId") AS users,
             COUNT(*) FILTER (WHERE type = 'tool_call') AS "toolCalls"
      FROM "McpUsageEvent"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY day, surface
      ORDER BY day ASC
    `);
    return rows.map((r) => ({
      day: r.day,
      surface: r.surface,
      users: num(r.users),
      toolCalls: num(r.toolCalls),
    }));
  }

  async topUsers(
    start: Date,
    end: Date,
    limit = 100,
  ): Promise<McpUsageUserRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        surfaces: McpUsageSurface[] | null;
        clients: string[] | null;
        toolCalls: bigint;
        lastSeenAt: Date;
      }[]
    >(Prisma.sql`
      SELECT e."userId", u."firstName", u."lastName",
             (SELECT ue.email FROM "UserEmail" ue
               WHERE ue."userId" = e."userId"
               ORDER BY ue."isPrimary" DESC, ue."createdAt" ASC
               LIMIT 1) AS email,
             array_agg(DISTINCT e.surface::text) AS surfaces,
             array_agg(DISTINCT e."clientName")
               FILTER (WHERE e."clientName" IS NOT NULL) AS clients,
             COUNT(*) FILTER (WHERE e.type = 'tool_call') AS "toolCalls",
             MAX(e."createdAt") AS "lastSeenAt"
      FROM "McpUsageEvent" e
      JOIN "User" u ON u.id = e."userId"
      WHERE e."createdAt" >= ${start} AND e."createdAt" <= ${end}
      GROUP BY e."userId", u."firstName", u."lastName"
      ORDER BY "toolCalls" DESC, "lastSeenAt" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      surfaces: r.surfaces ?? [],
      clients: r.clients ?? [],
      toolCalls: num(r.toolCalls),
      lastSeenAt: r.lastSeenAt,
    }));
  }
}
