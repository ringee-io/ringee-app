import { CalendarCheck, List, Loader2, Phone, RotateCw } from "lucide-react";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { Skeleton } from "@ringee/frontend-shared/components/ui/skeleton";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type {
  CallListRef,
  QueueGroup,
  QueueItem,
  QueueReason,
} from "../../lib/ringee-api";
import {
  countryName,
  formatAgo,
  formatDayTime,
  formatLocalTime,
} from "../../lib/format";
import { QUEUE_GROUPS, callbackNote } from "../../lib/today-queue";
import { Avatar } from "../components/ui";

const GROUP_LABEL: Record<QueueGroup, string> = {
  now: "Now",
  later: "Later today",
  anytime: "Anytime today",
};

/** The follow-ups the queue holds are the ones done by calling. */
const FOLLOW_UP_LABEL: Record<string, string> = {
  create_callback: "Make callback",
  book_meeting: "Book meeting",
  ask_for_referral: "Ask for referral",
};

/** Who the person is, the way every queue surface names them. */
export function queueItemName(item: QueueItem): string {
  return (
    item.contact.name?.trim() ||
    (item.contact.id
      ? formatForDisplay(item.contact.phoneNumber)
      : "Unknown caller")
  );
}

/** Where the number is from, and the time there when it is known. */
export function QueueItemPlace({ item, now }: { item: QueueItem; now: Date }) {
  const country = countryName(item.contact.country);
  const localTime = formatLocalTime(item.contact.timezone, now);
  if (!country && !localTime) return null;
  return (
    <span>
      {[country, localTime ? `${localTime} there` : null]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}

type Tone = "due" | "missed" | "followUp" | "neutral";

const TONES: Record<Tone, string> = {
  due: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  missed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  followUp: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  neutral: "bg-muted text-muted-foreground",
};

/** Why the person is in the queue, one chip per reason. */
export function ReasonChips({
  reasons,
  now,
}: {
  reasons: QueueReason[];
  now: Date;
}) {
  return (
    <>
      {reasons.map((reason) => {
        let tone: Tone;
        let label: string;
        let key: string;
        switch (reason.kind) {
          case "callback": {
            const at = new Date(reason.at);
            tone = at.getTime() <= now.getTime() ? "due" : "neutral";
            label = `Callback at ${formatDayTime(at, now)}`;
            key = reason.callbackId;
            break;
          }
          case "missed_call": {
            const when = formatAgo(new Date(reason.at), now);
            tone = "missed";
            label = reason.voicemail
              ? `Voicemail ${when}`
              : `Missed call ${when}`;
            key = reason.threadId;
            break;
          }
          case "follow_up": {
            const action = FOLLOW_UP_LABEL[reason.actionType] ?? reason.title;
            tone = "followUp";
            label = reason.dueAt
              ? `${action} · due ${formatDayTime(new Date(reason.dueAt), now)}`
              : action;
            key = reason.actionId;
            break;
          }
        }
        return (
          <span
            key={key}
            className={cn(
              "inline-flex h-5 max-w-full items-center truncate rounded-full px-2 text-[11px] font-semibold",
              TONES[tone],
            )}
          >
            {label}
          </span>
        );
      })}
    </>
  );
}

/**
 * Which of the user's lists the person comes from, in small print. With
 * several, the list being called comes first and the rest are counted.
 */
export function ListTag({
  lists,
  preferredId,
  className,
}: {
  lists: CallListRef[];
  /** The list "Call next" goes through, named first when it is one of them. */
  preferredId?: string | null;
  className?: string;
}) {
  if (lists.length === 0) return null;
  const ordered = preferredId
    ? [
        ...lists.filter((list) => list.id === preferredId),
        ...lists.filter((list) => list.id !== preferredId),
      ]
    : lists;
  const [first, ...rest] = ordered;
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-1 text-[11px]",
        className,
      )}
      title={ordered.map((list) => list.name).join(", ")}
    >
      <List className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">From your list:</span>
      <span className="truncate">{first!.name}</span>
      {rest.length > 0 && <span className="shrink-0">+{rest.length}</span>}
    </span>
  );
}

