import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  List,
  Loader2,
  Phone,
  RotateCw,
  SkipForward,
} from "lucide-react";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { Skeleton } from "@ringee/frontend-shared/components/ui/skeleton";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { CallList, QueueItem } from "../../lib/ringee-api";
import { formatDayTime } from "../../lib/format";
import { callbackNote, type NextCall } from "../../lib/today-queue";
import { Avatar } from "../components/ui";
import {
  ListTag,
  QueueItemPlace,
  ReasonChips,
  queueItemName,
} from "./queue-section";

/** The picked list, when there is one, as far as it is known. */
export interface PickedList {
  list: CallList | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

interface NextCallCardProps {
  next: NextCall | null;
  /** With nobody due, who comes due next today. */
  upcoming: QueueItem | null;
  /** Null when no list is picked. */
  picked: PickedList | null;
  /** The user has lists of their own to pick from. */
  hasLists: boolean;
  /** Not known yet whether there is anybody to call. */
  settling: boolean;
  now: Date;
  dialing: boolean;
  skipping: boolean;
  onCall: (item: QueueItem) => void;
  onSkip: (entryId: string) => void;
  onChooseList: () => void;
  /** With no list of their own: make one, in the web app. */
  onCreateList: () => void;
}

/** The one primary action of the panel: call the next person. */
export function NextCallCard({
  next,
  upcoming,
  picked,
  hasLists,
  settling,
  now,
  dialing,
  skipping,
  onCall,
  onSkip,
  onChooseList,
  onCreateList,
}: NextCallCardProps) {
  if (settling) return <Skeleton className="h-[124px] w-full rounded-xl" />;

  if (!next && !picked && !hasLists) {
    return <StartCalling onCreateList={onCreateList} />;
  }

  const chip =
    hasLists || picked ? (
      <ListChip list={picked?.list ?? null} onClick={onChooseList} />
    ) : null;

  if (!next) {
    return (
      <NothingToCall
        upcoming={upcoming}
        picked={picked}
        hasLists={hasLists}
        now={now}
        chip={chip}
      />
    );
  }

  const { item } = next;
  const name = queueItemName(item);
  const note = callbackNote(item.reasons);
  const fromList = next.source === "list" ? next : null;

  return (
    <section
      aria-label="Next call"
      className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]"
    >
      <CardLabel chip={chip} />
      <div className="mt-2 flex items-center gap-3">
        <Avatar
          name={item.contact.name}
          fallback={item.contact.phoneNumber}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-semibold">
            {name}
            {item.contact.company && (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {item.contact.company}
              </span>
            )}
          </p>
          <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {fromList ? (
              <>
                {fromList.entry.skipped && (
                  <span className="bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold">
                    Skipped earlier
                  </span>
                )}
                <span className="inline-flex h-5 items-center rounded-full bg-violet-100 px-2 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  {fromList.list.remaining} left in the list
                </span>
              </>
            ) : (
              <ReasonChips reasons={item.reasons} now={now} />
            )}
            {note && (
              <span className="max-w-full truncate italic">“{note}”</span>
            )}
            <span className="font-mono tabular-nums">
              {formatForDisplay(item.contact.phoneNumber)}
            </span>
            <QueueItemPlace item={item} now={now} />
            {!fromList && <ListTag lists={item.lists} />}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {fromList && (
          <button
            onClick={() => onSkip(fromList.entry.entryId)}
            disabled={dialing || skipping}
            title="Skip: they go to the end of the list"
            className="hover:bg-background/70 flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition disabled:opacity-40"
          >
            {skipping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SkipForward className="h-4 w-4" />
            )}
            Skip
          </button>
        )}
        <button
          onClick={() => onCall(item)}
          disabled={dialing || skipping}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {dialing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
          {dialing ? "Calling…" : "Call next"}
        </button>
      </div>
    </section>
  );
}

function CardLabel({ chip }: { chip: React.ReactNode }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <p className="text-[11px] font-semibold tracking-wide text-emerald-800 uppercase dark:text-emerald-300">
        Next call
      </p>
      {chip}
    </div>
  );
}

/** The list "Call next" goes through, and the way to change it. */
function ListChip({
  list,
  onClick,
}: {
  list: CallList | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={
        list
          ? `Calling from ${list.name}. Change the list`
          : "Choose a list to call"
      }
      className={cn(
        "text-foreground/80 hover:bg-accent flex max-w-[60%] min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
        list
          ? "border-violet-300 bg-violet-50/70 dark:border-violet-500/40 dark:bg-violet-500/10"
          : "bg-background",
      )}
    >
      <List className="h-3 w-3 shrink-0" />
      <span className="truncate">{list?.name ?? "Choose a list"}</span>
      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
}

/** No list of their own and nobody due: the way to line people up. */
function StartCalling({ onCreateList }: { onCreateList: () => void }) {
  return (
    <section
      aria-label="Next call"
      className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]"
    >
      <CardLabel chip={null} />
      <div className="mt-2 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Phone className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-semibold">
            Line up who to call
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Upload a file or type a few numbers into a list in Ringee. Call next
            hands you the next person, every time.
          </p>
        </div>
      </div>
      <button
        onClick={onCreateList}
        className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white/70 text-sm font-semibold text-emerald-800 transition hover:bg-white dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-300 dark:hover:bg-emerald-500/10"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Create a list
      </button>
    </section>
  );
}

/**
 * Nobody to call now: what comes due next, how the picked list stands, and
 * the way to keep calling — a list of the user's own.
 */
function NothingToCall({
  upcoming,
  picked,
  hasLists,
  now,
  chip,
}: {
  upcoming: QueueItem | null;
  picked: PickedList | null;
  hasLists: boolean;
  now: Date;
  chip: React.ReactNode;
}) {
  const upcomingAt = upcoming?.dueAt ? new Date(upcoming.dueAt) : null;
  const upcomingHint =
    upcoming && upcomingAt
      ? `Next up: ${queueItemName(upcoming)} at ${formatDayTime(upcomingAt, now)}.`
      : null;

  let title: string;
  let hint: string;
  if (picked?.failed) {
    title = "Your list's next contact didn't load";
    hint = "Check your connection and try again.";
  } else if (picked?.list) {
    const remaining = picked.list.remaining;
    title = `Nobody left to call in ${picked.list.name}`;
    hint =
      upcomingHint ??
      (remaining > 0
        ? `${remaining} ${remaining === 1 ? "contact" : "contacts"} can't be called now: on the Do Not Call list, with a callback booked, or without a valid number.`
        : "Everyone in it has been called. Pick another list to keep going.");
  } else if (upcomingHint) {
    title = "Nothing due right now";
    hint = upcomingHint;
  } else {
    title = "You're all caught up";
    hint = hasLists
      ? "Pick one of your lists to keep calling."
      : "Type a number above to start a call.";
  }

  return (
    <section
      aria-label="Next call"
      className="bg-card rounded-xl p-3 shadow-sm"
    >
      <CardLabel chip={chip} />
      <div className="mt-2 flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
      </div>
      {picked?.failed && (
        <button
          onClick={picked.onRetry}
          className="hover:bg-accent mt-2.5 flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </button>
      )}
    </section>
  );
}
