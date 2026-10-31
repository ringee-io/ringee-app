import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/chrome-extension";
import PhoneInput, {
  isPossiblePhoneNumber,
  type Value,
  type Flags,
} from "react-phone-number-input";
import * as flagComponents from "country-flag-icons/react/3x2";
import "react-phone-number-input/style.css";
import {
  CalendarPlus,
  FileText,
  Mic,
  Phone,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
} from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import { DEFAULT_REGION } from "../../lib/region";
import type { QueueItem, RingeeApi, TodayCallItem } from "../../lib/ringee-api";
import { formatTime, outcomeIsPositive, outcomeLabel } from "../../lib/format";
import {
  owedCallbacks,
  pickNextCall,
  upcomingCall,
} from "../../lib/today-queue";
import { ListRow, RowIcon, Section } from "../components/ui";
import { useApp, useNav } from "../navigation";
import { DayCard } from "../today/day-card";
import { ListPickerSheet } from "../today/list-picker-sheet";
import { NextCallCard } from "../today/next-call-card";
import { QueueSection } from "../today/queue-section";
import { useCallList } from "../today/use-call-list";
import { useQueue, useQueueDial } from "../today/use-queue";
import { useSummary } from "../today/use-summary";

const flags = flagComponents as unknown as Flags;

/** Web app host — where lists are made. */
const APP_HOST =
  import.meta.env.VITE_CLERK_SYNC_HOST ?? "https://www.ringee.io";

const display = (name: string | null, number?: string | null) =>
  name || (number ? formatForDisplay(number) : "Unknown");

/**
 * The Today tab: the day the web Call page works ("My day"), in the side
 * panel — a quick-dial bar with two scheduling shortcuts, the next call,
 * today's queue, how the day is going and today's calls. Every row pushes its
 * detail screen.
 */
export function TodayScreen() {
  const { userId, orgId } = useAuth();
  const workspaceKey = userId ? `${userId}:${orgId ?? "personal"}` : null;
  // Another workspace is another day: its queue and its picked list start
  // afresh.
  return <TodayBody key={workspaceKey ?? "none"} workspaceKey={workspaceKey} />;
}

function TodayBody({ workspaceKey }: { workspaceKey: string | null }) {
  const { api, notify, callsFinished } = useApp();
  const nav = useNav();
  const now = useNow(30_000);
  const queue = useQueue(api);
  const summary = useSummary(api);
  const callList = useCallList(api, workspaceKey, notify);
  const recent = useRecentCalls(api);
  const [listPickerOpen, setListPickerOpen] = useState(false);

  const refreshQueue = queue.refresh;
  const refreshSummary = summary.refresh;
  const refreshListNext = callList.refreshNext;
  const refreshRecent = recent.refresh;
  const refreshAll = useCallback(() => {
    void refreshQueue();
    void refreshSummary();
    void refreshListNext();
    void refreshRecent();
  }, [refreshQueue, refreshSummary, refreshListNext, refreshRecent]);

  const { callItem, dialingKey } = useQueueDial(refreshAll);

  // What a call changed — a callback done, a missed call returned, a list
  // moved on — is worth re-reading once its screen closes.
  const seenCalls = useRef(callsFinished);
  useEffect(() => {
    if (seenCalls.current === callsFinished) return;
    seenCalls.current = callsFinished;
    refreshAll();
  }, [callsFinished, refreshAll]);

  // What is left in each list moves with every call: re-read it on opening.
  const refreshLists = callList.refreshLists;
  useEffect(() => {
    if (listPickerOpen) void refreshLists();
  }, [listPickerOpen, refreshLists]);

  const next = useMemo(
    () => pickNextCall(queue.items, callList.next, now),
    [queue.items, callList.next, now],
  );
  const upcoming = useMemo(
    () => upcomingCall(queue.items, now),
    [queue.items, now],
  );
  const hasLists = callList.lists.length > 0;

  const createList = useCallback(() => {
    setListPickerOpen(false);
    chrome.tabs.create({ url: `${APP_HOST}/dashboard/lists` });
  }, []);

  /** A callback opens its own screen; anyone else, their contact. */
  const openItem = useCallback(
    (item: QueueItem): (() => void) | null => {
      const callback = owedCallbacks(item)[0];
      if (callback) {
        return () =>
          nav.push({
            name: "callback",
            item: {
              id: callback.callbackId,
              contactId: item.contact.id,
              contactName: item.contact.name,
              phoneNumber: item.contact.phoneNumber,
              scheduledAt: callback.at,
              // An owed callback is scheduled, and due once its time has
              // come — the same rule the server marks it by.
              status:
                new Date(callback.at).getTime() <= Date.now()
                  ? "due"
                  : "scheduled",
              note: callback.note,
            },
          });
      }
      const contactId = item.contact.id;
      return contactId
        ? () => nav.push({ name: "contact", id: contactId })
        : null;
    },
    [nav],
  );

  return (
    <div className="flex h-full flex-col">
      <QuickDial />

      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-4">
        <NextCallCard
          next={next}
          upcoming={upcoming}
          picked={
            callList.selectedId
              ? {
                  list: callList.selected,
                  loading: callList.nextLoading,
                  failed: callList.nextFailed,
                  onRetry: () => void refreshListNext(),
                }
              : null
          }
          hasLists={hasLists}
          settling={
            queue.loading ||
            (!next && (callList.nextLoading || callList.listsLoading))
          }
          now={now}
          dialing={next !== null && dialingKey === next.item.key}
          skipping={callList.skipping}
          onCall={(item) => void callItem(item)}
          onSkip={(entryId) => {
            if (!dialingKey) void callList.skip(entryId);
          }}
          onChooseList={() => setListPickerOpen(true)}
          onCreateList={createList}
        />

        <QueueSection
          items={queue.items}
          incoming={queue.incoming}
          loading={queue.loading}
          failed={queue.failed}
          now={now}
          nextKey={next?.source === "queue" ? next.item.key : null}
          dialingKey={dialingKey}
          pickedList={
            callList.selectedId
              ? {
                  id: callList.selectedId,
                  name: callList.selected?.name ?? null,
                }
              : null
          }
          onCall={(item) => void callItem(item)}
          onOpen={openItem}
          onAcceptIncoming={queue.acceptIncoming}
          onRetry={() => void refreshQueue()}
        />

        <DayCard
          summary={summary.summary}
          failed={summary.failed}
          now={now}
          onOpenMeeting={(id) => nav.push({ name: "meeting", id })}
        />

        <RecentCalls
          calls={recent.calls}
          failed={recent.failed}
          loading={recent.loading}
          onRefresh={refreshAll}
          onOpen={(id) => nav.push({ name: "call", id })}
        />
      </div>

      <ListPickerSheet
        open={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        lists={callList.lists}
        loading={callList.listsLoading}
        failed={callList.listsFailed}
        onRetry={() => void refreshLists()}
        selectedId={callList.selectedId}
        onSelect={callList.select}
        onCreateList={createList}
      />
    </div>
  );
}

/** The time the queue reads "due" and "in 10 minutes" against. */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** A number typed in, and the two scheduling shortcuts. */
function QuickDial() {
  const { onDial } = useApp();
  const nav = useNav();
  const [value, setValue] = useState<Value | undefined>();
  const valid = useMemo(() => !!value && isPossiblePhoneNumber(value), [value]);

  const submitDial = () => {
    if (!valid || !value) return;
    void onDial(value);
    setValue(undefined);
  };

  return (
    <div className="p-3">
      <div className="bg-card rounded-xl p-3 shadow-sm">
        <label className="text-muted-foreground mb-1.5 block text-[11px] font-semibold tracking-wide uppercase">
          Quick dial
        </label>
        <div className="flex items-center gap-2">
          <PhoneInput
            international
            defaultCountry={DEFAULT_REGION}
            flags={flags}
            placeholder="Enter number"
            value={value}
            onChange={setValue}
            onKeyDown={(e: React.KeyboardEvent) =>
              e.key === "Enter" && submitDial()
            }
            className="ringee-phone flex-1"
          />
          <button
            disabled={!valid}
            onClick={submitDial}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-40 disabled:shadow-none"
            aria-label="Call"
          >
            <Phone className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            onClick={() => nav.push({ name: "schedule", mode: "callback" })}
            className="bg-muted/50 hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition"
          >
            <PhoneForwarded className="h-3.5 w-3.5 text-amber-600" />
            New callback
          </button>
          <button
            onClick={() => nav.push({ name: "schedule", mode: "meeting" })}
            className="bg-muted/50 hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-emerald-600" />
            New meeting
          </button>
        </div>
      </div>
    </div>
  );
}

/** The calls made today, newest first; each opens its recording and notes. */
function useRecentCalls(api: RingeeApi) {
  const [calls, setCalls] = useState<TodayCallItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const today = await api.getToday();
      if (request !== requestRef.current) return;
      setCalls(today.calls);
      setFailed(false);
    } catch {
      if (request === requestRef.current) setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    calls,
    loading: calls === null && !failed,
    failed: failed && calls === null,
    refresh,
  };
}

