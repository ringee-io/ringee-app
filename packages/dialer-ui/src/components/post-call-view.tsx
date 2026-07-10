"use client";

import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { useCallStore, type CallOutcome } from "@ringee/dialer-core/store";
import { useState } from "react";
import {
  CalendarCheck,
  ThumbsUp,
  Clock,
  ThumbsDown,
  PhoneMissed,
  Voicemail,
  PhoneOff,
  ShieldAlert,
  Loader2,
  DollarSign,
  Check,
  PhoneCall,
} from "lucide-react";
import { useDialer } from "../data/context";

const OUTCOMES: {
  id: CallOutcome;
  label: string;
  icon: React.ElementType;
  color: string;
  bgActive: string;
}[] = [
  {
    id: "meeting_booked",
    label: "Meeting Booked",
    icon: CalendarCheck,
    color: "text-emerald-500",
    bgActive:
      "bg-emerald-500/10 border-emerald-500 text-emerald-600 ring-1 ring-emerald-500/20",
  },
  {
    id: "sale",
    label: "Sale",
    icon: DollarSign,
    color: "text-green-500",
    bgActive:
      "bg-green-500/10 border-green-500 text-green-600 ring-1 ring-green-500/20",
  },
  {
    id: "interested",
    label: "Interested",
    icon: ThumbsUp,
    color: "text-blue-500",
    bgActive:
      "bg-blue-500/10 border-blue-500 text-blue-600 ring-1 ring-blue-500/20",
  },
  {
    id: "follow_up",
    label: "Follow Up",
    icon: Clock,
    color: "text-amber-500",
    bgActive:
      "bg-amber-500/10 border-amber-500 text-amber-600 ring-1 ring-amber-500/20",
  },
  {
    id: "callback_scheduled",
    label: "Schedule Callback",
    icon: PhoneCall,
    color: "text-amber-500",
    bgActive:
      "bg-amber-500/10 border-amber-500 text-amber-600 ring-1 ring-amber-500/20",
  },
  {
    id: "not_interested",
    label: "Not Interested",
    icon: ThumbsDown,
    color: "text-slate-400",
    bgActive:
      "bg-slate-500/10 border-slate-400 text-slate-500 ring-1 ring-slate-400/20",
  },
  {
    id: "no_answer",
    label: "No Answer",
    icon: PhoneMissed,
    color: "text-gray-400",
    bgActive:
      "bg-gray-500/10 border-gray-400 text-gray-500 ring-1 ring-gray-400/20",
  },
  {
    id: "voicemail",
    label: "Voicemail",
    icon: Voicemail,
    color: "text-purple-400",
    bgActive:
      "bg-purple-500/10 border-purple-400 text-purple-500 ring-1 ring-purple-400/20",
  },
  {
    id: "wrong_number",
    label: "Wrong Number",
    icon: PhoneOff,
    color: "text-red-400",
    bgActive:
      "bg-red-500/10 border-red-400 text-red-500 ring-1 ring-red-400/20",
  },
  {
    id: "gatekeeper",
    label: "Gatekeeper",
    icon: ShieldAlert,
    color: "text-orange-400",
    bgActive:
      "bg-orange-500/10 border-orange-400 text-orange-500 ring-1 ring-orange-400/20",
  },
];

interface PostCallViewProps {
  onClose: () => void;
}

