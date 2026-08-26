import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Call,
  CallbackStatus,
  Contact,
  MeetingStatus,
  Prisma,
  PrismaService,
  TranscriptionStatus,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

/**
 * Explicit payload types. Prisma's inferred deep-include types reference its
 * generated runtime, which cannot be named across a package boundary — so the
 * shapes are declared here instead of inferred.
 */
export type MobileCallDetail = Prisma.CallGetPayload<{
  include: {
    contact: { include: { notes: true } };
    recordings: true;
  };
}>;

export type MobileContactDetail = Prisma.ContactGetPayload<{
  include: {
    notes: true;
    calls: { include: { recordings: true } };
    callbacks: true;
    meetings: true;
  };
}>;

/**
 * Read shapes the mobile app needs.
 *
 * These live here rather than in the controller because every one of them is a
 * workspace-scoped read: the row is loaded and then checked against the
 * caller's workspace before it is returned (WRK-002). Keeping the query and its
 * ownership check together is the point — a controller that owns half of that
 * pair is one refactor away from dropping the other half.
 *
 * The include shapes are mobile-specific (they feed the mobile DTOs), which is
 * why this is its own service rather than extra options on CallService.
 */
@Injectable()
export class MobileReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A workspace-scoped row is visible when it belongs to the caller's active
   * organization, or — with no organization — to the caller personally.
   * Missing and forbidden both surface as NotFound so the endpoint never
   * confirms that someone else's id exists.
   */
  private assertVisible(
    row: { userId: string | null; organizationId: string | null },
    ctx: OwnershipContext,
  ): void {
    const visible = ctx.organizationId
      ? row.organizationId === ctx.organizationId
      : row.organizationId === null && row.userId === ctx.userId;
    if (!visible) throw new NotFoundException("Not found");
  }

  /** Call detail with the contact, its recent notes and the latest recording. */
  async getCallDetail(
    ctx: OwnershipContext,
    id: string,
  ): Promise<MobileCallDetail> {
    const call = await this.prisma.call.findUnique({
      where: { id },
      include: {
        contact: {
          include: {
            notes: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
        recordings: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!call) throw new NotFoundException("Call not found");
    this.assertVisible(call, ctx);
    return call;
  }

  /** A call the caller may act on. */
  async getVisibleCall(ctx: OwnershipContext, id: string): Promise<Call> {
    const call = await this.prisma.call.findUnique({ where: { id } });
    if (!call) throw new NotFoundException("Call not found");
    this.assertVisible(call, ctx);
    return call;
  }

  /** A contact the caller may act on. */
  async getVisibleContact(ctx: OwnershipContext, id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertVisible(contact, ctx);
    return contact;
  }

  /**
   * Contact detail: recent notes and calls, plus the next callback and the
   * next meeting. The takes are what the mobile detail screen renders.
   */
  async getContactDetail(
    ctx: OwnershipContext,
    id: string,
  ): Promise<MobileContactDetail> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        notes: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        calls: {
          orderBy: { createdAt: "desc" },
          take: 15,
          include: { recordings: { take: 1, orderBy: { createdAt: "desc" } } },
        },
        callbacks: {
          where: {
            status: { in: [CallbackStatus.scheduled, CallbackStatus.due] },
          },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
        meetings: {
          where: {
            scheduledAt: { gte: new Date() },
            status: {
              in: [MeetingStatus.scheduled, MeetingStatus.rescheduled],
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertVisible(contact, ctx);
    return contact;
  }

  /**
   * Append a line to a call's `outcomeNote`.
   *
   * Used only when a call has no contact to hang the note off — notes normally
   * live on the contact, which is the single source of truth in this schema.
   */
  async appendCallOutcomeNote(
    ctx: OwnershipContext,
    id: string,
    line: string,
  ): Promise<void> {
    const call = await this.getVisibleCall(ctx, id);
    const stamped = `[${new Date().toISOString()}] ${line}`;
    const next = call.outcomeNote ? `${call.outcomeNote}\n${stamped}` : stamped;
    await this.prisma.call.update({
      where: { id },
      data: { outcomeNote: next },
    });
  }

  /** Of the given call ids, those with a completed transcription. */
  async transcribedCallIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.callTranscription.findMany({
      where: { callId: { in: ids }, status: TranscriptionStatus.completed },
      select: { callId: true },
    });
    return new Set(rows.map((r) => r.callId));
  }
}
