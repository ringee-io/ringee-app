import { randomUUID } from "node:crypto";
import {
  CallbackTask,
  Meeting,
  MeetingEmailKind,
  Prisma,
} from "@prisma/client";
import {
  buildOwnershipFilter,
  isInWorkspace,
  isSameWorkspace,
  OwnershipContext,
  workspaceOf,
} from "@ringee/platform";
import {
  applyFollowUpPlan,
  lockFollowUp,
} from "./pending-action-follow-up.persistence";
import { isWorkspaceMemberInTransaction } from "./workspace-scope";

/** Transaction helpers of the meeting aggregate, also used when a callback is
 * committed. Identifiers here are server-derived, and are checked again at write. */
export async function meetingActor(
  tx: Prisma.TransactionClient,
  ctx: OwnershipContext,
  input: { agentCallId: string; agentId: string },
) {
  const call = await tx.aiVoiceAgentCall.findFirst({
    where: { id: input.agentCallId, ...buildOwnershipFilter(ctx) },
    include: { call: true, agent: true },
  });
  if (
    !call?.call ||
    call.call.endedAt ||
    !["pending", "answered", "ringing", "recording"].includes(
      call.call.status,
    ) ||
    !isInWorkspace(ctx, call.call) ||
    call.call.contactId !== call.contactId
  )
    return null;
  const participant = await tx.aiVoiceAgentCallParticipant.findUnique({
    where: {
      agentCallId_agentId: { agentCallId: call.id, agentId: input.agentId },
    },
  });
  if (participant && (participant.status !== "active" || participant.endedAt))
    return null;
  if (!participant && call.agentId !== input.agentId) return null;
  const agent = await tx.aiVoiceAgent.findFirst({
    where: {
      id: input.agentId,
      ...buildOwnershipFilter(ctx),
      status: "active",
      deletedAt: null,
    },
  });
  if (
    !agent ||
    !(await tx.contact.count({
      where: {
        id: call.contactId ?? "00000000-0000-0000-0000-000000000000",
        ...buildOwnershipFilter(ctx),
        deletedAt: null,
      },
    })) ||
    !(await isWorkspaceMemberInTransaction(tx, ctx, call.userId))
  )
    return null;
  return { call, participant, agent };
}

