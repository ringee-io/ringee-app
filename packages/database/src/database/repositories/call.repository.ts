import { Injectable, Logger } from "@nestjs/common";
import { Prisma, Call, CallStatus, CallOutcome } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";

@Injectable()
export class CallRepository {
  private readonly logger = new Logger(CallRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async createCall(
    ctx: OwnershipContext,
    data: Omit<Prisma.CallCreateInput, "user" | "organization">,
  ): Promise<Call> {
    return this.prisma.call.create({
      data: {
        ...data,
        user: { connect: { id: ctx.userId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
      },
    });
  }

  async findById(id: string): Promise<Call | null> {
    return this.prisma.call.findUnique({ where: { id } });
  }

  /**
   * Adopt a pre-created call (e.g. an SDK `source="sdk"` row created at
   * authorize time) by attaching the telephony identifiers the Telnyx webhook
   * discovered when the WebRTC leg actually connected. Used instead of a second
   * `createCall` so the SDK's up-front row is the one that lives on.
   */
  async attachTelephony(
    id: string,
    data: {
      callControlId: string;
      callSessionId?: string | null;
      callLegId?: string | null;
      connectionId?: string | null;
      startedAt?: string | Date | null;
      status?: CallStatus;
      callerIdId?: string | null;
    },
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { id },
      data: {
        callControlId: data.callControlId,
        callSessionId: data.callSessionId ?? undefined,
        callLegId: data.callLegId ?? undefined,
        connectionId: data.connectionId ?? undefined,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        status: data.status ?? undefined,
        callerId: data.callerIdId
          ? { connect: { id: data.callerIdId } }
          : undefined,
        updatedAt: new Date(),
      },
    });
  }

  async findByControlId(callControlId: string): Promise<Call | null> {
    return this.prisma.call.findUnique({ where: { callControlId } });
  }

  async findManyByIds(ids: string[]): Promise<Call[]> {
    if (ids.length === 0) return [];
    return this.prisma.call.findMany({ where: { id: { in: ids } } });
  }

  async findBySessionId(callSessionId: string): Promise<Call[]> {
    return this.prisma.call.findMany({ where: { callSessionId } });
  }

  async findOneBySessionId(callSessionId: string): Promise<Call | null> {
    return this.prisma.call.findFirst({ where: { callSessionId } });
  }

  async findActiveByOwner(ctx: OwnershipContext): Promise<Call[]> {
    const ownershipFilter = buildOwnershipFilter(ctx);
    return this.prisma.call.findMany({
      where: {
        ...ownershipFilter,
        status: {
          in: [
            CallStatus.pending,
            CallStatus.ringing,
            CallStatus.answered,
            CallStatus.recording,
          ],
        },
      },
    });
  }

  /**
   * Every live call placed BY this user, regardless of workspace. Unlike
   * {@link findActiveByOwner} this deliberately ignores the ownership context:
   * an account-level enforcement action (ban, forced disconnect) must reach the
   * user's personal calls and their calls in any organization alike.
   */
  async findActiveByUserId(userId: string): Promise<Call[]> {
    return this.prisma.call.findMany({
      where: {
        userId,
        endedAt: null,
        status: {
          in: [
            CallStatus.pending,
            CallStatus.ringing,
            CallStatus.answered,
            CallStatus.recording,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Every call that still claims to be live, across all users, whose row is
   * older than the cutoff for its status. These are candidates for the stale
   * call sweep: a call this old is almost always a `call.hangup` webhook that
   * never arrived, and while the row stands it keeps occupying its owner's
   * single call slot.
   */
  async findStuckActive(params: {
    ringingBefore: Date;
    connectedBefore: Date;
    limit?: number;
  }): Promise<Call[]> {
    return this.prisma.call.findMany({
      where: {
        endedAt: null,
        OR: [
          {
            status: CallStatus.ringing,
            createdAt: { lt: params.ringingBefore },
          },
          {
            status: { in: [CallStatus.answered, CallStatus.recording] },
            createdAt: { lt: params.connectedBefore },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: params.limit ?? 100,
    });
  }

  /**
   * Close a call that was terminated by the platform rather than by a hangup
   * webhook. Kept idempotent: a late `call.hangup` may still arrive and will
   * simply overwrite the timings with the provider's own values.
   */
  async markForciblyEnded(id: string, errorMessage: string): Promise<Call> {
    const call = await this.prisma.call.findUnique({ where: { id } });
    const endedAt = new Date();
    const startedAt = call?.startedAt ?? call?.createdAt ?? endedAt;

    // Same rule as completeCall: an outbound leg that ends without ever firing
    // `call.answered` never connected, so it is a no_answer. Without this a
    // force-closed call would sit outcome-less forever and never surface in
    // dashboards/CRM (answered is measured from `outcome`, not `answeredAt`).
    const neverConnected =
      !!call &&
      !call.answeredAt &&
      !call.outcome &&
      call.direction !== "inbound" &&
      call.direction !== "incoming";

    return this.prisma.call.update({
      where: { id },
      data: {
        status: CallStatus.completed,
        endedAt,
        durationSeconds:
          call?.durationSeconds ??
          Math.max(
            0,
            Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
          ),
        errorMessage,
        ...(neverConnected ? { outcome: CallOutcome.no_answer } : {}),
      },
    });
  }

  async updateStatus(callControlId: string, status: CallStatus): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        status,
        answeredAt: status === CallStatus.answered ? new Date() : undefined,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Close a call from its `call.hangup` webhook. Returns `null` when the row
   * does not exist yet — the provider does not guarantee webhook ordering, so
   * a hangup can genuinely arrive before the call was persisted. The caller is
   * responsible for replaying it (see CallService.parkOrphanCallEvent);
   * swallowing it here would leave the row `ringing` forever.
   */
  async completeCall(
    callControlId: string,
    startedAt: string,
    endedAt: string,
    hangupCause?: string,
  ): Promise<Call | null> {
    const call = await this.findByControlId(callControlId);

    if (!call) {
      this.logger.warn(
        `call.hangup for unknown call ${callControlId} — nothing to complete`,
      );
      return null;
    }

    // Never trust the provider's timestamps blindly: a missing/malformed
    // start_time used to produce an Invalid Date, which made the update throw
    // and left the call stuck in `ringing` — permanently occupying the user's
    // single call slot.
    const endedAtDate = this.parseDate(endedAt) ?? new Date();
    const startedAtDate =
      this.parseDate(startedAt) ?? call.startedAt ?? call.createdAt;
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAtDate.getTime() - startedAtDate.getTime()) / 1000),
    );

    // An outbound call that ends without ever firing `call.answered` never
    // connected — auto-disposition it as no_answer so it surfaces in
    // dashboards/CRM as unanswered. Never overwrite an agent-set outcome, and
    // leave inbound calls alone (a missed inbound is not a "no contesta").
    const neverConnected =
      !call.answeredAt &&
      !call.outcome &&
      call.direction !== "inbound" &&
      call.direction !== "incoming";

    return this.prisma.call.update({
      where: { callControlId },
      data: {
        status: CallStatus.completed,
        endedAt: endedAtDate,
        startedAt: startedAtDate,
        durationSeconds,
        ...(hangupCause ? { hangupCause } : {}),
        ...(neverConnected ? { outcome: CallOutcome.no_answer } : {}),
      },
    });
  }

  /** `null` for a missing/unparseable provider timestamp. */
  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async updateControlState(
    callControlId: string,
    params: {
      clientState?: string;
      lastCommandId?: string;
      lastEventType?: string;
      errorMessage?: string | null;
    },
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        ...params,
        updatedAt: new Date(),
      },
    });
  }

  async logEvent(
    callControlId: string,
    eventType: string,
    details?: any,
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        lastEventType: eventType,
        directionMeta:
          details && Object.keys(details).length > 0
            ? { ...details, timestamp: new Date().toISOString() }
            : Prisma.JsonNull,
      },
    });
  }

  async updateOutcome(
    callId: string,
    outcome: CallOutcome,
    outcomeNote?: string,
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { id: callId },
      data: {
        outcome,
        ...(outcomeNote !== undefined ? { outcomeNote } : {}),
      },
    });
  }

  /**
   * Persist just the note — used by campaign dispositions whose custom codes
   * don't map onto the CallOutcome enum but whose notes must still reach the
   * CRM call-log.
   */
  async updateOutcomeNote(callId: string, outcomeNote: string): Promise<Call> {
    return this.prisma.call.update({
      where: { id: callId },
      data: { outcomeNote },
    });
  }

  async deleteCall(callControlId: string): Promise<void> {
    await this.prisma.call.delete({ where: { callControlId } });
  }

  async listByOwnerPaginated(
    ctx: OwnershipContext,
    options: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
      outcome?: CallOutcome[];
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
      /** Only calls dialed as part of this campaign (via CallAttempt). */
      campaignId?: string;
      excludeCampaignCalls?: boolean;
      includeMeetings?: boolean;
      includeTranscriptions?: boolean;
      /** Narrow org-wide results to a single member (admin filter / member self). */
      userId?: string;
      orderBy?: "createdAt" | "startedAt" | "endedAt";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      outcome,
      contactId,
      dateFrom,
      dateTo,
      campaignId,
      excludeCampaignCalls,
      includeMeetings,
      includeTranscriptions,
      userId,
      orderBy = "createdAt",
      sortDirection = "desc",
    } = options;

    const skip = (Number(page) - 1) * Number(limit);

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.CallWhereInput = {
      ...ownershipFilter,
      ...(userId ? { userId } : {}),
      ...(status ? { status: { in: status } } : {}),
      ...(outcome ? { outcome: { in: outcome } } : {}),
      ...(contactId ? { contactId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...(campaignId ? { callAttempts: { some: { campaignId } } } : {}),
      ...(excludeCampaignCalls ? { callAttempts: { none: {} } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { [orderBy]: sortDirection },
        include: {
          contact: includeMeetings
            ? {
                include: {
                  meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
                },
              }
            : true,
          user: true,
          recordings: true,
          ...(includeTranscriptions ? { callTranscriptions: true } : {}),
          ...(includeMeetings
            ? { meetings: { orderBy: { scheduledAt: "desc" }, take: 1 } }
            : {}),
        },
      }),
      this.prisma.call.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateCost(
    callControlId: string,
    totalCost: number,
    costMeta: any,
  ): Promise<Call> {
    return this.prisma.call.update({
      where: { callControlId },
      data: {
        totalCost,
        costMeta,
      },
    });
  }

  async listWithRecordings(params: {
    ctx: OwnershipContext;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
    /** Narrow org-wide results to a single member (admin filter / member self). */
    filterUserId?: string;
  }): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      ctx,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      filterUserId,
    } = params;
    const skip = (Number(page) - 1) * Number(limit);

    const ownershipFilter = buildOwnershipFilter(ctx);
    const where: Prisma.CallWhereInput = {
      ...ownershipFilter,
      ...(filterUserId ? { userId: filterUserId } : {}),
      createdAt: {
        gte: dateFrom,
        lte: dateTo,
      },
      recordings: {
        some: {},
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          recordings: true,
          contact: true,
          user: true,
        },
      }),
      this.prisma.call.count({ where }),
    ]);

    return {
      data,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    };
  }
}
