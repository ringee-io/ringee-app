import {
  CallablePendingAction,
  MissedCallThread,
  OwedCallback,
  PendingActionPriority,
  PendingActionType,
} from "@ringee/database";
import { normalizePhoneE164 } from "@ringee/platform";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/** Which part of the day an item belongs to. */
export type MyDayGroup = "now" | "later" | "anytime";

/** Why a person is in the queue. One person can have several reasons. */
export type MyDayReason =
  | { kind: "callback"; callbackId: string; at: Date; note: string | null }
  | { kind: "missed_call"; threadId: string; at: Date; voicemail: boolean }
  | {
      kind: "follow_up";
      actionId: string;
      actionType: PendingActionType;
      title: string;
      priority: PendingActionPriority;
      dueAt: Date | null;
    };

export interface MyDayContact {
  /** Null for a caller who is not a saved contact. */
  id: string | null;
  name: string | null;
  company: string | null;
  /** The number to call, in E.164. */
  phoneNumber: string;
  /** IANA zone, only when it is known — never guessed. */
  timezone: string | null;
  /** ISO country the number belongs to, read from the number itself. */
  country: string | null;
}

/** A contact list, as My day names it. */
export interface MyDayListRef {
  id: string;
  name: string;
}

export interface MyDayQueueItem {
  /** Stable across refreshes: the contact, or the number when there is none. */
  key: string;
  group: MyDayGroup;
  /** When a "later" item comes due; null in the other groups. */
  dueAt: Date | null;
  contact: MyDayContact;
  /** On the workspace's Do Not Call list: still shown, never picked next. */
  doNotCall: boolean;
  /** Every reason to call, the most pressing first. */
  reasons: MyDayReason[];
  /** The person's own lists the contact is in (LIST-005). */
  lists: MyDayListRef[];
}

export interface MyDayQueueSources {
  /** The person whose queue this is. */
  userId: string;
  now: Date;
  callbacks: OwedCallback[];
  missedCalls: MissedCallThread[];
  followUps: CallablePendingAction[];
  /** Latest outbound call per number and caller since the oldest reason. */
  outbound: { toNumber: string; userId: string | null; at: Date }[];
  /** Numbers on the workspace's Do Not Call list. */
  doNotCall: Set<string>;
  /** The lists assigned to the person that hold each contact, by contact id. */
  lists: Map<string, MyDayListRef[]>;
}

const GROUP_ORDER: Record<MyDayGroup, number> = {
  now: 0,
  later: 1,
  anytime: 2,
};

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type DraftContact = Omit<MyDayContact, "country">;

interface Draft {
  contact: DraftContact;
  reasons: MyDayReason[];
}

function toE164(raw: string | null | undefined): string | null {
  return normalizePhoneE164(raw);
}

function reasonGroup(reason: MyDayReason, now: number): MyDayGroup {
  switch (reason.kind) {
    case "missed_call":
      return "now";
    case "callback":
      return reason.at.getTime() <= now ? "now" : "later";
    case "follow_up":
      if (!reason.dueAt) return "anytime";
      return reason.dueAt.getTime() <= now ? "now" : "later";
  }
}

/** When the reason is due, if it has a time at all. */
function reasonTime(reason: MyDayReason): number | null {
  switch (reason.kind) {
    case "callback":
    case "missed_call":
      return reason.at.getTime();
    case "follow_up":
      return reason.dueAt ? reason.dueAt.getTime() : null;
  }
}

/**
 * Inside "now": a promise to call back comes first, then people who tried to
 * reach us, then suggested follow-ups that are due.
 */
function nowTier(reason: MyDayReason): number {
  if (reason.kind === "callback") return 0;
  if (reason.kind === "missed_call") return 1;
  return 2;
}

