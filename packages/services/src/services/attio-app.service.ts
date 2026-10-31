import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "@ringee/database";
import {
  CryptoService,
  RedisService,
  buildOwnershipFilter,
} from "@ringee/platform";
import type { OwnershipContext } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

/** What an Attio integration token is for, so no other sealed payload passes. */
const ATTIO_APP_TOKEN_TYPE = "attio_app_token";

export interface AttioAppTokenPayload {
  v: 1;
  type: typeof ATTIO_APP_TOKEN_TYPE;
  /** Which issue this is; only the latest one per workspace is honored. */
  jti: string;
  userId: string;
  organizationId: string | null;
  scope: "personal" | "organization";
  createdAt: number;
}

export interface AttioAppContext {
  userId: string;
  organizationId: string | null;
  scope: "personal" | "organization";
  /**
   * Set when the token's issuer is an ordinary organization member: their
   * call history reads are limited to their own calls, the same rule the
   * dashboard applies (`resolveMemberFilter`).
   */
  memberUserId?: string;
}

export interface CallHistoryEntry {
  id: string;
  direction: string | null;
  fromNumber: string;
  toNumber: string;
  status: string;
  /** The canonical `CallOutcome`. */
  outcome: string | null;
  /** The workspace disposition picked for the call, when one was ("Demo booked"). */
  dispositionName: string | null;
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  recordingUrl: string | null;
  contactName: string | null;
}

export interface CallerIdEntry {
  id: string;
  phoneNumber: string;
  verified: boolean;
  status: string;
}

export interface CallSessionResult {
  dialerUrl: string;
  sessionToken: string;
  expiresAt: string;
}

