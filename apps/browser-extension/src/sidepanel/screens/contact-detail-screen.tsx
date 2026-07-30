import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  CalendarPlus,
  Clock,
  Mail,
  Phone,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  Pencil,
  StickyNote,
  BriefcaseBusiness,
  Building2,
  MapPin,
  Globe2,
  BadgeDollarSign,
  UsersRound,
} from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { ContactDetail } from "../../lib/ringee-api";
import { formatDuration, formatTime, outcomeLabel } from "../../lib/format";
import {
  Avatar,
  Field,
  ScreenHeader,
  Section,
  Spinner,
} from "../components/ui";
import { NoteSheet } from "../components/note-sheet";
import { ScheduleCallbackForm } from "../schedule-callback.form";
import { BookMeetingForm } from "../book-meeting.form";
import { useApp, useNav } from "../navigation";

type Inline = "none" | "callback" | "meeting";

export function ContactDetailScreen({ id }: { id: string }) {
  const { api, onDial, notify } = useApp();
  const nav = useNav();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inline, setInline] = useState<Inline>("none");
  const [noteOpen, setNoteOpen] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .getContact(id)
      .then((d) => alive && setContact(d))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, id]);

  useEffect(() => load(), [load]);

  const c = contact;
  const displayName = c?.name || c?.phoneNumber || "Contact";

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Contact"
        onBack={nav.back}
        action={
          c && (
            <button
              onClick={() => nav.push({ name: "contact-form", id: c.id })}
              className="hover:bg-accent text-muted-foreground flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )
        }
      />

      {loading && !c && <Spinner />}
      {error && !c && (
        <p className="text-muted-foreground px-4 py-8 text-center text-xs">
          Couldn&apos;t load this contact.
        </p>
      )}

      {c && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Identity */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <Avatar name={c.name} fallback={c.phoneNumber} size={64} />
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {displayName}
            </h2>
            {c.company && (
              <p className="text-muted-foreground text-sm">{c.company}</p>
            )}
            {c.jobTitle && (
              <p className="text-muted-foreground text-xs">{c.jobTitle}</p>
            )}
          </div>

          {/* Primary actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onDial(c.phoneNumber, c.name ?? undefined)}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              <Phone className="h-4 w-4" /> Call
            </button>
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="bg-muted/60 hover:bg-muted flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition"
              >
                <Mail className="h-4 w-4" /> Email
              </a>
            )}
          </div>

          {/* Info */}
          <div className="bg-card space-y-2.5 rounded-xl p-3 shadow-sm">
            <Field icon={Phone}>{formatForDisplay(c.phoneNumber)}</Field>
            {c.email && <Field icon={Mail}>{c.email}</Field>}
            {c.company && <Field icon={Building2}>{c.company}</Field>}
            {c.jobTitle && <Field icon={BriefcaseBusiness}>{c.jobTitle}</Field>}
            {c.state && <Field icon={MapPin}>{c.state}</Field>}
            {c.website && <Field icon={Globe2}>{c.website}</Field>}
            {c.revenue && <Field icon={BadgeDollarSign}>{c.revenue}</Field>}
            {c.companySize && <Field icon={UsersRound}>{c.companySize}</Field>}
            <Field icon={Clock}>
              {c.lastContactedAt
                ? `Last contacted ${formatTime(c.lastContactedAt)}`
                : "Not contacted yet"}
            </Field>
          </div>

          {/* Upcoming */}
          {c.upcomingCallback && (
            <button
              onClick={() =>
                nav.push({
                  name: "callback",
                  item: {
                    id: c.upcomingCallback!.id,
                    contactId: c.id,
                    contactName: c.name,
                    phoneNumber: c.phoneNumber,
                    scheduledAt: c.upcomingCallback!.scheduledAt,
                    status: c.upcomingCallback!.status,
                    note: c.upcomingCallback!.note ?? null,
                  },
                })
              }
              className="bg-card hover:bg-accent flex w-full items-center gap-3 rounded-xl p-3 text-left shadow-sm transition"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/12 text-amber-600">
                <PhoneForwarded className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  Callback scheduled
                </span>
                <span className="text-muted-foreground block text-xs">
                  {formatTime(c.upcomingCallback.scheduledAt)}
                </span>
              </span>
            </button>
          )}
          {c.upcomingMeeting && (
            <button
              onClick={() =>
                nav.push({ name: "meeting", id: c.upcomingMeeting!.id })
              }
              className="bg-card hover:bg-accent flex w-full items-center gap-3 rounded-xl p-3 text-left shadow-sm transition"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/12 text-indigo-600">
                <Calendar className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {c.upcomingMeeting.title || "Upcoming meeting"}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {formatTime(c.upcomingMeeting.scheduledAt)}
                </span>
              </span>
            </button>
          )}

          {/* Schedule actions / inline forms */}
          {inline === "none" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setInline("callback")}
                className="bg-muted/50 hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition"
              >
                <PhoneForwarded className="h-3.5 w-3.5 text-amber-600" />
                Schedule callback
              </button>
              <button
                onClick={() => setInline("meeting")}
                className="bg-muted/50 hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition"
              >
                <CalendarPlus className="h-3.5 w-3.5 text-emerald-600" />
                Book meeting
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-xl p-3 shadow-sm">
              {inline === "callback" ? (
                <ScheduleCallbackForm
                  api={api}
                  notify={notify}
                  contactId={c.id}
                  onScheduled={() => {
                    setInline("none");
                    load();
                  }}
                  onCancel={() => setInline("none")}
                />
              ) : (
                <BookMeetingForm
                  api={api}
                  notify={notify}
                  contactId={c.id}
                  onBooked={() => {
                    setInline("none");
                    load();
                  }}
                  onCancel={() => setInline("none")}
                />
              )}
            </div>
          )}

          {/* Recent calls */}
          {c.recentCalls?.length > 0 && (
            <Section title="Recent calls" icon={PhoneOutgoing}>
              <ul className="divide-y divide-border/40">
                {c.recentCalls.slice(0, 8).map((call) => {
                  const inbound =
                    call.direction === "inbound" ||
                    call.direction === "incoming";
                  return (
                    <li key={call.id}>
                      <button
                        onClick={() => nav.push({ name: "call", id: call.id })}
                        className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2.5 text-left transition"
                      >
                        <span className="text-muted-foreground">
                          {inbound ? (
                            <PhoneIncoming className="h-4 w-4" />
                          ) : (
                            <PhoneOutgoing className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {outcomeLabel(call.outcome) ||
                              (inbound ? "Inbound call" : "Outbound call")}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {formatTime(call.startedAt ?? "")}
                            {call.durationSeconds
                              ? ` · ${formatDuration(call.durationSeconds)}`
                              : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* Notes */}
          {c.notes?.length > 0 && (
            <Section title="Notes" icon={StickyNote}>
              <ul className="divide-y divide-border/40">
                {c.notes.slice(0, 10).map((n) => (
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

          <button
            onClick={() => setNoteOpen(true)}
            className="bg-muted/50 hover:bg-muted flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Add note
          </button>
        </div>
      )}

      {c && (
        <NoteSheet
          open={noteOpen}
          title="Add contact note"
          placeholder="What's relevant about this contact?"
          onClose={() => setNoteOpen(false)}
          onSubmit={async (content) => {
            await api.addContactNote(c.id, content);
            notify("success", "Note added");
            load();
          }}
        />
      )}
    </div>
  );
}