function compareReasons(now: number) {
  return (a: MyDayReason, b: MyDayReason): number => {
    const groupDiff =
      GROUP_ORDER[reasonGroup(a, now)] - GROUP_ORDER[reasonGroup(b, now)];
    if (groupDiff !== 0) return groupDiff;
    if (reasonGroup(a, now) === "now") {
      const tierDiff = nowTier(a) - nowTier(b);
      if (tierDiff !== 0) return tierDiff;
    }
    return (reasonTime(a) ?? 0) - (reasonTime(b) ?? 0);
  };
}

/**
 * Within its group, an item sorts by its most pressing reason: the most
 * overdue callback, the most recent missed call, the earliest of the rest;
 * undated follow-ups by priority. Ties keep the sources' order.
 */
function itemSortKey(item: MyDayQueueItem): [number, number] {
  const lead = item.reasons[0]!;
  if (item.group === "anytime") {
    const priority = lead.kind === "follow_up" ? lead.priority : "low";
    return [PRIORITY_ORDER[priority] ?? 2, 0];
  }
  if (item.group === "later") return [0, item.dueAt?.getTime() ?? 0];
  const tier = nowTier(lead);
  if (lead.kind === "missed_call") {
    const latest = Math.max(
      ...item.reasons
        .filter((reason) => reason.kind === "missed_call")
        .map((reason) => reason.at.getTime()),
    );
    return [tier, -latest];
  }
  return [tier, reasonTime(lead) ?? 0];
}

/**
 * Today's calls for one person, in the order to make them: everything due
 * now (callbacks owed, missed calls not returned yet, follow-ups due), then
 * what comes due later today, then follow-ups with no time. A person with
 * several reasons is one item carrying all of them.
 *
 * A missed call counts as returned once anyone in the workspace has called
 * the number since; a follow-up leaves the queue once its owner has called the
 * contact after it was raised. Callbacks are commitments with a status of
 * their own, so only completing or cancelling one takes it out.
 */
