import { useCallback, useEffect, useMemo, useState } from "react";
import PhoneInput, {
  isPossiblePhoneNumber,
  type Value,
  type Flags,
} from "react-phone-number-input";
import * as flagComponents from "country-flag-icons/react/3x2";
import "react-phone-number-input/style.css";
import {
  CalendarPlus,
  Calendar,
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
import type {
  TodayCallItem,
  TodayCallbackItem,
  TodayData,
  TodayMeetingItem,
} from "../../lib/ringee-api";
import { formatTime, outcomeIsPositive, outcomeLabel } from "../../lib/format";
import { EmptyState, ListRow, RowIcon, Section, Spinner } from "../components/ui";
import { useApp, useNav } from "../navigation";

const flags = flagComponents as unknown as Flags;

const display = (name: string | null, number?: string | null) =>
  name || (number ? formatForDisplay(number) : "Unknown");

/**
 * The Today tab: a quick-dial bar, two scheduling shortcuts, and the actionable
 * feed (callbacks, recent calls, meetings). Every row pushes its detail screen.
 */
export function TodayScreen() {
  const { api, onDial } = useApp();
  const nav = useNav();

  const [value, setValue] = useState<Value | undefined>();
  const valid = useMemo(() => !!value && isPossiblePhoneNumber(value), [value]);

  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .getToday()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api]);

  useEffect(() => load(), [load]);

  const submitDial = () => {
    if (!valid || !value) return;
    onDial(value);
    setValue(undefined);
  };

  const empty =
    data && !data.callbacks.length && !data.calls.length && !data.meetings.length;

  return (
    <div className="flex h-full flex-col">
      {/* Quick dial */}
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

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="text-sm font-bold tracking-tight">Today</h2>
          <button
            onClick={() => load()}
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md transition"
            aria-label="Refresh"
          >
            <RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} />
          </button>
        </div>

        {loading && !data && <Spinner />}

        {error && !data && (
          <p className="text-muted-foreground px-4 py-8 text-center text-xs">
            Couldn&apos;t load your day. Tap refresh to retry.
          </p>
        )}

        {empty && (
          <EmptyState
            icon={Phone}
            title="Nothing scheduled today"
            message="Type a number above to start a call."
          />
        )}

        {data && !empty && (
          <div className="space-y-3">
            <Section
              title="Callbacks"
              count={data.callbacks.length}
              icon={PhoneForwarded}
            >
              <FeedList
                empty={data.callbacks.length === 0}
                rows={data.callbacks.map((c) => (
                  <CallbackRow
                    key={c.id}
                    item={c}
                    onClick={() =>
                      nav.push({
                        name: "callback",
                        item: {
                          id: c.id,
                          contactId: c.contactId,
                          contactName: c.contactName,
                          phoneNumber: c.phone,
                          scheduledAt: c.scheduledAt,
                          status: c.status,
                          note: c.note,
                        },
                      })
                    }
                  />
                ))}
              />
            </Section>

            <Section
              title="Recent calls"
              count={data.calls.length}
              icon={PhoneOutgoing}
            >
              <FeedList
                empty={data.calls.length === 0}
                rows={data.calls.map((c) => (
                  <CallRow
                    key={c.id}
                    item={c}
                    onClick={() => nav.push({ name: "call", id: c.id })}
                  />
                ))}
              />
            </Section>

            <Section title="Meetings" count={data.meetings.length} icon={Calendar}>
              <FeedList
                empty={data.meetings.length === 0}
                rows={data.meetings.map((m) => (
                  <MeetingRow
                    key={m.id}
                    item={m}
                    onClick={() => nav.push({ name: "meeting", id: m.id })}
                  />
                ))}
              />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedList({ empty, rows }: { empty: boolean; rows: React.ReactNode }) {
  if (empty) {
    return (
      <p className="text-muted-foreground/70 px-3 py-3 text-xs">Nothing yet.</p>
    );
  }
  return <ul className="divide-y divide-border/40">{rows}</ul>;
}

function CallbackRow({
  item,
  onClick,
}: {
  item: TodayCallbackItem;
  onClick: () => void;
}) {
  return (
    <li>
      <ListRow
        onClick={onClick}
        leading={<RowIcon icon={PhoneForwarded} />}
        title={display(item.contactName, item.phone)}
        subtitle={item.note || formatForDisplay(item.phone ?? "")}
        trailing={
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatTime(item.scheduledAt)}
          </span>
        }
      />
    </li>
  );
}

function CallRow({ item, onClick }: { item: TodayCallItem; onClick: () => void }) {
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
              <Mic className="h-3.5 w-3.5 text-emerald-600" aria-label="Has recording" />
            )}
            {item.hasTranscription && (
              <FileText className="h-3.5 w-3.5 text-emerald-600" aria-label="Has transcript" />
            )}
          </span>
        }
      />
    </li>
  );
}

function MeetingRow({
  item,
  onClick,
}: {
  item: TodayMeetingItem;
  onClick: () => void;
}) {
  return (
    <li>
      <ListRow
        onClick={onClick}
        leading={<RowIcon icon={Calendar} />}
        title={item.title || `Meeting with ${display(item.contactName)}`}
        subtitle={item.contactName ?? item.location ?? undefined}
        trailing={
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatTime(item.scheduledAt)}
          </span>
        }
      />
    </li>
  );
}
