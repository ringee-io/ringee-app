"use client";

import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { useCallStore, type CallOutcome } from "@ringee/dialer-core/store";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ringee/frontend-shared/components/ui/popover";
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
import type { DialerDisposition } from "../data/types";

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
    id: "no_conversation",
    label: "No conversation",
    icon: PhoneOff,
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
  layout?: "workspace";
  pending?: boolean;
  onPendingChange?: (pending: boolean) => boolean | void;
  onBookingPendingChange?: (pending: boolean) => boolean | void;
  canClose?: () => boolean;
  actionsContainer?: HTMLElement | null;
}

export function PostCallView({
  onClose,
  layout,
  pending = false,
  onPendingChange,
  onBookingPendingChange,
  canClose,
  actionsContainer,
}: PostCallViewProps) {
  const { data, slots, labels, notify } = useDialer();
  const copy = labels.workspace;
  const submitting = useRef(false);
  const [saveError, setSaveError] = useState(false);
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
    callPhoneNumber,
    setOutcome,
    setOutcomeNote,
    setMeetingBooked,
    setCallbackScheduled,
  } = useCallStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showCallback, setShowCallback] = useState(false);
  const [showVoicemail, setShowVoicemail] = useState(false);
  const [voicemailSent, setVoicemailSent] = useState(false);
  // The workspace's dispositions: null while they load, empty when the host
  // has none — then the built-in outcome buttons are the choice, as before.
  const [dispositions, setDispositions] = useState<DialerDisposition[] | null>(
    data.listDispositions ? null : [],
  );
  const [dispositionId, setDispositionId] = useState<string | null>(null);

  useEffect(() => {
    if (!data.listDispositions) return;
    let cancelled = false;
    data
      .listDispositions()
      .then((rows) => !cancelled && setDispositions(rows))
      .catch(() => !cancelled && setDispositions([]));
    return () => {
      cancelled = true;
    };
  }, [data]);

  const hasDispositions = !!dispositions && dispositions.length > 0;

  // The pick follows the outcome when something else sets it — a meeting
  // booked or a callback scheduled — onto the first disposition that means it.
  // With none, the outcome is saved on its own, as it always was.
  useEffect(() => {
    if (!hasDispositions || !outcome) return;
    const picked = dispositions!.find((d) => d.id === dispositionId);
    if (picked?.canonicalOutcome === outcome) return;
    setDispositionId(
      dispositions!.find((d) => d.canonicalOutcome === outcome)?.id ?? null,
    );
  }, [outcome, dispositions, hasDispositions, dispositionId]);

  // The callback form needs a contact to schedule against. Without one (an
  // unknown number) or without the host's form, the callback outcome is saved
  // on its own — it must never leave Save & Close disabled with nothing to do.
  const canScheduleCallback = !!callContactId && !!slots.renderScheduleCallback;

  const durationLabel = `${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, "0")}`;

  const handleSave = async () => {
    if (!outcome || submitting.current || pending) return;
    if (onPendingChange?.(true) === false) return;
    submitting.current = true;
    setIsSaving(true);
    setSaveError(false);
    try {
      let acceptance: Awaited<ReturnType<typeof data.saveCallOutcome>> =
        undefined;
      if (callId || callSessionId) {
        acceptance = await data.saveCallOutcome({
          callId: callId || undefined,
          callSessionId: callSessionId || undefined,
          outcome,
          outcomeNote: outcomeNote || undefined,
          dispositionId: dispositionId ?? undefined,
        });
      }
      const followUp = acceptance?.followUp;
      if (followUp) {
        const blocked = followUp.state === "blocked";
        const active = [
          "scheduled",
          "recovering",
          "waiting",
          "in_progress",
        ].includes(followUp.state);
        const next = followUp.nextActionAt
          ? `${followUp.timingBasis === "agreed" ? labels.followUpAgreedTime : labels.followUpPolicyTime}: ${new Date(followUp.nextActionAt).toLocaleString()}`
          : (followUp.reason ?? "").replace(/_/g, " ");
        notify(
          blocked ? "error" : "success",
          `Call outcome saved. ${blocked ? labels.followUpBlocked : active ? labels.followUpAccepted : labels.followUpStopped}. ${followUp.objective}. ${next}`,
        );
      } else notify("success", "Call outcome saved");
      if (canClose?.() !== false) onClose();
    } catch {
      setSaveError(true);
      notify("error", copy.saveFailed);
    } finally {
      submitting.current = false;
      onPendingChange?.(false);
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

  const handleSkip = async () => {
    if (submitting.current || pending) return;
    if (onPendingChange?.(true) === false) return;
    submitting.current = true;
    setIsSaving(true);
    setSaveError(false);
    try {
      if (callId || callSessionId) {
        await data.saveCallOutcome({
          callId: callId || undefined,
          callSessionId: callSessionId || undefined,
          outcomeNote: outcomeNote || undefined,
        });
      }
      if (canClose?.() !== false) onClose();
    } catch {
      setSaveError(true);
      notify("error", copy.saveFailed);
    } finally {
      submitting.current = false;
      onPendingChange?.(false);
      setIsSaving(false);
    }
  };

  const handleVoicemailSent = () => {
    setVoicemailSent(true);
    setShowVoicemail(false);
    notify("success", "Voicemail on its way");
  };

  const handleDispositionClick = (disposition: DialerDisposition) => {
    setDispositionId(disposition.id);
    handleOutcomeClick(disposition.canonicalOutcome);
  };

  const handleOutcomeClick = (id: CallOutcome) => {
    setOutcome(id);
    // Selecting `callback_scheduled` immediately opens the date/time picker.
    // Deselecting it (or picking something else) hides the form.
    if (id === "callback_scheduled") {
      if (!callbackScheduled && canScheduleCallback) {
        setShowCallback(true);
      }
    } else if (showCallback) {
      setShowCallback(false);
    }
  };

  // Always on offer during wrap-up, matching the campaign and session dialers
  // — the call is over, so a drop is just as valid after "interested" as
  // after "no answer".
  const showVoicemailPrompt =
    !voicemailSent &&
    (layout === "workspace" || !showVoicemail) &&
    !!slots.renderVoicemailDrop &&
    !!callPhoneNumber;

  const showBookingPrompt =
    !meetingBooked &&
    !showBooking &&
    !!slots.renderBookMeeting &&
    (outcome === "interested" || outcome === "follow_up" || outcome === "sale");

  const actions = (
    <>
      {saveError && (
        <p role="alert" className="text-destructive max-w-80 text-xs">
          {copy.saveFailed}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={handleSkip}
        disabled={isSaving || pending}
        className="h-11 cursor-pointer"
      >
        {copy.skip}
      </Button>
      <Button
        type="button"
        onClick={handleSave}
        disabled={
          !outcome ||
          isSaving ||
          pending ||
          (outcome === "callback_scheduled" &&
            canScheduleCallback &&
            !callbackScheduled)
        }
        className="h-11 cursor-pointer bg-emerald-600 px-5 text-white hover:bg-emerald-700"
      >
        {isSaving && (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        )}
        {isSaving ? labels.followUpPreparing : copy.save}
      </Button>
    </>
  );

  if (layout === "workspace") {
    const choices = hasDispositions
      ? dispositions!.map((item) => ({
          id: item.id,
          label: item.label,
          outcome: item.canonicalOutcome,
        }))
      : OUTCOMES.map((item) => ({
          id: item.id,
          label: copy[item.id],
          outcome: item.id,
        }));
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{copy.selectOutcome}</h3>
          <div className="flex items-center gap-3 text-xs">
            {meetingBooked && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CalendarCheck className="size-3.5" />
                {copy.meetingBooked}
              </span>
            )}
            {callbackScheduled && (
              <span className="text-amber-600 dark:text-amber-400">
                {labels.callbackBadge}
              </span>
            )}
            {callId &&
              slots.renderTranscribeButton?.({ callId, mode: "history" })}
            {showVoicemailPrompt && (
              <Popover open={showVoicemail} onOpenChange={setShowVoicemail}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 cursor-pointer text-xs"
                  >
                    <Voicemail className="size-4" />
                    {copy.sendVoicemail}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="max-h-[70dvh] w-80 overflow-y-auto"
                >
                  {callPhoneNumber &&
                    slots.renderVoicemailDrop?.({
                      phoneNumber: callPhoneNumber,
                      contactId: callContactId,
                      callId,
                      onSent: handleVoicemailSent,
                      onCancel: () => setShowVoicemail(false),
                    })}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6"
          aria-busy={dispositions === null}
        >
          {dispositions === null
            ? [0, 1, 2, 3, 4, 5].map((key) => (
                <div
                  key={key}
                  className="bg-muted h-11 animate-pulse rounded-md motion-reduce:animate-none"
                />
              ))
            : choices.map((choice) => {
                const selected = hasDispositions
                  ? dispositionId === choice.id
                  : outcome === choice.outcome;
                const Icon = OUTCOMES.find(
                  (item) => item.id === choice.outcome,
                )?.icon;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={isSaving || pending}
                    onClick={() => {
                      if (hasDispositions) setDispositionId(choice.id);
                      handleOutcomeClick(choice.outcome);
                    }}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500 dark:text-emerald-400"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {Icon && (
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">{choice.label}</span>
                    {selected && <Check className="size-3.5 shrink-0" />}
                  </button>
                );
              })}
        </div>
        {showCallback && callContactId && (
          <div className="max-w-2xl rounded-lg border p-3">
            {slots.renderScheduleCallback?.({
              contactId: callContactId,
              callId,
              onScheduled: handleCallbackScheduled,
              onCancel: () => setShowCallback(false),
            })}
          </div>
        )}
        {actionsContainer ? (
          createPortal(actions, actionsContainer)
        ) : (
          <div className="flex justify-end gap-2">{actions}</div>
        )}
      </div>
    );
  }

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

      {/* Voicemail sent badge */}
      {voicemailSent && (
        <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2.5">
          <Voicemail className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium text-purple-600">
            Voicemail sent
          </span>
        </div>
      )}

      {/* Dispositions — the workspace's own, each meaning one outcome */}
      {dispositions === null ? (
        <div className="mb-2 grid grid-cols-2 gap-2" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-muted/60 h-11 animate-pulse rounded-lg"
            />
          ))}
        </div>
      ) : hasDispositions ? (
        <div className="mb-2 grid grid-cols-2 gap-2">
          {dispositions.map((d) => {
            const isSelected = dispositionId === d.id;
            const color = d.color ?? undefined;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleDispositionClick(d)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all duration-200 active:scale-95",
                  isSelected
                    ? "border-foreground/40 bg-muted/40 shadow-sm"
                    : "border-border/60 bg-card hover:border-border hover:bg-muted/30",
                )}
                style={
                  isSelected && color
                    ? {
                        borderColor: color,
                        backgroundColor: `${color}1A`,
                        boxShadow: `0 0 0 1px ${color}40`,
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    !color && "border-muted-foreground/50 border",
                  )}
                  style={color ? { backgroundColor: color } : undefined}
                />
                <span className="min-w-0 flex-1 leading-tight">{d.label}</span>
                {isSelected ? (
                  <Check
                    className="h-4 w-4 shrink-0"
                    style={color ? { color } : undefined}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        /* Outcomes — the built-in buttons, for a host without dispositions */
        <div className="mb-2 flex flex-col gap-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Successful Outcomes
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {OUTCOMES.filter((o) =>
              ["sale", "meeting_booked"].includes(o.id),
            ).map((o) => {
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
            })}
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
      )}

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
          disabled: isSaving,
          onPendingChange: (active) => {
            if (active && submitting.current) return false;
            return onBookingPendingChange?.(active);
          },
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

      {/* Voicemail drop prompt */}
      {showVoicemailPrompt && (
        <button
          onClick={() => setShowVoicemail(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-purple-500/30 bg-purple-500/5 px-3 py-2.5 text-sm font-medium text-purple-600 transition-colors hover:border-purple-500/50 hover:bg-purple-500/10"
        >
          <Voicemail className="h-4 w-4" />
          Send a voicemail
        </button>
      )}

      {/* Inline voicemail picker/recorder (host-provided) */}
      {showVoicemail &&
        callPhoneNumber &&
        slots.renderVoicemailDrop?.({
          phoneNumber: callPhoneNumber,
          contactId: callContactId,
          callId,
          onSent: handleVoicemailSent,
          onCancel: () => setShowVoicemail(false),
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
        readOnly={isSaving}
        onChange={(e) => setOutcomeNote(e.target.value)}
        className="min-h-[56px] resize-none text-sm"
        rows={2}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {actions}
      </div>
    </div>
  );
}