export async function lockMeetingRequest(
  tx: Prisma.TransactionClient,
  meeting: Meeting,
  actor: NonNullable<Awaited<ReturnType<typeof meetingActor>>>,
  expectedVersion: number,
) {
  const participant = actor.participant;
  if (
    !participant ||
    participant.meetingId !== meeting.id ||
    participant.meetingScheduleVersion !== expectedVersion ||
    !isSameWorkspace(
      {
        // Participations written before personal workspaces carry no owner.
        userId: participant.userId ?? actor.call.userId,
        organizationId: participant.organizationId,
      },
      meeting,
    ) ||
    participant.calendarId !== meeting.calendarId
  )
    return null;
  await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${participant.handoffId}::uuid FOR UPDATE`;
  const handoff = await tx.aiVoiceAgentHandoff.findUnique({
    where: { id: participant.handoffId },
  });
  const currentParticipant = await tx.aiVoiceAgentCallParticipant.findUnique({
    where: { id: participant.id },
  });
  if (currentParticipant?.status !== "active" || currentParticipant.endedAt)
    return null;
  if (
    !handoff ||
    !isSameWorkspace(handoff, meeting) ||
    handoff.contactId !== meeting.contactId ||
    handoff.calendarId !== meeting.calendarId ||
    handoff.responsibleUserId !==
      (meeting.responsibleUserId ?? meeting.userId) ||
    handoff.destinationAgentId !== actor.agent.id ||
    actor.call.contactId !== meeting.contactId
  )
    return null;
  const seed = await tx.pendingActionFollowUp.findUnique({
    where: { handoffId: handoff.id },
  });
  const objective = seed ? await lockFollowUp(tx, seed.id) : null;
  if (
    objective &&
    (objective.mode !== "automatic" ||
      ["blocked", "resolved", "closed"].includes(objective.state) ||
      objective.expiresAt <= new Date())
  )
    return null;
  if (handoff.requestStatus !== "pending" && objective?.state !== "paused")
    return null;
  if (
    !(await isWorkspaceMemberInTransaction(
      tx,
      workspaceOf(handoff),
      meeting.responsibleUserId ?? meeting.userId,
    ))
  )
    return null;
  const callback =
    participant.role === "callback"
      ? await tx.callbackTask.findUnique({
          where: { agentCallId: actor.call.id },
        })
      : null;
  if (
    participant.role === "callback" &&
    (!callback?.dispatchCommittedAt ||
      callback.handoffId !== handoff.id ||
      (objective && callback.followUpId !== objective.id))
  )
    return null;
  return { handoff, objective, callback };
}

export async function recordMeetingAction(
  tx: Prisma.TransactionClient,
  input: {
    key: string;
    meeting: Meeting;
    actor: NonNullable<Awaited<ReturnType<typeof meetingActor>>>;
    kind: string;
    receipt?: MeetingEmailKind;
    previousScheduledAt?: Date | null;
    handoffId?: string | null;
    followUpId?: string | null;
    callbackId?: string | null;
    language?: string;
    evidence?: Prisma.InputJsonObject;
  },
) {
  const { meeting, actor } = input;
  const existing = await tx.meetingAutomationAction.findUnique({
    where: { actionKey: input.key },
  });
  if (existing) return existing;
  const id = randomUUID();
  const action = await tx.meetingAutomationAction.create({
    data: {
      id,
      actionKey: input.key,
      organizationId: meeting.organizationId,
      userId: actor.call.userId,
      meetingId: meeting.id,
      contactId: meeting.contactId,
      callId: actor.call.callId,
      agentCallId: actor.call.id,
      agentId: actor.agent.id,
      kind: input.kind,
      scheduleVersion: meeting.scheduleVersion,
      scheduledAt: meeting.scheduledAt,
      previousScheduledAt: input.previousScheduledAt,
      language: input.language ?? actor.agent.voiceLanguage ?? "en",
      handoffId: input.handoffId,
      followUpId: input.followUpId,
      callbackId: input.callbackId,
      evidence: { ...input.evidence, attribution: "agent_tool", actionId: id },
    },
  });
  // Both histories are committed with the result. A later analysis or repair
  // never overwrites a human-edited note or revives a deleted one.
  await tx.contactNote.create({
    data: {
      contactId: meeting.contactId,
      userId: actor.call.userId,
      automationActionId: id,
      actorType: "ai",
      agentId: actor.agent.id,
      content: `AI · ${input.kind} · ${meeting.scheduledAt.toISOString()} · action ${id}`,
    },
  });
  if (input.receipt) {
    const automation = await tx.aiVoiceAgentAutomation.findFirst({
      where: {
        ...buildOwnershipFilter(workspaceOf(meeting)),
        capability: "appointment_booking",
      },
    });
    const policy = (
      automation?.settings as { receiptRecipients?: string } | null
    )?.receiptRecipients;
    // Missing means a pre-existing workspace's policy, never implicit adoption.
    const audiences =
      policy === "contact_responsible"
        ? ["responsible", "contact"]
        : ["legacy", "contact_late"];
    await tx.meetingEmailDelivery.createMany({
      data: audiences.map((audience) => ({
        userId: meeting.userId,
        organizationId: meeting.organizationId,
        meetingId: meeting.id,
        actionId: id,
        agentCallId: actor.call.id,
        kind: input.receipt!,
        audience,
        scheduleVersion: meeting.scheduleVersion,
        previousScheduledAt: input.previousScheduledAt,
        idempotencyKey: `action:${id}:${audience}`,
      })),
      skipDuplicates: true,
    });
  }
  return action;
}

export async function resolveMeetingRequest(
  tx: Prisma.TransactionClient,
  request: NonNullable<Awaited<ReturnType<typeof lockMeetingRequest>>>,
  action: Awaited<ReturnType<typeof recordMeetingAction>>,
) {
  const evidence = {
    kind: "stored_authorized_meeting_action",
    actionId: action.id,
    meetingId: action.meetingId,
    agentCallId: action.agentCallId,
    agentId: action.agentId,
    result: action.kind,
    from: action.previousScheduledAt?.toISOString() ?? null,
    to: action.scheduledAt.toISOString(),
    scheduleVersion: action.scheduleVersion,
    attribution: "agent_tool",
  };
  if (request.objective) {
    await applyFollowUpPlan(
      tx,
      request.objective,
      {
        state: "resolved",
        reason: action.kind,
        nextAction: null,
        nextActionAt: null,
        evidence,
      },
      {
        key: `action:${action.id}`,
        kind: "objective_resolved",
        actorType: "agent",
        actorId: action.agentId,
        evidence,
      },
      new Date(),
    );
  } else {
    await tx.aiVoiceAgentHandoff.update({
      where: { id: request.handoff.id },
      data: {
        requestStatus: "resolved",
        resolution: action.kind,
        resolvedAt: new Date(),
      },
    });
    await tx.callbackTask.updateMany({
      where: {
        handoffId: request.handoff.id,
        status: { in: ["scheduled", "due"] },
        dispatchCommittedAt: null,
      },
      data: {
        status: "cancelled",
        reason: "objective_resolved",
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
  }
}

export async function recordAgreedCallbackAction(
  tx: Prisma.TransactionClient,
  callback: CallbackTask,
) {
  if (
    callback.agentCallbackKind !== "agreed" ||
    !callback.handoffId ||
    !callback.callId
  )
    return;
  const handoff = await tx.aiVoiceAgentHandoff.findUnique({
    where: { id: callback.handoffId },
  });
  const source = await tx.aiVoiceAgentCall.findUnique({
    where: { callId: callback.callId },
  });
  if (!handoff || !source || !isSameWorkspace(source, callback)) return;
  const active = await tx.aiVoiceAgentCallParticipant.findFirst({
    where: { agentCallId: source.id, status: "active" },
    orderBy: { sequence: "desc" },
  });
  const actor = await meetingActor(
    tx,
    { userId: callback.userId, organizationId: callback.organizationId },
    { agentCallId: source.id, agentId: active?.agentId ?? source.agentId },
  );
  if (!actor)
    throw new Error("The callback conversation is no longer authorized");
  const meeting = await tx.meeting.findFirst({
    where: {
      id: handoff.meetingId,
      ...buildOwnershipFilter(workspaceOf(callback)),
      contactId: callback.contactId,
    },
  });
  if (!meeting) return;
  await recordMeetingAction(tx, {
    key: `callback:${callback.id}:${callback.scheduledAt.toISOString()}`,
    meeting,
    actor,
    kind: "recovery_callback",
    receipt: "recovery_callback",
    handoffId: handoff.id,
    followUpId: callback.followUpId,
    callbackId: callback.id,
    language: handoff.language,
    evidence: {
      scheduledAt: callback.scheduledAt.toISOString(),
      timingBasis: "agreed",
      failureReason: handoff.failureReason,
    },
  });
}
