import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  FileText,
  Mic,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  StickyNote,
  Tag,
  User,
} from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { CallDetail, CallFull } from "../../lib/ringee-api";
import {
  formatDuration,
  formatTime,
  outcomeIsPositive,
  outcomeLabel,
} from "../../lib/format";
import {
  Avatar,
  Field,
  ScreenHeader,
  Section,
  Spinner,
  StatusPill,
} from "../components/ui";
import { OutcomeSheet } from "../components/outcome-sheet";
import { NoteSheet } from "../components/note-sheet";
import { useApp, useNav } from "../navigation";

export function CallDetailScreen({ id }: { id: string }) {
  const { api, onDial, notify } = useApp();
  const nav = useNav();

  const [call, setCall] = useState<CallFull | null>(null);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    Promise.all([api.getCallFull(id), api.getCallDetail(id).catch(() => null)])
      .then(([full, det]) => {
        if (!alive) return;
        setCall(full);
        setDetail(det);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, id]);

  useEffect(() => load(), [load]);

  const c = call;
  const inbound = c?.direction === "inbound" || c?.direction === "incoming";
  const number = c ? c.phoneNumber || (inbound ? c.fromNumber : c.toNumber) : "";
  const name = c?.contactName || (number ? formatForDisplay(number) : "Call");
  const recordingUrl = c?.recordingUrl || detail?.recording?.url || null;
  const transcriptText = detail?.transcript?.text || null;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={inbound ? "Inbound call" : "Outbound call"}
        onBack={nav.back}
        action={
          c?.contactId && (
            <button
              onClick={() => nav.push({ name: "contact", id: c.contactId! })}
              className="hover:bg-accent text-muted-foreground flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition"
            >
              <User className="h-3.5 w-3.5" />
              Contact
            </button>
          )
        }
      />

      {loading && !c && <Spinner />}
      {error && !c && (
        <p className="text-muted-foreground px-4 py-8 text-center text-xs">
          Couldn&apos;t load this call.
        </p>
      )}

      {c && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <Avatar name={c.contactName} fallback={number} size={64} />
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{name}</h2>
            {number && name !== formatForDisplay(number) && (
              <p className="text-muted-foreground text-xs">
                {formatForDisplay(number)}
              </p>
            )}
          </div>

          <button
            onClick={() => onDial(number, c.contactName ?? undefined)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            <Phone className="h-4 w-4" /> Call again
          </button>

          {/* Meta */}
          <div className="bg-card space-y-2.5 rounded-xl p-3 shadow-sm">
            <Field icon={inbound ? PhoneIncoming : PhoneOutgoing}>
              {inbound ? "Inbound" : "Outbound"}
            </Field>
            <Field icon={Clock}>
              {formatTime(c.startedAt ?? "")} · {formatDuration(c.durationSeconds)}
            </Field>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              {c.outcome ? (
                <StatusPill
                  label={outcomeLabel(c.outcome) ?? c.outcome}
                  tone={outcomeIsPositive(c.outcome) ? "success" : "neutral"}
                />
              ) : (
                <span className="text-muted-foreground">No outcome set</span>
              )}
            </div>
            {c.outcomeNote && <Field icon={StickyNote}>{c.outcomeNote}</Field>}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOutcomeOpen(true)}
              className="bg-muted/50 hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition"
            >
              <Tag className="h-3.5 w-3.5" />
              {c.outcome ? "Edit outcome" : "Set outcome"}
            </button>
            <button
              onClick={() => setNoteOpen(true)}
              className="bg-muted/50 hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition"
            >
              <StickyNote className="h-3.5 w-3.5" />
              Add note
            </button>
          </div>

          {/* Recording */}
          <div className="space-y-2">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <Mic className="h-3.5 w-3.5" /> Recording
            </h3>
            {recordingUrl ? (
              <audio controls src={recordingUrl} className="w-full" preload="none" />
            ) : (
              <p className="text-muted-foreground text-xs">No recording.</p>
            )}
          </div>

          {/* Transcript */}
          <div className="space-y-2">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <FileText className="h-3.5 w-3.5" /> Transcript
            </h3>
            {transcriptText ? (
              <div className="bg-muted/50 max-h-48 overflow-y-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
                {transcriptText}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">No transcript.</p>
            )}
          </div>

          {/* Notes */}
          {c.notes && c.notes.length > 0 && (
            <Section title="Notes" icon={StickyNote}>
              <ul className="divide-y divide-border/40">
                {c.notes.map((n) => (
                  <li key={n.id} className="px-3 py-2.5">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {n.content}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      {formatTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {c && (
        <>
          <OutcomeSheet
            open={outcomeOpen}
            initialOutcome={c.outcome}
            initialNote={c.outcomeNote}
            onClose={() => setOutcomeOpen(false)}
            onSubmit={async ({ outcome, note }) => {
              await api.setCallOutcome(c.id, { outcome, outcomeNote: note });
              notify("success", "Outcome saved");
              load();
            }}
          />
          <NoteSheet
            open={noteOpen}
            title="Add call note"
            onClose={() => setNoteOpen(false)}
            onSubmit={async (content) => {
              await api.addCallNote(c.id, content);
              notify("success", "Note added");
              load();
            }}
          />
        </>
      )}
    </div>
  );
}
