import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  InboxThreadRepository,
  InboxEventRepository,
  ContactRepository,
  NumberPurchasedRepository,
  Call,
  Recording,
  Contact,
  InboxThread,
  InboxEvent,
  InboxEventDirection,
  InboxEventKind,
  InboxEventStatus,
  InboxThreadStatus,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

const PREVIEW_MAX = 280;

function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  // Already E.164-ish
  if (/^\+\d{6,15}$/.test(trimmed)) return trimmed;
  // Strip non-digits and prepend + if it looks like an international number.
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10) return `+1${digits}`; // assume US/CA
  return `+${digits}`;
}

function previewFor(kind: InboxEventKind, body?: string | null): string {
  if (body && body.trim().length > 0) {
    return body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX - 1)}…` : body;
  }
  switch (kind) {
    case InboxEventKind.missed_call:
      return "Missed call";
    case InboxEventKind.call_completed:
      return "Call completed";
    case InboxEventKind.call_answered:
      return "Call answered";
    case InboxEventKind.call_started:
      return "Call started";
    case InboxEventKind.voicemail_received:
      return "Voicemail received";
    case InboxEventKind.voicemail_drop_sent:
      return "Voicedrop sent";
    case InboxEventKind.note_added:
      return "Note added";
    case InboxEventKind.callback_scheduled:
      return "Callback scheduled";
    case InboxEventKind.callback_completed:
      return "Callback completed";
    case InboxEventKind.meeting_booked:
      return "Meeting booked";
    case InboxEventKind.message_failed:
      return "Message failed";
    default:
      return kind.replace(/_/g, " ");
  }
}

export interface AppendBaseInput {
  threadId: string;
  occurredAt?: Date;
  createdByUserId?: string | null;
  metadata?: any;
}

@Injectable()
export class InboxTimelineService {
  private readonly logger = new Logger(InboxTimelineService.name);

  constructor(
    private readonly threadRepo: InboxThreadRepository,
    private readonly eventRepo: InboxEventRepository,
    private readonly contactRepo: ContactRepository,
    private readonly numberRepo: NumberPurchasedRepository,
  ) {}

  /**
   * Lifecycle hook (Nest calls this once on app boot).
   * Surfaces a loud error if the inbox tables are missing so we don't
   * silently swallow Prisma errors at runtime.
   */
  async onModuleInit() {
    try {
      // Touches the table; throws P2021 if migration hasn't been applied.
      await this.threadRepo.listByOwner(
        { userId: "00000000-0000-0000-0000-000000000000", organizationId: null },
        { limit: 1 },
      );
      this.logger.log("✓ Inbox tables reachable");
    } catch (err: any) {
      this.logger.error(
        "════════════════════════════════════════════════════════════\n" +
          "⚠️  INBOX TABLES NOT REACHABLE\n" +
          `    ${err?.code ? `Prisma ${err.code}: ` : ""}${err?.message}\n` +
          "    Run: pnpm prisma:migrate\n" +
          "════════════════════════════════════════════════════════════",
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // Thread resolution
  // ─────────────────────────────────────────────────────────

  /**
   * Find or create the conversation thread for a given (ringeeNumber, participantNumber)
   * pair within an ownership scope. Backfills `contactId` lazily.
   */
  async findOrCreateThread(input: {
    ctx: OwnershipContext;
    ringeeNumber?: string | null;
    participantNumber: string;
    contactId?: string | null;
  }): Promise<InboxThread> {
    const participantE164 = toE164(input.participantNumber);
    const ringeeE164 = toE164(input.ringeeNumber ?? null);

    // Resolve the Ringee number to a numberId when possible.
    let numberId: string | null = null;
    if (input.ringeeNumber) {
      const np = await this.numberRepo.findOne({
        phoneNumber: input.ringeeNumber,
      });
      numberId = np?.id ?? null;
    }

    // Resolve contactId by phone if not provided. Try the E.164 form first
    // and fall back to the raw participantNumber (some contacts may be
    // stored without the + prefix).
    let contactId = input.contactId ?? null;
    if (!contactId) {
      const candidates = [participantE164, input.participantNumber].filter(
        (p): p is string => !!p,
      );
      for (const phone of candidates) {
        try {
          const candidate = await this.contactRepo.findByPhone(input.ctx, phone);
          if (candidate) {
            contactId = candidate.id;
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    return this.threadRepo.findOrCreate({
      ctx: input.ctx,
      participantNumber: input.participantNumber,
      participantNumberE164: participantE164,
      ringeeNumber: ringeeE164,
      numberId,
      contactId,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Generic event append
  // ─────────────────────────────────────────────────────────

  async appendEvent(params: {
    threadId: string;
    direction: InboxEventDirection;
    kind: InboxEventKind;
    status?: InboxEventStatus;
    callId?: string | null;
    messageId?: string | null;
    recordingId?: string | null;
    voicemailDropAssetId?: string | null;
    callbackTaskId?: string | null;
    meetingId?: string | null;
    title?: string | null;
    body?: string | null;
    fromNumber?: string | null;
    toNumber?: string | null;
    audioUrl?: string | null;
    mediaUrls?: string[];
    durationSec?: number | null;
    transcript?: string | null;
    occurredAt?: Date;
    metadata?: any;
    createdByUserId?: string | null;
    /** Affects unreadCount when true and direction === inbound. */
    incrementUnread?: boolean;
  }): Promise<InboxEvent> {
    const occurredAt = params.occurredAt ?? new Date();

    const event = await this.eventRepo.create({
      thread: { connect: { id: params.threadId } },
      direction: params.direction,
      kind: params.kind,
      status: params.status ?? null,
      title: params.title ?? null,
      body: params.body ?? null,
      fromNumber: params.fromNumber ?? null,
      toNumber: params.toNumber ?? null,
      audioUrl: params.audioUrl ?? null,
      mediaUrls: params.mediaUrls ?? [],
      durationSec: params.durationSec ?? null,
      transcript: params.transcript ?? null,
      metadata: params.metadata ?? undefined,
      occurredAt,
      createdByUserId: params.createdByUserId ?? null,
      ...(params.callId ? { call: { connect: { id: params.callId } } } : {}),
      ...(params.messageId
        ? { message: { connect: { id: params.messageId } } }
        : {}),
      ...(params.recordingId
        ? { recording: { connect: { id: params.recordingId } } }
        : {}),
      ...(params.voicemailDropAssetId
        ? {
            voicemailDropAsset: {
              connect: { id: params.voicemailDropAssetId },
            },
          }
        : {}),
      ...(params.meetingId
        ? { meeting: { connect: { id: params.meetingId } } }
        : {}),
      ...(params.callbackTaskId ? { callbackTaskId: params.callbackTaskId } : {}),
    });

    // Update the thread's snapshot fields atomically.
    const preview = previewFor(params.kind, params.body);
    await this.threadRepo.update(params.threadId, {
      lastEventAt: occurredAt,
      lastPreview: preview,
      lastEventKind: params.kind,
      ...(params.direction === InboxEventDirection.inbound
        ? { lastInboundAt: occurredAt }
        : {}),
      ...(params.direction === InboxEventDirection.outbound
        ? { lastOutboundAt: occurredAt }
        : {}),
      ...(params.incrementUnread &&
      params.direction === InboxEventDirection.inbound
        ? { unreadCount: { increment: 1 } }
        : {}),
    });

    return event;
  }

  // ─────────────────────────────────────────────────────────
  // Specialised appenders
  // ─────────────────────────────────────────────────────────

  /**
   * Materialises the thread for a call as soon as it begins. No event is
   * emitted yet; the call lifecycle hooks add the visible event.
   * Returns the thread (or null when ownership cannot be derived).
   */
  async ensureThreadForCall(call: Call): Promise<InboxThread | null> {
    const ctx = InboxTimelineService.buildOwnershipFromCall(call);
    if (!ctx) return null;
    const direction =
      call.direction === "outbound"
        ? InboxEventDirection.outbound
        : InboxEventDirection.inbound;
    const ringeeNumber =
      direction === InboxEventDirection.outbound ? call.fromNumber : call.toNumber;
    const participantNumber =
      direction === InboxEventDirection.outbound ? call.toNumber : call.fromNumber;
    return this.findOrCreateThread({
      ctx,
      ringeeNumber,
      participantNumber,
      contactId: call.contactId ?? null,
    });
  }

  /**
   * Emits the right event for a finished call: `missed_call` if no human
   * answered, otherwise `call_completed`. Idempotent per (thread, call, kind).
   */
  async appendCallEvent(params: {
    ctx: OwnershipContext;
    call: Call & { contact?: Contact | null };
  }): Promise<InboxEvent | null> {
    const { call, ctx } = params;
    const direction =
      call.direction === "outbound"
        ? InboxEventDirection.outbound
        : InboxEventDirection.inbound;

    // Decide which side is the participant vs the Ringee number.
    const ringeeNumber =
      direction === InboxEventDirection.outbound ? call.fromNumber : call.toNumber;
    const participantNumber =
      direction === InboxEventDirection.outbound ? call.toNumber : call.fromNumber;

    const thread = await this.findOrCreateThread({
      ctx,
      ringeeNumber,
      participantNumber,
      contactId: call.contactId ?? null,
    });

    const isMissed =
      !call.answeredAt &&
      (call.durationSeconds ?? 0) === 0 &&
      direction === InboxEventDirection.inbound;

    const kind = isMissed ? InboxEventKind.missed_call : InboxEventKind.call_completed;

    if (await this.eventRepo.existsForCallEvent(thread.id, call.id, kind)) {
      return null;
    }

    return this.appendEvent({
      threadId: thread.id,
      direction,
      kind,
      status: isMissed ? InboxEventStatus.missed : InboxEventStatus.completed,
      callId: call.id,
      title: isMissed ? "Missed call" : "Call completed",
      body: call.outcomeNote ?? null,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      durationSec: call.durationSeconds ?? null,
      occurredAt: call.endedAt ?? new Date(),
      metadata: {
        outcome: call.outcome,
        durationSeconds: call.durationSeconds,
      },
      incrementUnread: isMissed,
    });
  }

  /**
   * Voicemail received during an inbound call. Idempotent per (thread, recording).
   */
  async appendVoicemailEvent(params: {
    ctx: OwnershipContext;
    call: Call;
    recording: Recording;
  }): Promise<InboxEvent | null> {
    const { call, recording, ctx } = params;
    const direction = InboxEventDirection.inbound;

    const ringeeNumber =
      call.direction === "outbound" ? call.fromNumber : call.toNumber;
    const participantNumber =
      call.direction === "outbound" ? call.toNumber : call.fromNumber;

    const thread = await this.findOrCreateThread({
      ctx,
      ringeeNumber,
      participantNumber,
      contactId: call.contactId ?? null,
    });

    if (
      await this.eventRepo.existsForCallEvent(
        thread.id,
        call.id,
        InboxEventKind.voicemail_received,
      )
    ) {
      return null;
    }

    return this.appendEvent({
      threadId: thread.id,
      direction,
      kind: InboxEventKind.voicemail_received,
      status: InboxEventStatus.received,
      callId: call.id,
      recordingId: recording.id,
      title: "Voicemail received",
      audioUrl: recording.url ?? null,
      durationSec: recording.durationSec ?? null,
      transcript: recording.transcript ?? null,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      occurredAt: recording.createdAt ?? new Date(),
      incrementUnread: true,
    });
  }

  async appendVoiceDropEvent(params: {
    ctx: OwnershipContext;
    callId?: string;
    voicemailDropAssetId: string;
    ringeeNumber: string;
    participantNumber: string;
    contactId?: string | null;
    assetName?: string | null;
    audioUrl?: string | null;
    durationSec?: number | null;
  }): Promise<InboxEvent> {
    const thread = await this.findOrCreateThread({
      ctx: params.ctx,
      ringeeNumber: params.ringeeNumber,
      participantNumber: params.participantNumber,
      contactId: params.contactId ?? null,
    });

    return this.appendEvent({
      threadId: thread.id,
      direction: InboxEventDirection.outbound,
      kind: InboxEventKind.voicemail_drop_sent,
      status: InboxEventStatus.sent,
      callId: params.callId ?? null,
      voicemailDropAssetId: params.voicemailDropAssetId,
      title: "Voicedrop sent",
      body: params.assetName ?? null,
      audioUrl: params.audioUrl ?? null,
      durationSec: params.durationSec ?? null,
      occurredAt: new Date(),
    });
  }

  async appendInternalNote(params: {
    ctx: OwnershipContext;
    threadId: string;
    note: string;
    userId: string;
  }): Promise<InboxEvent> {
    return this.appendEvent({
      threadId: params.threadId,
      direction: InboxEventDirection.internal,
      kind: InboxEventKind.note_added,
      status: InboxEventStatus.completed,
      title: "Note",
      body: params.note,
      createdByUserId: params.userId,
    });
  }

  async appendCallbackScheduled(params: {
    threadId: string;
    callbackTaskId: string;
    scheduledAt: Date;
    note?: string | null;
  }): Promise<InboxEvent> {
    return this.appendEvent({
      threadId: params.threadId,
      direction: InboxEventDirection.system,
      kind: InboxEventKind.callback_scheduled,
      status: InboxEventStatus.pending,
      callbackTaskId: params.callbackTaskId,
      title: "Callback scheduled",
      body: params.note ?? null,
      occurredAt: new Date(),
      metadata: { scheduledAt: params.scheduledAt.toISOString() },
    });
  }

  async appendMeetingBooked(params: {
    threadId: string;
    meetingId: string;
    title?: string | null;
    scheduledAt: Date;
  }): Promise<InboxEvent> {
    return this.appendEvent({
      threadId: params.threadId,
      direction: InboxEventDirection.system,
      kind: InboxEventKind.meeting_booked,
      status: InboxEventStatus.pending,
      meetingId: params.meetingId,
      title: params.title ?? "Meeting booked",
      occurredAt: new Date(),
      metadata: { scheduledAt: params.scheduledAt.toISOString() },
    });
  }

  async appendMessageEvent(params: {
    threadId: string;
    messageId: string;
    direction: InboxEventDirection;
    kind: InboxEventKind;
    status: InboxEventStatus;
    body?: string | null;
    mediaUrls?: string[];
    fromNumber: string;
    toNumber: string;
    occurredAt?: Date;
    incrementUnread?: boolean;
  }): Promise<InboxEvent | null> {
    if (await this.eventRepo.existsForMessage(params.threadId, params.messageId)) {
      return null;
    }
    return this.appendEvent({
      threadId: params.threadId,
      direction: params.direction,
      kind: params.kind,
      status: params.status,
      messageId: params.messageId,
      title:
        params.kind === InboxEventKind.sms_received ||
        params.kind === InboxEventKind.sms_sent
          ? "SMS"
          : "MMS",
      body: params.body ?? null,
      mediaUrls: params.mediaUrls ?? [],
      fromNumber: params.fromNumber,
      toNumber: params.toNumber,
      occurredAt: params.occurredAt,
      incrementUnread: params.incrementUnread ?? false,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Thread state
  // ─────────────────────────────────────────────────────────

  async listThreads(
    ctx: OwnershipContext,
    options: Parameters<InboxThreadRepository["listByOwner"]>[1] = {},
  ) {
    return this.threadRepo.listByOwner(ctx, options);
  }

  async listEvents(threadId: string, options?: { kindIn?: InboxEventKind[]; page?: number; limit?: number }) {
    return this.eventRepo.listByThread(threadId, options);
  }

  async ensureAccess(
    ctx: OwnershipContext,
    threadId: string,
  ): Promise<InboxThread> {
    const thread = await this.threadRepo.findById(threadId);
    if (!thread) {
      throw new NotFoundException("Thread not found");
    }
    if (ctx.organizationId) {
      if (thread.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Access denied");
      }
    } else if (thread.userId !== ctx.userId) {
      throw new ForbiddenException("Access denied");
    }
    return thread;
  }

  async markRead(ctx: OwnershipContext, threadId: string) {
    await this.ensureAccess(ctx, threadId);
    await this.threadRepo.resetUnread(threadId);
  }

  async resolveThread(ctx: OwnershipContext, threadId: string) {
    await this.ensureAccess(ctx, threadId);
    return this.threadRepo.update(threadId, {
      status: InboxThreadStatus.resolved,
      resolvedAt: new Date(),
    });
  }

  async archiveThread(ctx: OwnershipContext, threadId: string) {
    await this.ensureAccess(ctx, threadId);
    return this.threadRepo.update(threadId, {
      status: InboxThreadStatus.archived,
      archivedAt: new Date(),
    });
  }

  async reopenThread(ctx: OwnershipContext, threadId: string) {
    await this.ensureAccess(ctx, threadId);
    return this.threadRepo.update(threadId, {
      status: InboxThreadStatus.open,
      resolvedAt: null,
      archivedAt: null,
    });
  }

  async assignThread(
    ctx: OwnershipContext,
    threadId: string,
    assigneeId: string | null,
  ) {
    await this.ensureAccess(ctx, threadId);
    return this.threadRepo.update(threadId, { assignedToId: assigneeId });
  }

  // Public helpers used by the call hooks (called from CallService).
  static buildOwnershipFromCall(call: {
    userId: string | null;
    organizationId: string | null;
  }): OwnershipContext | null {
    if (!call.userId) return null;
    return {
      userId: call.userId,
      organizationId: call.organizationId,
    };
  }

  /**
   * Backfills inbox threads + events from already-existing Calls so users
   * who installed the inbox after a period of activity see their history.
   *
   * Idempotent: rerunning is safe — `existsForCallEvent` dedupes events.
   */
  async backfillFromCalls(
    ctx: OwnershipContext,
    calls: (Call & { contact?: Contact | null })[],
  ): Promise<{ threadsTouched: number; eventsCreated: number; processed: number }> {
    const touchedThreadIds = new Set<string>();
    let eventsCreated = 0;

    for (const call of calls) {
      try {
        const thread = await this.ensureThreadForCall(call);
        if (thread) touchedThreadIds.add(thread.id);
        const result = await this.appendCallEvent({ ctx, call });
        if (result) eventsCreated++;
      } catch (err) {
        this.logger.warn(
          `Backfill skipped call ${call.id}: ${(err as Error).message}`,
        );
      }
    }

    return {
      threadsTouched: touchedThreadIds.size,
      eventsCreated,
      processed: calls.length,
    };
  }
}