/** Everyone to call today, by when: now, later today, any time today. */
export function QueueSection({
  items,
  incoming,
  loading,
  failed,
  now,
  nextKey,
  dialingKey,
  pickedList,
  onCall,
  onOpen,
  onAcceptIncoming,
  onRetry,
}: {
  items: QueueItem[];
  incoming: QueueItem[];
  loading: boolean;
  failed: boolean;
  now: Date;
  nextKey: string | null;
  dialingKey: string | null;
  /** The list "Call next" goes through once nobody here is due. */
  pickedList: { id: string; name: string | null } | null;
  onCall: (item: QueueItem) => void;
  /** Null when the item has nothing to open (an unknown caller). */
  onOpen: (item: QueueItem) => (() => void) | null;
  onAcceptIncoming: () => void;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="today-queue-title"
      className="bg-card overflow-hidden rounded-xl shadow-sm"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-3 pt-2.5 pb-2">
        <h2 id="today-queue-title" className="text-sm font-bold tracking-tight">
          Today&apos;s queue
        </h2>
        {items.length > 0 && (
          <p className="text-muted-foreground text-[11px]">
            {items.length} to call · the order stays put while you work
          </p>
        )}
      </header>

      {loading ? (
        <div className="space-y-2 px-3 pt-1 pb-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : failed ? (
        <div className="border-border/60 flex flex-col items-center gap-2.5 border-t px-4 py-7 text-center">
          <p className="text-sm font-medium">
            Today&apos;s queue didn&apos;t load
          </p>
          <button
            onClick={onRetry}
            className="hover:bg-accent flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center border-t px-5 py-7 text-center">
          <CalendarCheck className="text-muted-foreground mb-2.5 h-7 w-7" />
          <p className="text-sm font-semibold">Nobody to call yet today</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Callbacks you owe, missed calls and follow-ups show up here as they
            come due.
            {pickedList?.name &&
              ` Until then, Call next works through ${pickedList.name}.`}
          </p>
        </div>
      ) : (
        QUEUE_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div
              key={group}
              role="group"
              aria-labelledby={`today-queue-${group}`}
            >
              <h3
                id={`today-queue-${group}`}
                className="text-muted-foreground border-border/60 border-t px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide uppercase"
              >
                {GROUP_LABEL[group]} · {groupItems.length}
              </h3>
              <ul>
                {groupItems.map((item) => (
                  <QueueRow
                    key={item.key}
                    item={item}
                    now={now}
                    isNext={item.key === nextKey}
                    dialing={item.key === dialingKey}
                    preferredListId={pickedList?.id ?? null}
                    onCall={() => onCall(item)}
                    onOpen={onOpen(item)}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}

      {incoming.length > 0 && (
        <div
          role="status"
          className="bg-muted/50 border-border/60 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t px-3 py-2 text-xs"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            {incoming.length === 1
              ? "1 new person to call since you started"
              : `${incoming.length} new people to call since you started`}
          </span>
          <button
            onClick={onAcceptIncoming}
            className="rounded-md px-1.5 py-1 font-semibold text-blue-700 transition hover:bg-blue-500/10 dark:text-blue-300"
          >
            Add to the queue
          </button>
        </div>
      )}
    </section>
  );
}

function QueueRow({
  item,
  now,
  isNext,
  dialing,
  preferredListId,
  onCall,
  onOpen,
}: {
  item: QueueItem;
  now: Date;
  isNext: boolean;
  dialing: boolean;
  preferredListId: string | null;
  onCall: () => void;
  onOpen: (() => void) | null;
}) {
  const name = queueItemName(item);
  const note = callbackNote(item.reasons);
  const returnsACall = item.reasons.every(
    (reason) => reason.kind === "missed_call",
  );
  const callLabel = returnsACall ? "Call back" : "Call";

  const body = (
    <>
      <Avatar
        name={item.contact.name}
        fallback={item.contact.phoneNumber}
        size={32}
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate text-sm font-semibold">{name}</span>
          {/* The badges stay by the name; in a narrow panel the company wraps. */}
          {isNext && (
            <span className="inline-flex h-[18px] items-center rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              Next
            </span>
          )}
          {item.doNotCall && (
            <span className="inline-flex h-[18px] items-center rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
              Do not call
            </span>
          )}
          {item.contact.company && (
            <span className="text-muted-foreground truncate text-xs">
              {item.contact.company}
            </span>
          )}
        </span>
        <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
          <ReasonChips reasons={item.reasons} now={now} />
          {note && <span className="max-w-full truncate italic">“{note}”</span>}
          <span className="font-mono tabular-nums">
            {formatForDisplay(item.contact.phoneNumber)}
          </span>
          <QueueItemPlace item={item} now={now} />
          <ListTag lists={item.lists} preferredId={preferredListId} />
        </span>
      </span>
    </>
  );

  return (
    <li
      className={cn(
        "border-border/40 flex items-center gap-1.5 border-t pr-3",
        isNext && "bg-emerald-500/[0.06]",
      )}
    >
      {onOpen ? (
        <button
          onClick={onOpen}
          className="hover:bg-accent/60 flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left transition"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3">
          {body}
        </div>
      )}
      <button
        onClick={onCall}
        disabled={item.doNotCall || dialing}
        title={item.doNotCall ? "On the Do Not Call list" : callLabel}
        aria-label={`${callLabel} ${name}`}
        className="hover:bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-emerald-600 transition disabled:opacity-40"
      >
        {dialing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
      </button>
    </li>
  );
}
