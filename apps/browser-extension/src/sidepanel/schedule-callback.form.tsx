import { useState } from "react";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Input } from "@ringee/frontend-shared/components/ui/input";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { Loader2, PhoneCall } from "lucide-react";
import type { RingeeApi } from "../lib/ringee-api";

/**
 * Lean callback scheduler for the side panel's post-call view. Same backend
 * endpoint as the web app (POST /callbacks) but no next-intl / sonner — it talks
 * to the extension's RingeeApi and reports through the dialer's `notify`.
 */
interface Props {
  api: RingeeApi;
  notify: (kind: "success" | "error", message: string) => void;
  contactId: string;
  callId?: string | null;
  onScheduled: () => void;
  onCancel: () => void;
}

/** Default to ~30 min from now, rounded up to the next 15-min slot. */
function defaultLocalDateTime(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setSeconds(0, 0);
  const bump = (15 - (d.getMinutes() % 15)) % 15;
  d.setMinutes(d.getMinutes() + bump);
  // Format as the `datetime-local` input expects (local time, no timezone).
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ScheduleCallbackForm({
  api,
  notify,
  contactId,
  callId,
  onScheduled,
  onCancel,
}: Props) {
  const [when, setWhen] = useState<string>(defaultLocalDateTime());
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const scheduledAt = new Date(when);
    if (Number.isNaN(scheduledAt.getTime())) {
      notify("error", "Pick a valid date and time.");
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      notify("error", "The callback time must be in the future.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.scheduleCallback({
        contactId,
        callId,
        scheduledAt: scheduledAt.toISOString(),
        note: note.trim() || undefined,
      });
      notify("success", "Callback scheduled");
      onScheduled();
    } catch {
      notify("error", "Could not schedule the callback.");
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

      <div className="space-y-1.5">
        <label className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
          Note
        </label>
        <Textarea
          placeholder="What's this callback about?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="min-h-[48px] resize-none text-sm"
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
          className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
          type="button"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
              Confirm
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