function RecentCalls({
  calls,
  loading,
  failed,
  onRefresh,
  onOpen,
}: {
  calls: TodayCallItem[] | null;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Section
      title="Recent calls"
      count={calls?.length}
      icon={PhoneOutgoing}
      action={
        <button
          onClick={onRefresh}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-6 w-6 items-center justify-center rounded-md transition"
          aria-label="Refresh"
        >
          <RefreshCw
            className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")}
          />
        </button>
      }
    >
      {failed ? (
        <p className="text-muted-foreground px-3 py-3 text-xs">
          Today&apos;s calls didn&apos;t load. Tap refresh to retry.
        </p>
      ) : !calls?.length ? (
        <p className="text-muted-foreground/70 px-3 py-3 text-xs">
          {loading ? "Loading…" : "No calls yet today."}
        </p>
      ) : (
        <ul className="divide-border/40 divide-y">
          {calls.map((c) => (
            <CallRow key={c.id} item={c} onClick={() => onOpen(c.id)} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function CallRow({
  item,
  onClick,
}: {
  item: TodayCallItem;
  onClick: () => void;
}) {
  const inbound = item.direction === "inbound" || item.direction === "incoming";
  const label = outcomeLabel(item.outcome);
  return (
    <li>
      <ListRow
        onClick={onClick}
        leading={<RowIcon icon={inbound ? PhoneIncoming : PhoneOutgoing} />}
        title={display(item.contactName, item.toNumber)}
        subtitle={
          <>
            {formatTime(item.createdAt)}
            {label && (
              <span
                className={
                  "ml-1.5 " +
                  (outcomeIsPositive(item.outcome)
                    ? "text-emerald-600"
                    : "text-muted-foreground")
                }
              >
                · {label}
              </span>
            )}
          </>
        }
        trailing={
          <span className="flex shrink-0 items-center gap-1.5">
            {item.hasRecording && (
              <Mic
                className="h-3.5 w-3.5 text-emerald-600"
                aria-label="Has recording"
              />
            )}
            {item.hasTranscription && (
              <FileText
                className="h-3.5 w-3.5 text-emerald-600"
                aria-label="Has transcript"
              />
            )}
          </span>
        }
      />
    </li>
  );
}