@Injectable()
export class AttioAppService {
  private readonly logger = new Logger(AttioAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Issues the workspace's Attio token and makes it the only one honored:
   * generating a new token revokes every earlier one, as the UI promises.
   */
  async generateToken(ctx: OwnershipContext): Promise<string> {
    const payload: AttioAppTokenPayload = {
      v: 1,
      type: ATTIO_APP_TOKEN_TYPE,
      jti: randomUUID(),
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      scope: ctx.organizationId ? "organization" : "personal",
      createdAt: Date.now(),
    };
    await this.redis.set(this.activeTokenKey(payload), payload.jti);
    return this.crypto.encrypt(payload as unknown as Record<string, unknown>);
  }

  async validateToken(token: string): Promise<AttioAppContext> {
    let payload: Record<string, unknown>;
    try {
      payload = this.crypto.decrypt(token);
    } catch {
      this.logger.warn("Failed to validate Attio app token");
      throw new UnauthorizedException("Invalid or expired integration token");
    }

    // Typed tokens only: old unversioned credentials must be regenerated.
    // Other encrypted payloads are never integration credentials.
    const typed = payload.type === ATTIO_APP_TOKEN_TYPE;
    if (
      payload.v !== 1 ||
      typeof payload.userId !== "string" ||
      !payload.userId ||
      !typed ||
      typeof payload.jti !== "string" ||
      !payload.jti
    ) {
      throw new UnauthorizedException("Invalid integration token");
    }
    const organizationId =
      typeof payload.organizationId === "string"
        ? payload.organizationId
        : null;
    const ctx: AttioAppContext = {
      userId: payload.userId,
      organizationId,
      scope: organizationId ? "organization" : "personal",
    };

    // This is a credential registry, not an optional cache. An absent record
    // cannot prove a token is still current; legacy tokens must be regenerated.
    const active = await this.redis.getRaw(this.activeTokenKey(ctx));
    if (!typed || !active || active !== payload.jti) {
      throw new UnauthorizedException("This integration token was revoked");
    }

    // The issuer must still have access to the workspace, and an ordinary
    // member's token sees only their own calls.
    if (organizationId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { organizationId, userId: ctx.userId },
        select: { role: true },
      });
      if (!membership) {
        throw new UnauthorizedException("Invalid integration token");
      }
      if (membership.role !== "org:admin") ctx.memberUserId = ctx.userId;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { blockedAt: true },
    });
    if (!user || user.blockedAt) {
      throw new UnauthorizedException("Invalid integration token");
    }
    return ctx;
  }

  private activeTokenKey(ctx: {
    userId: string;
    organizationId: string | null;
  }): string {
    return `attio-app:active-token:${ctx.userId}:${ctx.organizationId ?? "personal"}`;
  }

  async getContextInfo(ctx: AttioAppContext): Promise<{
    userId: string;
    scope: string;
    organizationId: string | null;
    organizationName: string | null;
    userName: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { firstName: true, lastName: true },
    });

    let orgName: string | null = null;
    if (ctx.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      });
      orgName = org?.name ?? null;
    }

    const fullName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(" ") || null
      : null;

    return {
      userId: ctx.userId,
      scope: ctx.scope,
      organizationId: ctx.organizationId,
      organizationName: orgName,
      userName: fullName,
    };
  }

  async getCallHistory(
    ctx: AttioAppContext,
    phoneNumbers: string[],
    limit = 20,
  ): Promise<CallHistoryEntry[]> {
    if (phoneNumbers.length === 0) return [];

    const ownerFilter = buildOwnershipFilter(ctx);
    const calls = await this.prisma.call.findMany({
      where: {
        ...ownerFilter,
        ...(ctx.memberUserId ? { userId: ctx.memberUserId } : {}),
        OR: [
          { fromNumber: { in: phoneNumbers } },
          { toNumber: { in: phoneNumbers } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        recordings: { select: { url: true }, take: 1 },
        contact: { select: { name: true, firstName: true, lastName: true } },
      },
    });

    return calls.map((call) => {
      const joinedName = [call.contact?.firstName, call.contact?.lastName]
        .filter(Boolean)
        .join(" ");
      const contactName = call.contact?.name ?? (joinedName || null);

      return {
        id: call.id,
        direction: call.direction,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        status: call.status,
        outcome: call.outcome,
        dispositionName: call.dispositionName,
        durationSeconds: call.durationSeconds,
        startedAt: call.startedAt?.toISOString() ?? null,
        endedAt: call.endedAt?.toISOString() ?? null,
        recordingUrl: call.recordings?.[0]?.url ?? null,
        contactName,
      };
    });
  }

  async getCallerIds(ctx: AttioAppContext): Promise<CallerIdEntry[]> {
    const ownerFilter = buildOwnershipFilter(ctx);

    const [callerIds, numbers] = await Promise.all([
      this.prisma.numberPurchased.findMany({
        where: {
          ...ownerFilter,
          kind: "verified_caller_id",
          deletedAt: null,
          verified: true,
          active: true,
        },
        select: { id: true, phoneNumber: true, verified: true },
      }),
      this.prisma.numberPurchased.findMany({
        where: {
          ...ownerFilter,
          kind: "purchased",
          status: {
            in: ["active", "assigned"],
          },
        },
        select: { id: true, phoneNumber: true, status: true },
      }),
    ]);

    const entries: CallerIdEntry[] = [
      ...callerIds.map((c) => ({
        id: c.id,
        phoneNumber: c.phoneNumber,
        verified: c.verified,
        status: "verified",
      })),
      ...numbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        verified: true,
        status: n.status ?? "active",
      })),
    ];

    const seen = new Set<string>();
    return entries.filter((e) => {
      if (seen.has(e.phoneNumber)) return false;
      seen.add(e.phoneNumber);
      return true;
    });
  }

  createCallSession(
    ctx: AttioAppContext,
    params: {
      toNumber: string;
      fromNumber: string;
      recordName?: string;
      attioRecordId?: string;
      attioObjectType?: string;
    },
  ): CallSessionResult {
    const frontendUrl =
      (apiConfiguration.FRONTEND_URL as string | undefined) ??
      "http://localhost:4200";

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const sessionPayload = {
      v: 1,
      type: "attio_call_session",
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      toNumber: params.toNumber,
      fromNumber: params.fromNumber,
      recordName: params.recordName ?? null,
      attioRecordId: params.attioRecordId ?? null,
      attioObjectType: params.attioObjectType ?? null,
      createdAt: Date.now(),
      expiresAt,
    };

    const sessionToken = this.crypto.encrypt(
      sessionPayload as unknown as Record<string, unknown>,
    );

    const qs = new URLSearchParams({
      session: sessionToken,
      to: params.toNumber,
      from: params.fromNumber,
    });
    if (params.recordName) qs.set("name", params.recordName);

    return {
      dialerUrl: `${frontendUrl}/dashboard/dialer/attio?${qs.toString()}`,
      sessionToken,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  validateCallSession(sessionToken: string): {
    userId: string;
    organizationId: string | null;
    toNumber: string;
    fromNumber: string;
  } {
    try {
      const payload = this.crypto.decrypt(sessionToken) as Record<
        string,
        unknown
      >;
      if (
        payload.type !== "attio_call_session" ||
        !payload.userId ||
        !payload.toNumber ||
        !payload.fromNumber
      ) {
        throw new UnauthorizedException("Invalid call session");
      }
      if (
        typeof payload.expiresAt === "number" &&
        payload.expiresAt < Date.now()
      ) {
        throw new UnauthorizedException("Call session expired");
      }
      return {
        userId: payload.userId as string,
        organizationId: (payload.organizationId as string) ?? null,
        toNumber: payload.toNumber as string,
        fromNumber: payload.fromNumber as string,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException("Invalid call session");
    }
  }
}
