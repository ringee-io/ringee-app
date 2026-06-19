import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  ChevronRight,
  FileText,
  Loader2,
  Mic,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
} from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type {
  RingeeApi,
  TodayCallItem,
  TodayCallbackItem,
  TodayData,
  TodayMeetingItem,
} from "../../lib/ringee-api";
import { formatTime, outcomeIsPositive, outcomeLabel } from "../../lib/format";
import { DetailPanel, type Selected } from "./detail-panel";

const display = (name: string | null, number?: string | null) =>
  name || (number ? formatForDisplay(number) : "Unknown");

/**
 * The side panel's "Today" feed: actionable callbacks, the calls made today
 * (with recording/transcription indicators) and today's meetings. Each row
 * opens a detail; calls and callbacks can be re-dialed from there. It refetches
 * on mount, which happens every time the panel returns from a call.
 */
export function TodayView({
  api,
  onCall,
}: {
  api: RingeeApi;
  onCall: (raw: string, name?: string) => void;
}) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);

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

  if (selected) {
    return (
      <DetailPanel
        selected={selected}
        api={api}
        onBack={() => setSelected(null)}
        onCall={onCall}
      />
    );
  }

  const empty =
    data &&
    !data.callbacks.length &&
    !data.calls.length &&
    !data.meetings.length;

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4">
      <div className="flex items-center justify-between px-1 pt-1 pb-2">
        <h2 className="text-sm font-bold tracking-tight">Today</h2>
        <button
          onClick={() => load()}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md transition"
          aria-label="Refresh"
        >
          <RefreshCw
            className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")}
          />
        </button>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-10">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      )}

      {error && !data && (
        <p className="text-muted-foreground px-4 py-8 text-center text-xs">
          Couldn&apos;t load your day. Tap refresh to retry.
        </p>
      )}

      {empty && (
        <p className="text-muted-foreground px-4 py-8 text-center text-xs">
          Nothing scheduled today. Type a number above to start a call.
        </p>
      )}

      {data && (
        <div className="space-y-3">
          <Section
            title="Callbacks"
            count={data.callbacks.length}
            icon={<PhoneForwarded className="h-3.5 w-3.5" />}
          >
            {data.callbacks.map((c) => (
              <CallbackRow
                key={c.id}
                item={c}
                onClick={() => setSelected({ kind: "callback", item: c })}
              />
            ))}
          </Section>

          <Section
            title="Recent calls"
            count={data.calls.length}
            icon={<PhoneOutgoing className="h-3.5 w-3.5" />}
          >
            {data.calls.map((c) => (
              <CallRow
                key={c.id}
                item={c}
                onClick={() => setSelected({ kind: "call", item: c })}
              />
            ))}
          </Section>

          <Section
            title="Meetings"
            count={data.meetings.length}
            icon={<Calendar className="h-3.5 w-3.5" />}
          >
            {data.meetings.map((m) => (
              <MeetingRow
                key={m.id}
                item={m}
                onClick={() => setSelected({ kind: "meeting", item: m })}
              />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-background overflow-hidden rounded-xl shadow-sm">
      <div className="text-muted-foreground flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold tracking-wide uppercase">
        <span className="text-emerald-600">{icon}</span>
        {title}
        <span className="bg-muted text-muted-foreground ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-muted-foreground/70 px-3 py-3 text-xs">
          Nothing yet.
        </p>
      ) : (
        <ul className="divide-y">{children}</ul>
      )}
    </section>
  );
}

function Row({
  onClick,
  left,
  title,
  subtitle,
  right,
}: {
  onClick: () => void;
  left: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <li className="border-none">
      <button
        onClick={onClick}
        className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2.5 text-left transition"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          {left}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {subtitle && (
            <span className="text-muted-foreground block truncate text-xs">
              {subtitle}
            </span>
          )}
        </span>
        {right}
        <ChevronRight className="text-muted-foreground/50 h-4 w-4 shrink-0" />
      </button>
    </li>
  );
}

function CallbackRow({
  item,
  onClick,
}: {
  item: TodayCallbackItem;
  onClick: () => void;
}) {
  return (
    <Row
      onClick={onClick}
      left={<PhoneForwarded className="h-4 w-4" />}
      title={display(item.contactName, item.phone)}
      subtitle={item.note || formatForDisplay(item.phone ?? "")}
      right={
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatTime(item.scheduledAt)}
        </span>
      }
    />
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
    <Row
      onClick={onClick}
      left={
        inbound ? (
          <PhoneIncoming className="h-4 w-4" />
        ) : (
          <PhoneOutgoing className="h-4 w-4" />
        )
      }
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
      right={
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
    <Row
      onClick={onClick}
      left={<Calendar className="h-4 w-4" />}
      title={item.title || `Meeting with ${display(item.contactName)}`}
      subtitle={item.contactName ?? item.location ?? undefined}
      right={
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatTime(item.scheduledAt)}
        </span>
      }
    />
  );
}