export function buildMyDayQueue(sources: MyDayQueueSources): MyDayQueueItem[] {
  const now = sources.now.getTime();

  const lastCallByAnyone = new Map<string, number>();
  const lastCallByOwner = new Map<string, number>();
  for (const call of sources.outbound) {
    const phone = toE164(call.toNumber);
    if (!phone) continue;
    const at = call.at.getTime();
    lastCallByAnyone.set(phone, Math.max(lastCallByAnyone.get(phone) ?? 0, at));
    if (call.userId === sources.userId) {
      lastCallByOwner.set(phone, Math.max(lastCallByOwner.get(phone) ?? 0, at));
    }
  }

  const drafts: Draft[] = [];
  const byContact = new Map<string, Draft>();
  const byPhone = new Map<string, Draft>();

  const add = (contact: DraftContact, reason: MyDayReason) => {
    let draft =
      (contact.id ? byContact.get(contact.id) : undefined) ??
      byPhone.get(contact.phoneNumber);
    if (!draft) {
      draft = { contact, reasons: [] };
      drafts.push(draft);
    } else if (!draft.contact.id && contact.id) {
      // An unknown caller turns out to be a saved contact.
      draft.contact = { ...contact, phoneNumber: draft.contact.phoneNumber };
    }
    draft.reasons.push(reason);
    if (contact.id) byContact.set(contact.id, draft);
    byPhone.set(contact.phoneNumber, draft);
  };

  for (const callback of sources.callbacks) {
    const phone = toE164(callback.contact.phoneNumber);
    if (!phone || callback.contact.deletedAt) continue;
    add(
      {
        id: callback.contact.id,
        name: callback.contact.name,
        company: callback.contact.company,
        phoneNumber: phone,
        timezone: callback.contact.timezone,
      },
      {
        kind: "callback",
        callbackId: callback.id,
        at: callback.scheduledAt,
        note: callback.note,
      },
    );
  }

  for (const thread of sources.missedCalls) {
    // Call back the number that called, which a contact may hold as a second.
    const phone = toE164(
      thread.participantNumberE164 ?? thread.participantNumber,
    );
    if (!phone) continue;
    if ((lastCallByAnyone.get(phone) ?? 0) > thread.lastEventAt.getTime()) {
      continue;
    }
    const contact =
      thread.contact && !thread.contact.deletedAt ? thread.contact : null;
    add(
      {
        id: contact?.id ?? null,
        name: contact?.name ?? null,
        company: contact?.company ?? null,
        phoneNumber: phone,
        timezone: contact?.timezone ?? null,
      },
      {
        kind: "missed_call",
        threadId: thread.id,
        at: thread.lastEventAt,
        voicemail: thread.lastEventKind === "voicemail_received",
      },
    );
  }

  for (const action of sources.followUps) {
    if (!action.contact) continue;
    const phone = toE164(action.contact.phoneNumber);
    if (!phone) continue;
    if ((lastCallByOwner.get(phone) ?? 0) > action.createdAt.getTime()) {
      continue;
    }
    add(
      {
        id: action.contact.id,
        name: action.contact.name,
        company: action.contact.company,
        phoneNumber: phone,
        timezone: action.contact.timezone,
      },
      {
        kind: "follow_up",
        actionId: action.id,
        actionType: action.type,
        title: action.title,
        priority: action.priority,
        dueAt: action.dueAt,
      },
    );
  }

  const items = drafts.map((draft): MyDayQueueItem => {
    const reasons = [...draft.reasons].sort(compareReasons(now));
    const group = reasonGroup(reasons[0]!, now);
    return {
      key: draft.contact.id
        ? `contact:${draft.contact.id}`
        : `phone:${draft.contact.phoneNumber}`,
      group,
      dueAt: group === "later" ? new Date(reasonTime(reasons[0]!)!) : null,
      contact: {
        ...draft.contact,
        country:
          parsePhoneNumberFromString(draft.contact.phoneNumber)?.country ??
          null,
      },
      doNotCall: sources.doNotCall.has(draft.contact.phoneNumber),
      reasons,
      lists: draft.contact.id
        ? (sources.lists.get(draft.contact.id) ?? [])
        : [],
    };
  });

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const groupDiff = GROUP_ORDER[a.item.group] - GROUP_ORDER[b.item.group];
      if (groupDiff !== 0) return groupDiff;
      const [aTier, aTime] = itemSortKey(a.item);
      const [bTier, bTime] = itemSortKey(b.item);
      return aTier - bTier || aTime - bTime || a.index - b.index;
    })
    .map(({ item }) => item);
}

/** Every number the queue could hold, for the outbound and DNC lookups. */
export function myDayQueuePhones(
  sources: Pick<MyDayQueueSources, "callbacks" | "missedCalls" | "followUps">,
): string[] {
  const phones = new Set<string>();
  const addPhone = (raw: string | null | undefined) => {
    const phone = toE164(raw);
    if (phone) phones.add(phone);
  };
  sources.callbacks.forEach((callback) =>
    addPhone(callback.contact.phoneNumber),
  );
  sources.missedCalls.forEach((thread) =>
    addPhone(thread.participantNumberE164 ?? thread.participantNumber),
  );
  sources.followUps.forEach((action) => addPhone(action.contact?.phoneNumber));
  return [...phones];
}

/** Every saved contact the queue could hold, for the lists lookup. */
export function myDayQueueContactIds(
  sources: Pick<MyDayQueueSources, "callbacks" | "missedCalls" | "followUps">,
): string[] {
  const ids = new Set<string>();
  sources.callbacks.forEach((callback) => ids.add(callback.contact.id));
  sources.missedCalls.forEach((thread) => {
    if (thread.contact && !thread.contact.deletedAt) ids.add(thread.contact.id);
  });
  sources.followUps.forEach((action) => {
    if (action.contact) ids.add(action.contact.id);
  });
  return [...ids];
}
