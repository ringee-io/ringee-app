import { Injectable } from "@nestjs/common";
import {
  AiVoiceAgentCallParticipant,
  AiVoiceAgentHandoff,
  AiVoiceAgentHandoffPurpose,
  AiVoiceAgentHandoffRequestStatus,
  AiVoiceAgentHandoffStatus,
  AiVoiceAgentParticipantRole,
  AiVoiceAgentParticipantStatus,
  Prisma,
} from "@prisma/client";
import {
  createFollowUpInTransaction,
  observeFollowUp,
  type NewFollowUpObjective,
} from "./pending-action-follow-up.persistence";
import { PrismaService } from "../prisma.service";

const H = AiVoiceAgentHandoffStatus;
const R = AiVoiceAgentHandoffRequestStatus;
const P = AiVoiceAgentParticipantStatus;

/** The live handoff states a destination's first tool call may complete. */
const ACTIVATABLE: AiVoiceAgentHandoffStatus[] = [H.prepared, H.uncertain];

/** What a handoff request is created with — every field derived server-side. */
export interface AiVoiceAgentHandoffInput {
  userId: string;
  organizationId: string;
  purpose: AiVoiceAgentHandoffPurpose;
  agentCallId: string;
  callId: string | null;
  contactId: string | null;
  sourceAgentId: string;
  destinationAgentId: string | null;
  automationId: string | null;
  meetingId: string;
  meetingScheduleVersion: number;
  meetingScheduledAt: Date;
  reminderExecutionId: string | null;
  calendarId: string | null;
  responsibleUserId: string | null;
  reason: string;
  reasonNote: string | null;
  preferences: string | null;
  language: string;
  languageSource: string;
  context: Prisma.InputJsonValue;
  /** `prepared` when the destination was authorized, else `failed`. */
  status: AiVoiceAgentHandoffStatus;
  failureReason?: string | null;
  requestStatus: AiVoiceAgentHandoffRequestStatus;
  resolution?: string | null;
  idempotencyKey: string;
  reviewAt: Date;
}

/** What a participant's tools are bound to. */
export interface AiVoiceAgentParticipantBinding {
  meetingId: string | null;
  meetingScheduleVersion: number | null;
  calendarId: string | null;
}

export type AiVoiceAgentHandoffActivation =
  | {
      result: "activated" | "already_active";
      handoff: AiVoiceAgentHandoff;
      participant: AiVoiceAgentCallParticipant;
    }
  | {
      result: "not_found" | "not_activatable" | "other_destination";
      handoff: AiVoiceAgentHandoff | null;
    };

/**
 * One agent continuing another's call (AGENT-021): the handoff requests raised
 * on agent calls, and the participations their agents hold.
 *
 * Participations are children of a handoff — an agent call with no handoff has
 * no participants, and was held by `AiVoiceAgentCall.agentId` alone, exactly as
 * every call before handoffs was. Every transition here is compare-and-set, so
 * a provider replaying a tool call, two tools arriving at once or a worker
 * reconciling while a tool lands cannot move the same handoff twice.
 */
