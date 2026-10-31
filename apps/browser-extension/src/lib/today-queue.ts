/**
 * The pure rules behind the side panel's Today queue — the day the web Call
 * page works ("My day"). The backend decides who is in it, in what order, and
 * who a list offers next (CALL-013, CALL-014, LIST-005); these only pick the
 * next call and keep the order still while the user works it.
 */
import type {
  CallList,
  CallListEntry,
  CallListNext,
  QueueGroup,
  QueueItem,
  QueueReason,
} from "./ringee-api";

export const QUEUE_GROUPS: QueueGroup[] = ["now", "later", "anytime"];

/** The bounds of the user's own day: the server cannot know their time zone. */
export function localDay(now = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** Whether the item can be called now: due, and not on the Do Not Call list. */
export function isCallableNow(item: QueueItem, now: Date): boolean {
  if (item.doNotCall) return false;
  if (item.group !== "later") return true;
  return !!item.dueAt && new Date(item.dueAt).getTime() <= now.getTime();
}

/** The callbacks an item owes; calling it from the queue completes them. */
export function owedCallbacks(
  item: QueueItem,
): Extract<QueueReason, { kind: "callback" }>[] {
  return item.reasons.flatMap((reason) =>
    reason.kind === "callback" ? [reason] : [],
  );
}

/** The note left on a callback, when there is one. */
export function callbackNote(reasons: QueueReason[]): string | null {
  for (const reason of reasons) {
    if (reason.kind === "callback" && reason.note?.trim()) {
      return reason.note.trim();
    }
  }
  return null;
}

/**
 * The order the user works in, after a refresh. The first load sets it;
 * whoever drops out — called back, callback completed — leaves at once.
 * Someone who left and comes back is new again, not slotted back in.
 */
export function keepOrder(
  order: string[] | null,
  fresh: QueueItem[],
): string[] {
  if (!order) return fresh.map((item) => item.key);
  const keys = new Set(fresh.map((item) => item.key));
  return order.filter((key) => keys.has(key));
}

/**
 * The queue as the user sees it: the kept order in sections by time of day,
 * and everyone who turned up since, waiting in `incoming` until the user adds
 * them — then they join the end of their section.
 */
export function arrangeQueue(
  fresh: QueueItem[],
  order: string[],
): { items: QueueItem[]; incoming: QueueItem[] } {
  const byKey = new Map(fresh.map((item) => [item.key, item]));
  const accepted = new Set(order);
  const kept = order.flatMap((key) => byKey.get(key) ?? []);
  return {
    // Sections follow the time of day; inside one, the order of arrival.
    items: QUEUE_GROUPS.flatMap((group) =>
      kept.filter((item) => item.group === group),
    ),
    incoming: fresh.filter((item) => !accepted.has(item.key)),
  };
}

/** Who "Call next" calls: someone due in today's queue, or a list's next. */
export type NextCall =
  | { source: "queue"; item: QueueItem }
  | {
      source: "list";
      item: QueueItem;
      entry: CallListEntry;
      list: CallList;
    };

/** A list's next contact, in the shape the queue's call surfaces take. */
export function listEntryItem(list: CallList, entry: CallListEntry): QueueItem {
  return {
    key: `list-entry:${entry.entryId}`,
    group: "anytime",
    dueAt: null,
    contact: entry.contact,
    doNotCall: false,
    reasons: [],
    lists: [{ id: list.id, name: list.name }],
  };
}

/** Today's queue first; the picked list only once nobody in it is due. */
export function pickNextCall(
  items: QueueItem[],
  listNext: CallListNext | null,
  now: Date,
): NextCall | null {
  const due = items.find((item) => isCallableNow(item, now));
  if (due) return { source: "queue", item: due };
  if (!listNext?.next) return null;
  return {
    source: "list",
    item: listEntryItem(listNext.list, listNext.next),
    entry: listNext.next,
    list: listNext.list,
  };
}

/** With nobody due, who comes due next today. */
export function upcomingCall(items: QueueItem[], now: Date): QueueItem | null {
  if (items.some((item) => isCallableNow(item, now))) return null;
  return (
    items.find((item) => item.group === "later" && !item.doNotCall) ?? null
  );
}
