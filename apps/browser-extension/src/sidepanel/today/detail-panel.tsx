import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Phone,
  Mic,
  FileText,
  Calendar,
  MapPin,
  Clock,
  Loader2,
  StickyNote,
} from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type {
  CallDetail,
  RingeeApi,
  TodayCallItem,
  TodayCallbackItem,
  TodayMeetingItem,
} from "../../lib/ringee-api";
import {
  formatDuration,
  formatTime,
  outcomeIsPositive,
  outcomeLabel,
} from "../../lib/format";

/** The item currently expanded into the full-panel detail view. */
export type Selected =
  | { kind: "call"; item: TodayCallItem }
  | { kind: "callback"; item: TodayCallbackItem }
  | { kind: "meeting"; item: TodayMeetingItem };

const display = (name: string | null, number?: string | null) =>
  name || (number ? formatForDisplay(number) : "Unknown");

export function DetailPanel({
  selected,
  api,
  onBack,
  onCall,
}: {
  selected: Selected;
  api: RingeeApi;
  onBack: () => void;
  onCall: (raw: string, name?: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={onBack}
          className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md transition"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {selected.kind === "call"
            ? "Call detail"
            : selected.kind === "callback"
              ? "Callback"
              : "Meeting"}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {selected.kind === "call" && (
          <CallDetailBody item={selected.item} api={api} onCall={onCall} />
        )}
        {selected.kind === "callback" && (
          <CallbackDetailBody item={selected.item} api={api} onCall={onCall} />
        )}
        {selected.kind === "meeting" && (
          <MeetingDetailBody item={selected.item} onCall={onCall} />
        )}
      </div>
    </div>
  );
}

function CallButton({
  raw,
  name,
  onCall,
  label = "Call now",
  disabled,
}: {
  raw: string | null;
  name?: string | null;
  onCall: (raw: string, name?: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled || !raw}
      onClick={() => raw && onCall(raw, name ?? undefined)}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
    >
      <Phone className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="text-muted-foreground flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function CallDetailBody({
  item,
  api,
  onCall,
}: {
  item: TodayCallItem;
  api: RingeeApi;
  onCall: (raw: string, name?: string) => void;
}) {
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .getCallDetail(item.id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, item.id]);

  const label = outcomeLabel(item.outcome);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {display(item.contactName, item.toNumber)}
        </h2>
        <p className="text-muted-foreground text-xs">
          {formatForDisplay(item.toNumber)}
        </p>
      </div>

      <div className="space-y-2">
        <Field icon={<Clock className="h-3.5 w-3.5" />}>
          {formatTime(item.createdAt)} · {formatDuration(item.durationSeconds)}
        </Field>
        {label && (
          <span
            className={
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
              (outcomeIsPositive(item.outcome)
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-muted text-muted-foreground")
            }
          >
            {label}
          </span>
        )}
        {item.outcomeNote && (
          <Field icon={<StickyNote className="h-3.5 w-3.5" />}>
            {item.outcomeNote}
          </Field>
        )}
      </div>

      {/* Recording */}
      <section className="space-y-2">
        <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          <Mic className="h-3.5 w-3.5" /> Recording
        </h3>
        {loading ? (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        ) : detail?.recording?.url ? (
          <audio
            controls
            src={detail.recording.url}
            className="w-full"
            preload="none"
          />
        ) : (
          <p className="text-muted-foreground text-xs">No recording.</p>
        )}
      </section>

      {/* Transcript */}
      <section className="space-y-2">
        <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          <FileText className="h-3.5 w-3.5" /> Transcript
        </h3>
        {loading ? (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        ) : error ? (
          <p className="text-muted-foreground text-xs">
            Couldn&apos;t load the transcript.
          </p>
        ) : detail?.transcript?.text ? (
          <div className="bg-muted/50 max-h-48 overflow-y-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {detail.transcript.text}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">No transcript.</p>
        )}
      </section>

      <CallButton
        raw={item.toNumber}
        name={item.contactName}
        onCall={onCall}
        label="Call again"
      />
    </div>
  );
}

function CallbackDetailBody({
  item,
  api,
  onCall,
}: {
  item: TodayCallbackItem;
  api: RingeeApi;
  onCall: (raw: string, name?: string) => void;
}) {
  // Dialing a callback resolves it: mark it completed (best-effort) before
  // placing the call, so it drops off the Today feed when the panel returns.
  const callAndComplete = (raw: string, name?: string) => {
    api.completeCallback(item.id).catch(() => {});
    onCall(raw, name);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {display(item.contactName, item.phone)}
        </h2>
        {item.phone && (
          <p className="text-muted-foreground text-xs">
            {formatForDisplay(item.phone)}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Field icon={<Clock className="h-3.5 w-3.5" />}>
          Scheduled for {formatTime(item.scheduledAt)}
        </Field>
        {item.note && (
          <Field icon={<StickyNote className="h-3.5 w-3.5" />}>
            {item.note}
          </Field>
        )}
      </div>
      <CallButton
        raw={item.phone}
        name={item.contactName}
        onCall={callAndComplete}
        label="Call now"
      />
    </div>
  );
}

function MeetingDetailBody({
  item,
  onCall,
}: {
  item: TodayMeetingItem;
  onCall: (raw: string, name?: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {item.title ||
            `Meeting with ${display(item.contactName, item.phone)}`}
        </h2>
        {item.contactName && (
          <p className="text-muted-foreground text-xs">{item.contactName}</p>
        )}
      </div>
      <div className="space-y-2">
        <Field icon={<Calendar className="h-3.5 w-3.5" />}>
          {formatTime(item.scheduledAt)}
        </Field>
        {item.location && (
          <Field icon={<MapPin className="h-3.5 w-3.5" />}>
            {item.location}
          </Field>
        )}
      </div>
      {item.phone && (
        <CallButton
          raw={item.phone}
          name={item.contactName}
          onCall={onCall}
          label="Call contact"
        />
      )}
    </div>
  );
}
