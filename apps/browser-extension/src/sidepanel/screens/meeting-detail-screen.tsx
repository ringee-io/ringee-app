import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  StickyNote,
  User,
  Video,
  X,
} from "lucide-react";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import type { Meeting } from "../../lib/ringee-api";
import { formatTime } from "../../lib/format";
import {
  Avatar,
  Field,
  ScreenHeader,
  Spinner,
  StatusPill,
} from "../components/ui";
import { useApp, useNav } from "../navigation";

function toneFor(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  return "info" as const;
}

export function MeetingDetailScreen({ id }: { id: string }) {
  const { notify, api } = useApp();
  const nav = useNav();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .getMeeting(id)
      .then((m) => alive && setMeeting(m))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, id]);

  useEffect(() => load(), [load]);

  const m = meeting;

  const cancel = async () => {
    if (!m || busy) return;
    setBusy(true);
    try {
      await api.cancelMeeting(m.id);
      notify("success", "Meeting cancelled");
      nav.back();
    } catch {
      notify("error", "Could not cancel the meeting.");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Meeting"
        onBack={nav.back}
        action={
          m?.contactId && (
            <button
              onClick={() => nav.push({ name: "contact", id: m.contactId })}
              className="hover:bg-accent text-muted-foreground flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition"
            >
              <User className="h-3.5 w-3.5" />
              Contact
            </button>
          )
        }
      />

      {loading && !m && <Spinner />}
      {error && !m && (
        <p className="text-muted-foreground px-4 py-8 text-center text-xs">
          Couldn&apos;t load this meeting.
        </p>
      )}

      {m && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar name={m.contactName || m.title} fallback={m.title} size={64} />
            <h2 className="text-lg font-semibold tracking-tight">
              {m.title ||
                (m.contactName ? `Meeting with ${m.contactName}` : "Meeting")}
            </h2>
            {m.contactCompany && (
              <p className="text-muted-foreground text-sm">{m.contactCompany}</p>
            )}
            <StatusPill label={m.status} tone={toneFor(m.status)} />
          </div>

          <div className="bg-card space-y-2.5 rounded-xl p-3 shadow-sm">
            <Field icon={Calendar}>{formatTime(m.scheduledAt)}</Field>
            <Field icon={Clock}>{m.duration} min</Field>
            {m.location && <Field icon={MapPin}>{m.location}</Field>}
            {m.notes && <Field icon={StickyNote}>{m.notes}</Field>}
          </div>

          {m.meetingUrl && (
            <a
              href={m.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-600"
            >
              <Video className="h-4 w-4" /> Open meeting link
            </a>
          )}

          {m.status === "scheduled" && (
            <Button
              variant="ghost"
              onClick={cancel}
              disabled={busy}
              className="w-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
              size="sm"
            >
              <X className="mr-1.5 h-4 w-4" /> Cancel meeting
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
