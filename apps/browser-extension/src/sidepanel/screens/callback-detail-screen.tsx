import { useState } from "react";
import {
  Calendar,
  Check,
  Clock,
  Loader2,
  Phone,
  StickyNote,
  User,
  X,
} from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import { Input } from "@ringee/frontend-shared/components/ui/input";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { formatTime } from "../../lib/format";
import {
  Avatar,
  Field,
  ScreenHeader,
  StatusPill,
} from "../components/ui";
import { Sheet } from "../components/sheet";
import { useApp, useNav, type CallbackNavItem } from "../navigation";

function toneFor(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled" || status === "missed") return "danger" as const;
  if (status === "due") return "warning" as const;
  return "neutral" as const;
}

/** Default reschedule target: ~30 min out, rounded to the next 15-min slot. */
function defaultLocalDateTime(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + ((15 - (d.getMinutes() % 15)) % 15));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function CallbackDetailScreen({ item }: { item: CallbackNavItem }) {
  const { api, onDial, notify } = useApp();
  const nav = useNav();

  const [status, setStatus] = useState(item.status);
  const [scheduledAt, setScheduledAt] = useState(item.scheduledAt);
  const [busy, setBusy] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [when, setWhen] = useState(defaultLocalDateTime());

  const name =
    item.contactName ||
    (item.phoneNumber ? formatForDisplay(item.phoneNumber) : "Callback");
  const isOpen = status !== "completed" && status !== "cancelled";

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.completeCallback(item.id);
      notify("success", "Callback completed");
      nav.back();
    } catch {
      notify("error", "Could not complete the callback.");
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.cancelCallback(item.id);
      notify("success", "Callback cancelled");
      nav.back();
    } catch {
      notify("error", "Could not cancel the callback.");
      setBusy(false);
    }
  };

  const reschedule = async () => {
    const date = new Date(when);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      notify("error", "Pick a future date and time.");
      return;
    }
    setBusy(true);
    try {
      await api.rescheduleCallback(item.id, date.toISOString());
      setScheduledAt(date.toISOString());
      setStatus("scheduled");
      setReschedOpen(false);
      notify("success", "Callback rescheduled");
    } catch {
      notify("error", "Could not reschedule.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Callback"
        onBack={nav.back}
        action={
          item.contactId && (
            <button
              onClick={() => nav.push({ name: "contact", id: item.contactId! })}
              className="hover:bg-accent text-muted-foreground flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition"
            >
              <User className="h-3.5 w-3.5" />
              Contact
            </button>
          )
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar name={item.contactName} fallback={item.phoneNumber} size={64} />
          <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
          <StatusPill label={status} tone={toneFor(status)} />
        </div>

        <div className="bg-card space-y-2.5 rounded-xl p-3 shadow-sm">
          <Field icon={Calendar}>Scheduled for {formatTime(scheduledAt)}</Field>
          {item.phoneNumber && (
            <Field icon={Phone}>{formatForDisplay(item.phoneNumber)}</Field>
          )}
          {item.note && <Field icon={StickyNote}>{item.note}</Field>}
        </div>

        {item.phoneNumber && (
          <button
            onClick={() =>
              onDial(item.phoneNumber!, item.contactName ?? undefined)
            }
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            <Phone className="h-4 w-4" /> Call now
          </button>
        )}

        {isOpen && (
          <div className="space-y-2">
            <Button
              onClick={complete}
              disabled={busy}
              className="w-full"
              size="sm"
            >
              <Check className="mr-1.5 h-4 w-4" /> Mark complete
            </Button>
            <Button
              variant="outline"
              onClick={() => setReschedOpen(true)}
              disabled={busy}
              className="w-full"
              size="sm"
            >
              <Clock className="mr-1.5 h-4 w-4" /> Reschedule
            </Button>
            <Button
              variant="ghost"
              onClick={cancel}
              disabled={busy}
              className="w-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
              size="sm"
            >
              <X className="mr-1.5 h-4 w-4" /> Cancel callback
            </Button>
          </div>
        )}
      </div>

      <Sheet
        open={reschedOpen}
        title="Reschedule callback"
        onClose={() => setReschedOpen(false)}
        footer={
          <Button onClick={reschedule} disabled={busy} className="w-full" size="sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reschedule"}
          </Button>
        }
      >
        <div className="space-y-1.5 py-1">
          <label className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
            New date & time
          </label>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </Sheet>
    </div>
  );
}
