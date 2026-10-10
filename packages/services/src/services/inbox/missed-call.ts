import { Call, InboxThread, InboxThreadStatus, Prisma } from "@ringee/database";

/**
 * An inbound call nobody took (CALL-015). `answeredAt` is the signal
 * (CALL-012), and a member's claim (`answeredByUserId`) counts too: it is
 * written before the media leg is answered, so it marks a call that was taken
 * even when the provider's `call.answered` arrives after the hangup.
 *
 * How long it rang is no signal: `durationSeconds` runs from the first ring,
 * so a call that rang for twenty seconds and was never answered lasts twenty
 * seconds.
 */
export function isMissedInboundCall(
  call: Pick<Call, "direction" | "answeredAt" | "answeredByUserId">,
): boolean {
  return (
    (call.direction === "inbound" || call.direction === "incoming") &&
    !call.answeredAt &&
    !call.answeredByUserId
  );
}

/**
 * Who a missed call on this conversation is for: in an organization, the
 * member it is assigned to in the inbox, otherwise the owner of the line; in a
 * personal workspace, its owner. That is whose "My day" queue lists it
 * (CALL-014), so it is also who is told about it.
 */
export function missedCallRecipientId(
  thread: Pick<InboxThread, "organizationId" | "assignedToId" | "userId">,
): string | null {
  if (thread.organizationId) return thread.assignedToId ?? thread.userId;
  return thread.userId;
}

/**
 * What a missed call changes on its conversation: it is new work, so a
 * resolved or archived conversation opens again, and an unassigned one in an
 * organization moves onto the line of the person the call rang for — the
 * call's owner (NUM-010) — so it reaches their queue rather than that of
 * whoever spoke to the caller first.
 */
export function missedCallThreadPatch(
  thread: Pick<
    InboxThread,
    "organizationId" | "assignedToId" | "userId" | "status"
  >,
  call: Pick<Call, "userId">,
): Prisma.InboxThreadUpdateInput {
  const reopen =
    thread.status === InboxThreadStatus.resolved ||
    thread.status === InboxThreadStatus.archived;
  const moveLine =
    !!thread.organizationId &&
    !thread.assignedToId &&
    !!call.userId &&
    thread.userId !== call.userId;
  return {
    ...(reopen
      ? {
          status: InboxThreadStatus.open,
          resolvedAt: null,
          archivedAt: null,
        }
      : {}),
    ...(moveLine ? { userId: call.userId } : {}),
  };
}