@Injectable()
export class AiVoiceAgentHandoffRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<AiVoiceAgentHandoff | null> {
    return this.prisma.aiVoiceAgentHandoff.findUnique({ where: { id } });
  }

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<AiVoiceAgentHandoff | null> {
    return this.prisma.aiVoiceAgentHandoff.findUnique({
      where: { idempotencyKey },
    });
  }

  /** The handoff raised on one agent call, newest first — one per purpose. */
  findForAgentCall(agentCallId: string): Promise<AiVoiceAgentHandoff | null> {
    return this.prisma.aiVoiceAgentHandoff.findFirst({
      where: { agentCallId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Stores the request before anything external happens, and — when the
   * destination was authorized — the source's own participation beside it, in
   * one transaction. The key makes a replayed tool call return the row the
   * first one wrote instead of a second request.
   */
  async createOnce(
    input: AiVoiceAgentHandoffInput,
    followUp?: NewFollowUpObjective,
  ): Promise<{ handoff: AiVoiceAgentHandoff; created: boolean }> {
    try {
      const handoff = await this.prisma.$transaction(async (tx) => {
        const created = await tx.aiVoiceAgentHandoff.create({
          data: { ...input, preparedAt: new Date() },
        });
        if (input.status === H.prepared) {
          await tx.aiVoiceAgentCallParticipant.createMany({
            data: [
              {
                organizationId: input.organizationId,
                agentCallId: input.agentCallId,
                agentId: input.sourceAgentId,
                handoffId: created.id,
                role: AiVoiceAgentParticipantRole.initial,
                sequence: 1,
                meetingId: input.meetingId,
                meetingScheduleVersion: input.meetingScheduleVersion,
                calendarId: input.calendarId,
              },
            ],
            skipDuplicates: true,
          });
        }
        if (followUp)
          await createFollowUpInTransaction(tx, created.id, followUp);
        return created;
      });
      return { handoff, created: true };
    } catch (error) {
      if (!isUniqueViolationOn(error, "idempotencyKey")) throw error;
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (!existing) throw error;
      return { handoff: existing, created: false };
    }
  }

  /**
   * The destination's first authenticated tool call on the call: the proof
   * the provider handed the conversation over.
   *
   * Under the handoff's row lock, one transaction completes the handoff, ends
   * the source's participation (it may not change anything from now on) and
   * opens the destination's, bound to the same meeting and version. A replay
   * finds the participation the first call opened. The call itself is not
   * touched: ending one participation never ends the call.
   */
  async activate(
    handoffId: string,
    destination: {
      agentId: string;
      binding: AiVoiceAgentParticipantBinding;
      now: Date;
    },
  ): Promise<AiVoiceAgentHandoffActivation> {
    return this.prisma.$transaction(async (tx) => {
      // Meeting mutations and participation activation share the same lock order.
      // A source cannot finish an attendance/cancellation write after handing off.
      const seed = await tx.aiVoiceAgentHandoff.findUnique({
        where: { id: handoffId },
      });
      if (!seed) return { result: "not_found" as const, handoff: null };
      await tx.$queryRaw`SELECT "id" FROM "Meeting" WHERE "id" = ${seed.meetingId}::uuid
        AND "organizationId" = ${seed.organizationId}::uuid FOR UPDATE`;
      const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AiVoiceAgentHandoff"
        WHERE "id" = ${handoffId}::uuid
        FOR UPDATE
      `;
      if (!locked) return { result: "not_found" as const, handoff: null };
      const handoff = await tx.aiVoiceAgentHandoff.findUniqueOrThrow({
        where: { id: handoffId },
      });
      if (handoff.destinationAgentId !== destination.agentId) {
        return { result: "other_destination" as const, handoff };
      }

      const existing = await tx.aiVoiceAgentCallParticipant.findUnique({
        where: {
          agentCallId_agentId: {
            agentCallId: handoff.agentCallId,
            agentId: destination.agentId,
          },
        },
      });
      if (handoff.status === H.completed && existing) {
        return {
          result: "already_active" as const,
          handoff,
          participant: existing,
        };
      }
      if (!ACTIVATABLE.includes(handoff.status)) {
        return { result: "not_activatable" as const, handoff };
      }

      const completed = await tx.aiVoiceAgentHandoff.update({
        where: { id: handoff.id },
        data: {
          status: H.completed,
          completedAt: destination.now,
          ...(handoff.status === H.uncertain
            ? { reconciledAt: destination.now }
            : {}),
        },
      });
      await tx.aiVoiceAgentCallParticipant.updateMany({
        where: {
          agentCallId: handoff.agentCallId,
          handoffId: handoff.id,
          role: AiVoiceAgentParticipantRole.initial,
          status: P.active,
        },
        data: { status: P.handed_off, endedAt: destination.now },
      });
      await tx.aiVoiceAgentCallParticipant.createMany({
        data: [
          {
            organizationId: handoff.organizationId,
            agentCallId: handoff.agentCallId,
            agentId: destination.agentId,
            handoffId: handoff.id,
            role: AiVoiceAgentParticipantRole.handoff,
            sequence: 2,
            ...destination.binding,
            startedAt: destination.now,
          },
        ],
        skipDuplicates: true,
      });
      const participant = await tx.aiVoiceAgentCallParticipant.findUnique({
        where: {
          agentCallId_agentId: {
            agentCallId: handoff.agentCallId,
            agentId: destination.agentId,
          },
        },
      });
      if (!participant) {
        // The sequence slot is taken by another agent: one handoff per call.
        throw new Error(
          `Handoff ${handoff.id} could not open the destination's participation`,
        );
      }
      await observeFollowUp(tx, handoff.id, {
        key: `handoff:${handoff.id}:activated`,
        kind: "handoff_completed",
        actorType: "agent",
        actorId: destination.agentId,
        at: destination.now,
      });
      return {
        result: "activated" as const,
        handoff: completed,
        participant,
      };
    });
  }

  /**
   * Ends the live attempt as failed, only from one of `from`. The source
   * reporting that it still holds the call, or the reconciler after the call
   * ended, are the two callers.
   */
  async failLive(
    id: string,
    from: AiVoiceAgentHandoffStatus[],
    data: { failureReason: string; lastError?: string | null; now: Date },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const { count } = await tx.aiVoiceAgentHandoff.updateMany({
        where: { id, status: { in: from } },
        data: {
          status: H.failed,
          failureReason: data.failureReason,
          failedAt: data.now,
          ...(from.includes(H.uncertain) ? { reconciledAt: data.now } : {}),
          ...(data.lastError
            ? { lastError: data.lastError.slice(0, 2000) }
            : {}),
        },
      });
      if (count)
        await observeFollowUp(tx, id, {
          key: `handoff:${id}:failed`,
          kind: "handoff_failed",
        });
      return count === 1;
    });
  }

  /** The call ended with the handoff still prepared: no proof either way. */
  async markUncertain(id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const { count } = await tx.aiVoiceAgentHandoff.updateMany({
        where: { id, status: H.prepared },
        data: { status: H.uncertain },
      });
      if (count)
        await observeFollowUp(tx, id, {
          key: `handoff:${id}:uncertain`,
          kind: "handoff_uncertain",
        });
      return count === 1;
    });
  }

  /** Evidence of the availability the specialist offered, and on which call. */
  async recordOffer(
    id: string,
    data: {
      agentCallId: string;
      slots: Array<{ start: string; label: string }>;
      now: Date;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${id}::uuid FOR UPDATE`;
      await tx.aiVoiceAgentHandoff.update({
        where: { id },
        data: {
          offeredSlots: data.slots as Prisma.InputJsonValue,
          offeredAt: data.now,
          offeredAgentCallId: data.agentCallId,
        },
      });
      await observeFollowUp(tx, id, {
        key: `offer:${data.agentCallId}:${data.slots.map((slot) => slot.start).join(",")}`,
        kind: "availability_offered",
        actorType: "agent",
        evidence: { slots: data.slots.map((slot) => slot.start) },
        at: data.now,
      });
    });
  }

  async recordExceptionalIntervention(
    id: string,
    participantId: string,
    delivered: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${id}::uuid FOR UPDATE`;
      await observeFollowUp(tx, id, {
        key: `support:${participantId}:${delivered}`,
        kind: "exceptional_escalation",
        actorType: "agent",
        evidence: { delivered },
      });
      await tx.aiVoiceAgentHandoff.updateMany({
        where: { id, requestStatus: "pending" },
        data: {
          requestStatus: "needs_attention",
          resolution: "human_support_requested",
        },
      });
    });
  }

  /**
   * Moves a pending request on. Compare-and-set on `pending`, so two workers —
   * or a worker and a tool — cannot both decide what happens to it.
   */
  async settleRequest(
    id: string,
    status: Exclude<AiVoiceAgentHandoffRequestStatus, "pending">,
    resolution: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const { count } = await tx.aiVoiceAgentHandoff.updateMany({
        where: { id, requestStatus: R.pending },
        data: {
          requestStatus: status,
          resolution,
          ...(status === R.resolved || status === R.closed
            ? { resolvedAt: now }
            : {}),
        },
      });
      if (count)
        await observeFollowUp(tx, id, {
          key: `handoff:${id}:request:${status}:${resolution}`,
          kind: "handoff_reviewed",
        });
      return count === 1;
    });
  }

  /** When the reconciler looks at a pending request next. */
  async scheduleReview(id: string, at: Date): Promise<void> {
    await this.prisma.aiVoiceAgentHandoff.updateMany({
      where: { id, requestStatus: R.pending },
      data: { reviewAt: at },
    });
  }

  /**
   * Counts a recovery call as planned. Compare-and-set on the count the
   * planner read, so a recovery is planned once however many ticks race.
   */
  async markRecoveryPlanned(
    id: string,
    expectedAttempts: number,
    reviewAt: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const { count } = await tx.aiVoiceAgentHandoff.updateMany({
        where: {
          id,
          requestStatus: R.pending,
          recoveryAttempts: expectedAttempts,
        },
        data: { recoveryAttempts: { increment: 1 }, reviewAt },
      });
      if (count)
        await observeFollowUp(tx, id, {
          key: `handoff:${id}:recovery:${expectedAttempts + 1}`,
          kind: "recovery_planned",
        });
      return count === 1;
    });
  }

  /** Pending requests due for a look, oldest first. */
  listDueForReview(now: Date, take: number): Promise<AiVoiceAgentHandoff[]> {
    return this.prisma.aiVoiceAgentHandoff.findMany({
      where: { requestStatus: R.pending, reviewAt: { lte: now } },
      orderBy: { reviewAt: "asc" },
      take,
    });
  }

  findParticipant(
    agentCallId: string,
    agentId: string,
  ): Promise<AiVoiceAgentCallParticipant | null> {
    return this.prisma.aiVoiceAgentCallParticipant.findUnique({
      where: { agentCallId_agentId: { agentCallId, agentId } },
    });
  }

  listParticipants(
    agentCallId: string,
  ): Promise<AiVoiceAgentCallParticipant[]> {
    return this.prisma.aiVoiceAgentCallParticipant.findMany({
      where: { agentCallId },
      orderBy: { sequence: "asc" },
    });
  }

  /** Whether another agent took this call over (a handoff participation). */
  async hasHandoffParticipant(agentCallId: string): Promise<boolean> {
    const count = await this.prisma.aiVoiceAgentCallParticipant.count({
      where: { agentCallId, role: AiVoiceAgentParticipantRole.handoff },
    });
    return count > 0;
  }

  /**
   * The participation of an agent placing a callback for a request, written
   * before the provider leg exists so the callback's tools are bound to the
   * request from its first word. A retry finds the row the first try wrote.
   */
  async createCallbackParticipant(input: {
    organizationId: string;
    agentCallId: string;
    agentId: string;
    handoffId: string;
    binding: AiVoiceAgentParticipantBinding;
  }): Promise<AiVoiceAgentCallParticipant> {
    await this.prisma.aiVoiceAgentCallParticipant.createMany({
      data: [
        {
          organizationId: input.organizationId,
          agentCallId: input.agentCallId,
          agentId: input.agentId,
          handoffId: input.handoffId,
          role: AiVoiceAgentParticipantRole.callback,
          sequence: 1,
          ...input.binding,
        },
      ],
      skipDuplicates: true,
    });
    const participant = await this.findParticipant(
      input.agentCallId,
      input.agentId,
    );
    if (!participant || participant.handoffId !== input.handoffId) {
      throw new Error(
        `Agent call ${input.agentCallId} already has another participation`,
      );
    }
    return participant;
  }

  /** The call is over: whoever still held it has finished their part. */
  async endActiveParticipants(agentCallId: string, now: Date): Promise<void> {
    await this.prisma.aiVoiceAgentCallParticipant.updateMany({
      where: { agentCallId, status: P.active },
      data: { status: P.ended, endedAt: now },
    });
  }

  /** A conversation the provider reported for one participant only. */
  async setParticipantConversation(
    id: string,
    providerConversationId: string,
  ): Promise<void> {
    await this.prisma.aiVoiceAgentCallParticipant.updateMany({
      where: { id, providerConversationId: null },
      data: { providerConversationId },
    });
  }
}

/** A unique violation on one column — and only that one is "already exists". */
function isUniqueViolationOn(error: unknown, column: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes(column)
    : String(target ?? "").includes(column);
}
