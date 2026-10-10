import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AiVoiceAgentCallRepository,
  CallbackTaskRepository,
  CallablePendingAction,
  CallRepository,
  ContactListEntryToCall,
  ContactListRepository,
  DashboardRepository,
  DNCEntryRepository,
  InboxThreadRepository,
  PendingActionRepository,
  PendingActionType,
  WorkedContactList,
} from "@ringee/database";
import { buildOwnershipFilter, OwnershipContext } from "@ringee/platform";
import { listEntryPhones, MyDayListEntry, pickListNext } from "./my-day-list";
import {
  buildMyDayQueue,
  myDayQueueContactIds,
  myDayQueuePhones,
  MyDayListRef,
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

/** The most lists the Call page offers to pick from. */
const LIST_LIMIT = 100;

/**
 * Entries a "Call next" lookup reads at a time. Keep paging until a callable
 * entry is found or the list is exhausted, including blocked prefixes.
 */
const LIST_PAGE_SIZE = 50;

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

/** A list the person works from the Call page (LIST-005). */
export interface MyDayList extends MyDayListRef {
  description: string | null;
  /** Contacts in the list. */
  contactCount: number;
  /** Contacts still to call: nobody has called them since they joined it. */
  remaining: number;
}

export interface MyDayListNext {
  list: MyDayList;
  /** Null when nobody in the list can be called now. */
  next: MyDayListEntry | null;
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
    private readonly lists: ContactListRepository,
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
      this.loadFollowUps(ctx, dayEnd, now),
    ]);

    // A voice agent places the callbacks it scheduled itself; a person
    // calling as well would reach the contact twice.
    const agentPlaced = await this.agentCalls.findExistingIds(
      callbacks.map((callback) => callback.id),
    );
    const owed = callbacks.filter((callback) => !agentPlaced.has(callback.id));

    const sources = { callbacks: owed, missedCalls, followUps };
    const phones = myDayQueuePhones(sources);
    const oldestReason = Math.min(
      now.getTime(),
      ...missedCalls.map((thread) => thread.lastEventAt.getTime()),
      ...followUps.map((action) => action.createdAt.getTime()),
    );
    const [outbound, doNotCall, listed] = await Promise.all([
      missedCalls.length > 0 || followUps.length > 0
        ? this.calls.latestOutboundTo(ctx, phones, new Date(oldestReason))
        : Promise.resolve([]),
      this.dnc.findListedPhones(owner, phones),
      // Only the person's own lists: a teammate's list is not theirs to see.
      this.lists.listsHolding(ctx, ctx.userId, myDayQueueContactIds(sources)),
    ]);

    const lists = new Map<string, MyDayListRef[]>();
    for (const { contactId, list } of listed) {
      lists.set(contactId, [...(lists.get(contactId) ?? []), list]);
    }

    return {
      items: buildMyDayQueue({
        userId: ctx.userId,
        now,
        ...sources,
        outbound,
        doNotCall,
        lists,
      }),
      until: dayEnd,
      generatedAt: now,
    };
  }

  /**
   * The lists the person may work from the Call page: the ones assigned to
   * them in this workspace — an admin's included, never a teammate's
   * (LIST-005, CALL-014).
   */
  async getLists(ctx: OwnershipContext): Promise<{ data: MyDayList[] }> {
    const lists = await this.lists.listAssignedTo(ctx, ctx.userId, LIST_LIMIT);
    const remaining = await this.lists.countToCall(
      lists.map((list) => list.id),
    );
    return {
      data: lists.map((list) => toMyDayList(list, remaining.get(list.id) ?? 0)),
    };
  }

  /** Calling a follow-up does not complete its action: page past those calls. */
  private async loadFollowUps(
    ctx: OwnershipContext,
    dueBy: Date,
    now: Date,
  ): Promise<CallablePendingAction[]> {
    const eligible: CallablePendingAction[] = [];
    let after: string | undefined;
    while (eligible.length < SOURCE_LIMIT) {
      const page = await this.pendingActions.listOpenForCalling(
        { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
        { types: CALL_FOLLOW_UP_TYPES, dueBy, now, limit: SOURCE_LIMIT, after },
      );
      if (page.length === 0) break;
      const sources = { callbacks: [], missedCalls: [], followUps: page };
      const outbound = await this.calls.latestOutboundTo(
        ctx,
        myDayQueuePhones(sources),
        new Date(Math.min(...page.map((action) => action.createdAt.getTime()))),
      );
      const ids = new Set(
        buildMyDayQueue({
          ...sources,
          userId: ctx.userId,
          now,
          outbound,
          doNotCall: new Set(),
          lists: new Map(),
        }).flatMap((item) =>
          item.reasons.flatMap((reason) =>
            reason.kind === "follow_up" ? [reason.actionId] : [],
          ),
        ),
      );
      eligible.push(...page.filter((action) => ids.has(action.id)));
      if (page.length < SOURCE_LIMIT) break;
      after = page[page.length - 1]!.id;
    }
    return eligible.slice(0, SOURCE_LIMIT);
  }

  /**
   * Who to call next from one of the person's lists, once nothing in today's
   * queue is due (LIST-005). Contacts found to have been called since they
   * joined the list are recorded on the way, so the list keeps up with calls
   * placed from anywhere without the dialer writing to it.
   */
  async getListNext(
    ctx: OwnershipContext,
    listId: string,
  ): Promise<MyDayListNext> {
    return this.listNext(ctx, await this.loadAssignedList(ctx, listId));
  }

  /**
   * Sends a contact to the back of the list and answers with who comes next.
   * One that is no longer to call — called in the meantime — is left as it is.
   */
  async skipListEntry(
    ctx: OwnershipContext,
    listId: string,
    entryId: string,
    now = new Date(),
  ): Promise<MyDayListNext> {
    const list = await this.loadAssignedList(ctx, listId);
    await this.lists.skipEntry(list.id, entryId, now);
    return this.listNext(ctx, list);
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

  /** A list of the workspace assigned to the person; anything else is a 404. */
  private async loadAssignedList(
    ctx: OwnershipContext,
    listId: string,
  ): Promise<WorkedContactList> {
    const list = await this.lists.findAssignedTo(ctx, listId, ctx.userId);
    if (!list) throw new NotFoundException("List not found");
    return list;
  }

  private async listNext(
    ctx: OwnershipContext,
    list: WorkedContactList,
  ): Promise<MyDayListNext> {
    const next = await this.findListNext(ctx, list.id);
    const remaining = await this.lists.countToCall([list.id]);
    return {
      list: toMyDayList(list, remaining.get(list.id) ?? 0),
      next,
    };
  }

  /** Never skipped contacts first, in the list's order; then the skipped. */
  private async findListNext(
    ctx: OwnershipContext,
    listId: string,
  ): Promise<MyDayListEntry | null> {
    for (const skipped of [false, true]) {
      let after: ContactListEntryToCall | undefined;
      while (true) {
        const entries = await this.lists.listToCall(listId, {
          skipped,
          after,
          limit: LIST_PAGE_SIZE,
        });
        if (entries.length === 0) break;

        const phones = listEntryPhones(entries);
        const oldest = Math.min(
          ...entries.map((entry) => entry.createdAt.getTime()),
        );
        const [outbound, doNotCall, openCallbacks] = await Promise.all([
          this.calls.latestOutboundTo(ctx, phones, new Date(oldest)),
          this.dnc.findListedPhones(
            { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
            phones,
          ),
          this.callbacks.findContactsWithOpenCallback(
            buildOwnershipFilter(ctx),
            entries.map((entry) => entry.contact.id),
          ),
        ]);
        const pick = pickListNext({
          entries,
          outbound,
          doNotCall,
          openCallbacks,
        });
        await this.lists.markCalled(pick.called);
        if (pick.next) return pick.next;
        if (entries.length < LIST_PAGE_SIZE) break;
        after = entries[entries.length - 1];
      }
    }
    return null;
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

function toMyDayList(list: WorkedContactList, remaining: number): MyDayList {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    contactCount: list._count.entries,
    remaining,
  };
}