export function PostCallView({ onClose }: PostCallViewProps) {
  const { data, slots, labels, notify } = useDialer();
  const {
    outcome,
    outcomeNote,
    meetingBooked,
    callbackScheduled,
    callDuration,
    callContactName,
    callContactId,
    callId,
    callSessionId,
    setOutcome,
    setOutcomeNote,
    setMeetingBooked,
    setCallbackScheduled,
  } = useCallStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showCallback, setShowCallback] = useState(false);

  const durationLabel = `${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, "0")}`;

  const handleSave = async () => {
    if (!outcome) return;
    setIsSaving(true);
    try {
      if (callId || callSessionId) {
        await data.saveCallOutcome({
          callId: callId || undefined,
          callSessionId: callSessionId || undefined,
          outcome,
          outcomeNote: outcomeNote || undefined,
        });
      }
      notify("success", "Call outcome saved");
      onClose();
    } catch {
      notify("error", "Failed to save outcome");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMeetingBooked = () => {
    setMeetingBooked(true);
    setShowBooking(false);
  };

  const handleCallbackScheduled = () => {
    setCallbackScheduled(true);
    setShowCallback(false);
  };

  const handleSkip = () => {
    // Closed without an outcome: still push the call to the CRM now so its note
    // doesn't wait out the hangup grace window. Best-effort — closing the
    // post-call view must never depend on the CRM call succeeding.
    if (callId) {
      void data.finalizeCall?.({ callId }).catch(() => undefined);
    }
    onClose();
  };

  const handleOutcomeClick = (id: CallOutcome) => {
    setOutcome(id);
    // Selecting `callback_scheduled` immediately opens the date/time picker.
    // Deselecting it (or picking something else) hides the form.
    if (id === "callback_scheduled") {
      if (!callbackScheduled && slots.renderScheduleCallback) {
        setShowCallback(true);
      }
    } else if (showCallback) {
      setShowCallback(false);
    }
  };

  const showBookingPrompt =
    !meetingBooked &&
    !showBooking &&
    !!slots.renderBookMeeting &&
    (outcome === "interested" || outcome === "follow_up" || outcome === "sale");

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="text-center">
        <div className="bg-muted/50 mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full">
          <Check className="h-5 w-5 text-emerald-500" />
        </div>
        <h3 className="text-base font-semibold tracking-tight">
          How did it go?
        </h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {callContactName || "Unknown"} &middot; {durationLabel}
        </p>
      </div>

      {/* Meeting booked badge */}
      {meetingBooked && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
          <CalendarCheck className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-emerald-600">
            Meeting booked during call
          </span>
        </div>
      )}

      {/* Callback scheduled badge */}
      {callbackScheduled && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <PhoneCall className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-600">
            {labels.callbackBadge}
          </span>
        </div>
      )}

      {/* Outcomes */}
      <div className="mb-2 flex flex-col gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Successful Outcomes
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {OUTCOMES.filter((o) => ["sale", "meeting_booked"].includes(o.id)).map(
            (o) => {
              const Icon = o.icon;
              const isSelected = outcome === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => handleOutcomeClick(o.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold transition-all duration-200 active:scale-95",
                    isSelected
                      ? cn(o.bgActive, "scale-[1.02] shadow-md")
                      : "border-border/60 bg-card hover:border-border hover:bg-muted/30 hover:shadow-sm",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-lg p-2 transition-colors",
                      isSelected ? "bg-background/50" : "bg-muted/50",
                    )}
                  >
                    <Icon
                      className={cn("h-5 w-5", isSelected ? "" : o.color)}
                    />
                  </div>
                  <span>{o.label}</span>
                </button>
              );
            },
          )}
        </div>

        <p className="text-muted-foreground mt-2 text-xs font-medium tracking-wider uppercase">
          Other Dispositions
        </p>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.filter(
            (o) => !["sale", "meeting_booked"].includes(o.id),
          ).map((o) => {
            const Icon = o.icon;
            const isSelected = outcome === o.id;
            return (
              <button
                key={o.id}
                onClick={() => handleOutcomeClick(o.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-all duration-200 active:scale-95",
                  isSelected
                    ? cn(o.bgActive, "shadow-sm")
                    : "border-border/50 bg-card hover:border-border hover:bg-muted/20",
                )}
              >
                <Icon
                  className={cn("mb-0.5 h-4 w-4", isSelected ? "" : o.color)}
                />
                <span className="text-center leading-tight">
                  {o.id === "callback_scheduled"
                    ? labels.callbackDisposition
                    : o.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Booking prompt */}
      {showBookingPrompt && (
        <button
          onClick={() => setShowBooking(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
        >
          <CalendarCheck className="h-4 w-4" />
          Book a meeting
        </button>
      )}

      {/* Inline booking form (host-provided) */}
      {showBooking &&
        callContactId &&
        slots.renderBookMeeting?.({
          contactId: callContactId,
          callId,
          onBooked: handleMeetingBooked,
          onCancel: () => setShowBooking(false),
        })}

      {/* Inline callback scheduling form (host-provided) */}
      {showCallback &&
        callContactId &&
        slots.renderScheduleCallback?.({
          contactId: callContactId,
          callId,
          onScheduled: handleCallbackScheduled,
          onCancel: () => setShowCallback(false),
        })}

      {/* Transcription (host-provided) */}
      {callId && slots.renderTranscribeButton && (
        <div className="flex justify-start">
          {slots.renderTranscribeButton({ callId, mode: "history" })}
        </div>
      )}

      {/* Note */}
      <Textarea
        placeholder="Add a quick note..."
        value={outcomeNote}
        onChange={(e) => setOutcomeNote(e.target.value)}
        className="min-h-[56px] resize-none text-sm"
        rows={2}
      />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSkip}
          className="text-muted-foreground hover:text-foreground flex-shrink-0 text-xs transition-colors"
        >
          Skip
        </button>
        <Button
          onClick={handleSave}
          disabled={
            !outcome ||
            isSaving ||
            (outcome === "callback_scheduled" && !callbackScheduled)
          }
          className="flex-1"
          size="sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            "Save & Close"
          )}
        </Button>
      </div>
    </div>
  );
}
