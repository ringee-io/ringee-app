import { useState } from "react";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Input } from "@ringee/frontend-shared/components/ui/input";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { CalendarPlus, Loader2 } from "lucide-react";
import type { RingeeApi } from "../lib/ringee-api";

/**
 * Lean meeting booker for the side panel's post-call view. Same backend endpoint
 * as the web app (POST /meetings) but compact and self-contained: a date/time, a
 * duration, and an optional attendee email — no calendar-availability fetch, no
 * next-intl / sonner. Reports through the dialer's `notify`.
 */
interface Props {
  api: RingeeApi;
  notify: (kind: "success" | "error", message: string) => void;
  contactId: string;
  callId?: string | null;
  onBooked: () => void;
  onCancel: () => void;
}

const DURATIONS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "1h" },
];

/** Default to the next round hour. */
function defaultLocalDateTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function BookMeetingForm({
  api,
  notify,
  contactId,
  callId,
  onBooked,
  onCancel,
}: Props) {
  const [when, setWhen] = useState<string>(defaultLocalDateTime());
  const [duration, setDuration] = useState(30);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const scheduledAt = new Date(when);
    if (Number.isNaN(scheduledAt.getTime())) {
      notify("error", "Pick a valid date and time.");
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      notify("error", "The meeting time must be in the future.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.bookMeeting({
        contactId,
        callId,
        scheduledAt: scheduledAt.toISOString(),
        duration,
        attendeeEmail: email.trim() || undefined,
      });
      notify("success", "Meeting booked");
      onBooked();
    } catch {
      notify("error", "Could not book the meeting.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <label className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
          When
        </label>
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="border-border/80 h-9 text-sm"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
          Duration
        </span>
        <div className="flex gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDuration(d.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                duration === d.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
          Attendee email (optional)
        </label>
        <Input
          type="email"
          placeholder="For the calendar invite"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="placeholder:text-muted-foreground/50 border-border/80 h-9 text-sm"
        />
      </div>

      <div className="mt-1 flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="flex-1"
          type="button"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
          type="button"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              Confirm
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
