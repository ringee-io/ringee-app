import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AgentSessionStatus,
  Call,
  CallbackStatus,
  CallOutcome,
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
    calls: {
      include: {
        recordings: true;
        callAttempts: { select: { campaign: { select: { name: true } } } };
      };
    };
    callbacks: true;
    meetings: true;
    affiliations: {
      include: {
        company: {
          select: {
            name: true;
            industry: true;
            employeeCount: true;
            employeeCountRange: true;
            revenueRange: true;
          };
        };
      };
    };
  };
}>;

/** Where a contact was left: their latest note and latest call outcome. */
export interface MobileContactContext {
  lastNote: { content: string; at: Date } | null;
  lastOutcome: { outcome: CallOutcome; at: Date } | null;
}

/** The caller's own work in one campaign over a period. */
export interface MobileCampaignActivity {
  calls: number;
  connected: number;
  meetings: number;
}

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
          include: {
            recordings: { take: 1, orderBy: { createdAt: "desc" } },
            callAttempts: {
              take: 1,
              select: { campaign: { select: { name: true } } },
            },
          },
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
        // The company the contact works for, as its card shows it.
        affiliations: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          include: {
            company: {
              select: {
                name: true,
                industry: true,
                employeeCount: true,
                employeeCountRange: true,
                revenueRange: true,
              },
            },
          },
        },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    this.assertVisible(contact, ctx);
    return contact;
  }

  /**
   * The call a provider session belongs to, once its row exists. The phone
   * holds the session id while the call is up; everything after it — the
   * outcome, the transcript — is keyed by the call.
   */
  async findVisibleCallBySession(
    ctx: OwnershipContext,
    sessionId: string,
  ): Promise<MobileCallDetail | null> {
    const call = await this.prisma.call.findFirst({
      where: {
        OR: [
          { callSessionId: sessionId },
          {
            ringAttempts: {
              some: {
                OR: [
                  { providerCallSessionId: sessionId },
                  { recipientCallSessionId: sessionId },
                ],
              },
            },
          },
        ],
      },
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
    if (!call) return null;
    this.assertVisible(call, ctx);
    return call;
  }

  /**
   * Where each contact was left: their latest note — on the contact, or the
   * outcome note of a call — and their latest call outcome. Contacts outside
   * the caller's workspace read as having neither.
   */
  async contactsContext(
    ctx: OwnershipContext,
    contactIds: string[],
  ): Promise<Map<string, MobileContactContext>> {
    const ids = [...new Set(contactIds)];
    const context = new Map<string, MobileContactContext>();
    if (ids.length === 0) return context;

    const workspace = ctx.organizationId
      ? { organizationId: ctx.organizationId }
      : { organizationId: null, userId: ctx.userId };
    const calls = { contactId: { in: ids }, ...workspace };

    const [notes, callNotes, outcomes] = await Promise.all([
      this.prisma.contactNote.findMany({
        where: { contactId: { in: ids }, deletedAt: null, contact: workspace },
        orderBy: { createdAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, content: true, createdAt: true },
      }),
      this.prisma.call.findMany({
        where: {
          ...calls,
          outcomeNote: { not: null },
          NOT: { outcomeNote: "" },
        },
        orderBy: { createdAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, outcomeNote: true, createdAt: true },
      }),
      this.prisma.call.findMany({
        where: { ...calls, outcome: { not: null } },
        orderBy: { createdAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, outcome: true, createdAt: true },
      }),
    ]);

    const entry = (id: string) => {
      const existing = context.get(id);
      if (existing) return existing;
      const fresh: MobileContactContext = { lastNote: null, lastOutcome: null };
      context.set(id, fresh);
      return fresh;
    };
    const keepLatestNote = (id: string, content: string, at: Date) => {
      const row = entry(id);
      if (!row.lastNote || row.lastNote.at < at) row.lastNote = { content, at };
    };
    for (const note of notes) {
      keepLatestNote(note.contactId, note.content, note.createdAt);
    }
    for (const call of callNotes) {
      if (call.contactId && call.outcomeNote) {
        keepLatestNote(call.contactId, call.outcomeNote, call.createdAt);
      }
    }
    for (const call of outcomes) {
      if (call.contactId && call.outcome) {
        entry(call.contactId).lastOutcome = {
          outcome: call.outcome,
          at: call.createdAt,
        };
      }
    }
    return context;
  }

  /**
   * The caller's own calls in one campaign since `from` — the start of their
   * day: how many were placed, answered, and ended in a meeting.
   */
  async campaignActivity(
    ctx: OwnershipContext,
    campaignId: string,
    from: Date,
  ): Promise<MobileCampaignActivity> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true, organizationId: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    this.assertVisible(campaign, ctx);

    const placed: Prisma.CallAttemptWhereInput = {
      campaignId,
      agentUserId: ctx.userId,
      initiatedAt: { gte: from },
      callId: { not: null },
    };
    const [calls, connected, meetings] = await Promise.all([
      this.prisma.callAttempt.count({ where: placed }),
      this.prisma.callAttempt.count({
        where: { ...placed, answeredAt: { not: null } },
      }),
      this.prisma.callAttempt.count({
        where: {
          ...placed,
          // Attempts recorded before canonical outcomes existed carry the
          // outcome as their code.
          OR: [
            { dispositionOutcome: CallOutcome.meeting_booked },
            {
              dispositionOutcome: null,
              dispositionCode: CallOutcome.meeting_booked,
            },
          ],
        },
      }),
    ]);
    return { calls, connected, meetings };
  }

  /**
   * The caller's campaign sessions still open in their organization — what
   * the mobile app offers to resume.
   */
  async openAgentSessions(ctx: OwnershipContext) {
    if (!ctx.organizationId) return [];
    return this.prisma.agentSession.findMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        status: { not: AgentSessionStatus.offline },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        updatedAt: true,
        callsAttempted: true,
        callsConnected: true,
        totalTalkSec: true,
        campaign: {
          select: { id: true, name: true, dialerMode: true, status: true },
        },
      },
    });
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
