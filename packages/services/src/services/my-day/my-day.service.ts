import { BadRequestException, Injectable } from "@nestjs/common";
import {
  AiVoiceAgentCallRepository,
  CallbackTaskRepository,
  CallRepository,
  DashboardRepository,
  DNCEntryRepository,
  InboxThreadRepository,
  PendingActionRepository,
  PendingActionType,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import {
  buildMyDayQueue,
  myDayQueuePhones,
  MyDayQueueItem,
} from "./my-day-queue";

/** How many rows each source contributes at most. */
const SOURCE_LIMIT = 100;
const MISSED_CALL_LIMIT = 50;

/**
 * How long an unreturned missed call stays in the queue. It does not vanish
 * after a day — the caller is still waiting — but a week-old one belongs to
 * the inbox, not to today's calls.
 */
const MISSED_CALL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The longest a caller's "today" can be, whatever time zone they are in. */
const MAX_DAY_MS = 36 * 60 * 60 * 1000;

/**
 * The follow-ups that are done by calling the contact. Sending a message or
 * updating the CRM is still a pending action, but not a call to make.
 */
const CALL_FOLLOW_UP_TYPES: PendingActionType[] = [
  PendingActionType.create_callback,
  PendingActionType.book_meeting,
  PendingActionType.ask_for_referral,
];

export interface MyDayQueue {
  items: MyDayQueueItem[];
  /** The end of the day the queue was built for. */
  until: Date;
  generatedAt: Date;
}

/**
 * "My day" on the Call page: who to call today, and how the day is going.
 * Composes sources that already exist — callbacks, the inbox, pending actions
 * — and never creates a task of its own.
 */
@Injectable()
export class MyDayService {
  constructor(
    private readonly callbacks: CallbackTaskRepository,
    private readonly threads: InboxThreadRepository,
    private readonly pendingActions: PendingActionRepository,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly calls: CallRepository,
    private readonly dnc: DNCEntryRepository,
    private readonly dashboard: DashboardRepository,
  ) {}

  /**
   * Today's calls for the caller, in order. `until` is the end of their own
   * day: the server cannot know their time zone, and a callback for tomorrow
   * must not be pulled forward to fill the queue.
   */
  async getQueue(
    ctx: OwnershipContext,
    until?: Date,
    now = new Date(),
  ): Promise<MyDayQueue> {
    const dayEnd = this.resolveDayEnd(until, now);
    const owner = {
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
    };

    const [callbacks, missedCalls, followUps] = await Promise.all([
      this.callbacks.listOwedByUser(owner, {
        scheduledTo: dayEnd,
        limit: SOURCE_LIMIT,
      }),
      this.threads.listMissedCallThreads(ctx, {
        since: new Date(now.getTime() - MISSED_CALL_WINDOW_MS),
        limit: MISSED_CALL_LIMIT,
      }),
      this.pendingActions.listOpenForCalling(owner, {
        types: CALL_FOLLOW_UP_TYPES,
        dueBy: dayEnd,
        now,
        limit: SOURCE_LIMIT,
      }),
    ]);

    // A voice agent places the callbacks it scheduled itself; a person
    // calling as well would reach the contact twice.
    const agentPlaced = await this.agentCalls.findExistingIds(
      callbacks.map((callback) => callback.id),
    );
    const owed = callbacks.filter((callback) => !agentPlaced.has(callback.id));

    const phones = myDayQueuePhones({
      callbacks: owed,
      missedCalls,
      followUps,
    });
    const oldestReason = Math.min(
      now.getTime(),
      ...missedCalls.map((thread) => thread.lastEventAt.getTime()),
      ...followUps.map((action) => action.createdAt.getTime()),
    );
    const [outbound, doNotCall] = await Promise.all([
      missedCalls.length > 0 || followUps.length > 0
        ? this.calls.latestOutboundTo(ctx, phones, new Date(oldestReason))
        : Promise.resolve([]),
      this.dnc.findListedPhones(owner, phones),
    ]);

    return {
      items: buildMyDayQueue({
        userId: ctx.userId,
        now,
        callbacks: owed,
        missedCalls,
        followUps,
        outbound,
        doNotCall,
      }),
      until: dayEnd,
      generatedAt: now,
    };
  }

  /**
   * How the caller's own day is going between `from` and `to` — the bounds
   * of their local day — and their next meeting.
   */
  async getSummary(
    ctx: OwnershipContext,
    range?: { from: Date; to: Date },
    now = new Date(),
  ) {
    const { start, end } = range
      ? { start: range.from, end: range.to }
      : this.utcDay(now);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException("from must be before to");
    }
    if (end.getTime() - start.getTime() > MAX_DAY_MS) {
      throw new BadRequestException("from and to must span a single day");
    }

    return this.dashboard.getMyDaySummary(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      { start, end },
      now,
    );
  }

  /** The caller's end of day, kept within a day from now. */
  private resolveDayEnd(until: Date | undefined, now: Date): Date {
    if (!until) return this.utcDay(now).end;
    const latest = now.getTime() + MAX_DAY_MS;
    return new Date(Math.min(Math.max(until.getTime(), now.getTime()), latest));
  }

  private utcDay(now: Date): { start: Date; end: Date } {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
  }
}
