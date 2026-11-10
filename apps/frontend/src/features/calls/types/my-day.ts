/** "My day" on the Call page, as `GET /my-day/*` returns it. */

export type MyDayGroup = 'now' | 'later' | 'anytime';

export type MyDayReason =
  | { kind: 'callback'; callbackId: string; at: string; note: string | null }
  | { kind: 'missed_call'; threadId: string; at: string; voicemail: boolean }
  | {
      kind: 'follow_up';
      actionId: string;
      actionType: string;
      title: string;
      priority: 'low' | 'medium' | 'high';
      dueAt: string | null;
    };

export interface MyDayContact {
  /** Null for a caller who is not a saved contact. */
  id: string | null;
  name: string | null;
  company: string | null;
  /** E.164. */
  phoneNumber: string;
  /** IANA zone, only when known. */
  timezone: string | null;
  /** ISO country of the number. */
  country: string | null;
}

/** A contact list, as My day names it. */
export interface MyDayListRef {
  id: string;
  name: string;
}

export interface MyDayQueueItem {
  /** Stable across refreshes. */
  key: string;
  group: MyDayGroup;
  /** When a "later" item comes due. */
  dueAt: string | null;
  contact: MyDayContact;
  /** On the Do Not Call list: shown, never picked as the next call. */
  doNotCall: boolean;
  /** The most pressing first. */
  reasons: MyDayReason[];
  /** The user's own lists the contact is in. */
  lists: MyDayListRef[];
}

export interface MyDayQueueResponse {
  items: MyDayQueueItem[];
  until: string;
  generatedAt: string;
}

/** A list the user works from the Call page (`GET /my-day/lists`). */
export interface MyDayList extends MyDayListRef {
  description: string | null;
  contactCount: number;
  /** Contacts nobody has called since they joined the list. */
  remaining: number;
}

/** The next contact of a list (`GET /my-day/lists/:id/next`). */
export interface MyDayListEntry {
  /** What a skip names. */
  entryId: string;
  /** Skipped before, and back now that everyone after it was called. */
  skipped: boolean;
  contact: MyDayContact;
}

export interface MyDayListNext {
  list: MyDayList;
  /** Null when nobody in the list can be called now. */
  next: MyDayListEntry | null;
}

/** One past call with a contact (`GET /my-day/contacts/:id`). */
export interface MyDayBriefCall {
  id: string;
  at: string;
  direction: 'inbound' | 'outbound' | null;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  note: string | null;
}

/** Who a contact is before the call (`GET /my-day/contacts/:id`). */
export interface MyDayContactBrief {
  contactId: string;
  jobTitle: string | null;
  email: string | null;
  /** City and region as far as they are known: "Chicago, IL". */
  place: string | null;
  /** Only ever an http(s) URL — the server drops any other scheme. */
  linkedinUrl: string | null;
  company: {
    name: string | null;
    /** The company's revenue band ("$10M-$50M"). */
    revenue: string | null;
    employees: string | null;
    industry: string | null;
    website: string | null;
    linkedinUrl: string | null;
  } | null;
  /** The newest few, and how many there are in all. */
  calls: { total: number; recent: MyDayBriefCall[] };
}

export interface MyDaySummary {
  calls: number;
  conversations: number;
  meetingsBooked: number;
  nextMeeting: {
    id: string;
    title: string | null;
    scheduledAt: string;
    duration: number;
    location: string | null;
    contact: { id: string; name: string | null; phoneNumber: string } | null;
  } | null;
}

export interface NumberPerformance {
  numberId: string;
  windowDays: number;
  calls: number;
  answered: number;
  minSample: number;
  restingUntil: string | null;
}
