"use client";

import {
  Dialog,
  DialogContent,
} from "@ringee/frontend-shared/components/ui/dialog";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import {
  Avatar,
  AvatarFallback,
} from "@ringee/frontend-shared/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ringee/frontend-shared/components/ui/tooltip";
import { cn } from "@ringee/frontend-shared/lib/utils";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  PhoneOff,
  Radio,
  CalendarPlus,
  Circle,
  Disc as RecordIcon,
  Disc3 as RecordingPulse,
  Loader2,
  Clock,
  X,
  Captions,
  CaptionsOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
// Subpath imports keep the Telnyx engine out of the side-panel / web bundles —
// only the offscreen document ever pulls in @ringee/dialer-core/engine.
import { useCallStore } from "@ringee/dialer-core/store";
import { playDtmfTone, DTMF_KEYS } from "@ringee/dialer-core/dtmf";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ringee/frontend-shared/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ringee/frontend-shared/components/ui/tabs";
import { IconKeyboard } from "@tabler/icons-react";
import { PostCallView } from "./post-call-view";
import { useDialer } from "../data/context";

export type ActiveCallModalProps = {
  open: boolean;
  onClose: () => void;

  number: string;
  contactName?: string;
  statusText?: string;

  /**
   * Authoritative "the far end answered" signal, derived from the real Telnyx
   * call state (`state === "active"`) by the host. When provided it gates both
   * the connected visuals AND — critically — when the remote media stream is
   * attached. Attaching `remoteStream` while the call is still *ringing* plays
   * the carrier's early-media ringback on top of the SDK's local `ringbackFile`,
   * so the caller hears the ring tone twice. Only playing it once truly
   * connected keeps a single audio source through ringing → answer.
   * Falls back to the elapsed-time heuristic when omitted (e.g. the extension,
   * which plays remote audio out-of-band and passes `remoteStream={null}`).
   */
  isConnected?: boolean;

  isMuted?: boolean;
  isOnHold?: boolean;
  isRecording?: boolean;
  isRecordingLoading?: boolean;

  isFreeTrialCall?: boolean;
  freeTrialRemainingSeconds?: number;
  freeTrialTotalSeconds?: number;

  onHangup: () => void;
  onToggleMute: () => Promise<void>;
  onToggleHold: () => Promise<void>;
  onToggleRecording: () => Promise<void>;

  remoteStream?: MediaStream | null;
  onSendDTMF?: (digit: string) => void;

  isPostCall?: boolean;
  onPostCallClose: () => void;

  contactId?: string | null;
  callId?: string | null;

  /**
   * Render the active-call view lean: no right-hand intelligence panel (history,
   * contact info, in-call booking), so the modal stays single-column and small.
   * The browser extension's side panel uses this — the post-call view (outcome,
   * notes, callback/meeting forms) is unaffected and still shows.
   */
  compact?: boolean;
};

export function ActiveCallModal({
  open,
  onClose,
  number,
  contactName,
  statusText = "Connecting...",
  isConnected: isConnectedProp,
  isMuted = false,
  isOnHold = false,
  isRecording = false,
  isRecordingLoading = false,
  onHangup,
  onToggleMute,
  onToggleHold,
  onToggleRecording,
  isFreeTrialCall = false,
  freeTrialRemainingSeconds = 60,
  freeTrialTotalSeconds = 60,
  remoteStream,
  onSendDTMF,
  isPostCall = false,
  onPostCallClose,
  contactId,
  callId,
  compact = false,
}: ActiveCallModalProps) {
  const { slots, recordingSettings } = useDialer();
  const [elapsed, setElapsed] = useState(0);
  const [dtmfDigits, setDtmfDigits] = useState<string[]>([]);
  const {
    bookingPanelOpen,
    setBookingPanelOpen,
    meetingBooked,
    setMeetingBooked,
  } = useCallStore();
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "activities" | "booking" | "script" | "contact" | "transcript"
  >("activities");

  // The rich right-panel tabs only exist when the host provides their slots.
  // This is what makes the same modal render full in the web app and compact
  // in the extension — no second component.
  const hasActivities = !!slots.renderContactActivities && !!contactId;
  const hasContactInfo = !!slots.renderContactInfo && !!contactId;
  const hasScript = !!slots.renderScript && !!contactId;
  const hasTranscript = !!slots.renderLiveTranscriptPanel && !!contactId;
  const hasBooking = !!slots.renderBookMeeting && !!contactId;
  const hasContactPanel =
    hasActivities || hasContactInfo || hasScript || hasTranscript || hasBooking;
  // `compact` (extension side panel) keeps the active call single-column — the
  // right-hand panel and in-call booking only belong to the full web modal.
  const showRightPanel =
    !compact && (hasContactPanel || (bookingPanelOpen && hasBooking));

  useEffect(() => {
    if (bookingPanelOpen && hasBooking) setActiveTab("booking");
  }, [bookingPanelOpen, hasBooking]);

  const handlePressDTMF = (digit: string) => {
    playDtmfTone(digit);
    onSendDTMF?.(digit);
    setDtmfDigits((prev) => [...prev, digit]);
  };

  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [elapsed]);

  const trialLabel = useMemo(() => {
    const m = Math.floor(freeTrialRemainingSeconds / 60);
    const s = freeTrialRemainingSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [freeTrialRemainingSeconds]);

  const trialProgress =
    freeTrialTotalSeconds > 0
      ? ((freeTrialTotalSeconds - freeTrialRemainingSeconds) /
          freeTrialTotalSeconds) *
        100
      : 0;

  // --- POST-CALL VIEW ---
  if (isPostCall) {
    return (
      <Dialog modal={false} open={open} onOpenChange={() => {}}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            "w-[95vw] max-w-[480px]",
            "flex flex-col rounded-2xl p-5",
            "bg-background",
            "border-border/60 overflow-hidden border shadow-xl",
          )}
        >
          <PostCallView onClose={onPostCallClose} />
        </DialogContent>
      </Dialog>
    );
  }

  // --- ACTIVE CALL VIEW ---
  // Prefer the host's real call-state signal; the elapsed-time heuristic is a
  // fallback only. This is what stops the remote early-media stream from being
  // attached during ringing (which doubled the ring tone against ringbackFile).
  const isConnected =
    isConnectedProp ?? (statusText === "Connected" || elapsed > 0);
  const wide = showRightPanel;

  return (
    <Dialog modal={false} open={open} onOpenChange={onClose}>
      {slots.renderTranscriptDialog?.({
        open: transcriptDialogOpen,
        onOpenChange: setTranscriptDialogOpen,
        callId,
      })}
      {slots.renderSubtitles?.({
        callId,
        show: open && !isPostCall && showSubtitles,
      })}
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={cn(
          "border-border/20 bg-background flex w-[95vw] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl",
          wide
            ? "h-[90vh] min-h-[600px] !max-w-5xl md:h-[85vh]"
            : "min-h-[500px] !max-w-md",
          "transition-all duration-500 ease-in-out",
        )}
      >
        {/* Free trial banner */}
        {isFreeTrialCall && (
          <div className="relative shrink-0 overflow-hidden border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-[10px] font-bold tracking-wider text-amber-700 uppercase sm:text-xs">
                  Free Trial &middot; 1 min limit
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-[10px] font-bold tabular-nums sm:text-xs",
                  freeTrialRemainingSeconds <= 10
                    ? "animate-pulse text-red-600"
                    : "text-amber-700",
                )}
              >
                {trialLabel}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-amber-500/20">
              <div
                className={cn(
                  "h-full transition-all duration-1000 ease-linear",
                  freeTrialRemainingSeconds <= 10
                    ? "bg-red-500"
                    : "bg-amber-500",
                )}
                style={{ width: `${trialProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative flex h-full w-full flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* LEFT PANEL: The Call Engine */}
          <div
            className={cn(
              "relative flex shrink-0 flex-col items-center justify-between pt-6 pb-6 transition-all duration-500 md:pt-10 md:pb-8",
              wide
                ? "border-border/20 bg-muted/5 min-h-[500px] w-full border-b md:min-h-0 md:w-[45%] md:border-r md:border-b-0"
                : "min-h-[500px] w-full",
            )}
          >
            {/* Background decorative glow */}
            <div
              className={cn(
                "pointer-events-none absolute top-0 right-0 left-0 -z-10 h-48 bg-gradient-to-b to-transparent opacity-20 transition-colors duration-1000 md:h-64",
                isConnected ? "from-emerald-500/40" : "from-primary/30",
              )}
            />

            {/* Caller ID Section */}
            <div className="z-10 flex w-full shrink-0 flex-col items-center px-6 md:px-8">
              <div className="relative">
                <Avatar
                  className={cn(
                    "border-background border-4 shadow-xl transition-all duration-700",
                    wide
                      ? "h-20 w-20 md:h-24 md:w-24"
                      : "h-28 w-28 md:h-32 md:w-32",
                    isConnected
                      ? "ring-4 shadow-emerald-500/20 ring-emerald-500/20"
                      : "ring-border/20 ring-4",
                  )}
                >
                  <AvatarFallback className="from-primary/20 to-primary/5 text-primary bg-gradient-to-br text-3xl font-light md:text-4xl">
                    {contactName?.charAt(0) ??
                      number?.replace("+", "").charAt(0) ??
                      "R"}
                  </AvatarFallback>
                </Avatar>
                {/* Recording Indicator */}
                {isRecording && (
                  <div className="border-background absolute -right-1 -bottom-1 animate-pulse rounded-full border-2 bg-rose-500 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-white uppercase shadow-lg md:px-2 md:text-[9px]">
                    REC
                  </div>
                )}
              </div>

              <h2
                className={cn(
                  "text-foreground line-clamp-1 text-center font-bold tracking-tight transition-all",
                  wide
                    ? "mt-3 text-lg md:mt-4 md:text-xl"
                    : "mt-4 text-2xl md:mt-6 md:text-3xl",
                )}
              >
                {contactName || number}
              </h2>

              <div className="mt-2 flex items-center justify-center gap-1.5 md:gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full md:h-2 md:w-2",
                    isRecording
                      ? "animate-pulse bg-rose-500"
                      : isConnected
                        ? "animate-pulse bg-emerald-500"
                        : "bg-primary/60",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide uppercase md:text-sm",
                    isRecording
                      ? "text-rose-500"
                      : isConnected
                        ? "text-emerald-600"
                        : "text-muted-foreground",
                  )}
                >
                  {meetingBooked
                    ? "MEETING BOOKED"
                    : isRecording
                      ? "RECORDING"
                      : statusText}
                </span>
              </div>

              <div
                className={cn(
                  "font-mono font-light tracking-tighter tabular-nums opacity-80 transition-all",
                  wide
                    ? "mt-2 text-2xl md:mt-3 md:text-3xl"
                    : "mt-3 text-4xl md:mt-5 md:text-5xl",
                )}
              >
                {elapsedLabel}
              </div>
            </div>

            {/* Visualizer / Center Space */}
            <div className="relative z-10 flex min-h-[80px] w-full flex-1 items-center justify-center md:min-h-[100px]">
              {isConnected ? (
                <div className="relative flex h-12 w-24 items-center justify-center gap-1 md:h-16 md:w-32 md:gap-1.5">
                  {remoteStream && (
                    <audio
                      autoPlay
                      playsInline
                      className="hidden"
                      ref={(el) => {
                        if (el && remoteStream) el.srcObject = remoteStream;
                      }}
                    />
                  )}
                  {/* Fake waveform bars */}
                  {[0.8, 0.4, 1, 0.6, 0.9, 0.5, 0.7].map((height, i) => (
                    <div
                      key={i}
                      className="w-1 animate-pulse rounded-full bg-emerald-500/40 md:w-1.5"
                      style={{
                        height: `${height * 100}%`,
                        animationDuration: `${0.5 + i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Radio className="text-primary/20 h-8 w-8 animate-pulse md:h-12 md:w-12" />
              )}
            </div>

            {/* Controls Section */}
            <div className="z-10 flex w-full shrink-0 flex-col items-center px-4 md:px-6">
              <div className="bg-background/80 border-border/50 mb-4 flex items-center justify-center gap-1 rounded border p-1.5 shadow-sm backdrop-blur-xl md:mb-6 md:gap-1.5 md:p-2">
                {/* Mute */}
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleMute}
                        className={cn(
                          "h-12 w-12 rounded transition-all md:h-14 md:w-14",
                          isMuted
                            ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
                            : "hover:bg-muted/50",
                        )}
                      >
                        {isMuted ? (
                          <MicOff className="h-5 w-5 md:h-6 md:w-6" />
                        ) : (
                          <Mic className="h-5 w-5 md:h-6 md:w-6" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mute</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Keypad */}
                <Popover>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="hover:bg-muted/50 h-12 w-12 rounded transition-all md:h-14 md:w-14"
                          >
                            <IconKeyboard className="text-foreground/80 h-5 w-5 md:h-6 md:w-6" />
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Keypad</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <PopoverContent
                    side="top"
                    align="center"
                    className="w-64 rounded p-4 shadow-xl"
                  >
                    <div className="grid grid-cols-3 gap-2">
                      {DTMF_KEYS.map((d) => (
                        <button
                          key={d}
                          onClick={() => handlePressDTMF(d)}
                          className="bg-muted/40 hover:bg-primary hover:text-primary-foreground flex h-12 items-center justify-center rounded text-xl font-medium transition-all active:scale-90 md:h-14"
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    {dtmfDigits.length > 0 && (
                      <div className="text-primary bg-primary/10 mt-3 rounded py-1.5 text-center font-mono text-sm font-semibold tracking-widest">
                        {dtmfDigits.join(" ")}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Hold */}
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleHold}
                        className={cn(
                          "h-12 w-12 rounded transition-all md:h-14 md:w-14",
                          isOnHold
                            ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
                            : "hover:bg-muted/50",
                        )}
                      >
                        {isOnHold ? (
                          <Play className="h-5 w-5 md:h-6 md:w-6" />
                        ) : (
                          <Pause className="text-foreground/80 h-5 w-5 md:h-6 md:w-6" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isOnHold ? "Resume" : "Hold"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Record */}
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={onToggleRecording}
                          disabled={recordingSettings.recordAllCalls}
                          className={cn(
                            "h-12 w-12 rounded transition-all md:h-14 md:w-14",
                            isRecording
                              ? "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                              : "hover:bg-muted/50",
                          )}
                        >
                          {isRecordingLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin md:h-6 md:w-6" />
                          ) : isRecording ? (
                            <RecordingPulse className="h-5 w-5 animate-pulse md:h-6 md:w-6" />
                          ) : (
                            <RecordIcon className="text-foreground/80 h-5 w-5 md:h-6 md:w-6" />
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {recordingSettings.recordAllCalls
                        ? "Auto-recording is on for all calls"
                        : isRecording
                          ? "Stop Recording"
                          : "Record"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Transcribe (host-provided) */}
                {slots.renderTranscribeButton?.({
                  callId,
                  mode: "active",
                  onView: () => setTranscriptDialogOpen(true),
                })}

                {/* Subtitles toggle */}
                {slots.renderSubtitles && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowSubtitles((prev) => !prev)}
                          className={cn(
                            "h-12 w-12 rounded transition-all md:h-14 md:w-14",
                            showSubtitles
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "hover:bg-muted/50",
                          )}
                        >
                          {showSubtitles ? (
                            <Captions className="h-5 w-5 md:h-6 md:w-6" />
                          ) : (
                            <CaptionsOff className="text-foreground/80 h-5 w-5 md:h-6 md:w-6" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {showSubtitles ? "Hide subtitles" : "Show subtitles"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Book Meeting (If no right panel and booking is supported) */}
                {!compact && !showRightPanel && hasBooking && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setBookingPanelOpen(true)}
                          className="h-12 w-12 rounded text-emerald-600 transition-all hover:bg-emerald-500/10 md:h-14 md:w-14"
                        >
                          <CalendarPlus className="h-5 w-5 md:h-6 md:w-6" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Book Meeting</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {/* Secure via */}
              <div className="text-muted-foreground mb-3 flex items-center justify-center gap-1.5 text-[9px] font-medium tracking-widest uppercase opacity-60 md:mb-4 md:text-[10px]">
                <Circle
                  className={cn(
                    "h-1.5 w-1.5",
                    isRecording ? "text-rose-500" : "text-emerald-500",
                  )}
                />
                Secure via{" "}
                <span className="text-emerald-500">Ringee Voice</span>
              </div>

              <Button
                size="sm"
                onClick={onHangup}
                className="h-14 w-full max-w-[280px] gap-2 rounded-xl bg-rose-500 text-base font-bold text-white shadow-xl shadow-rose-500/20 transition-all hover:scale-[1.02] hover:bg-rose-600 active:scale-95 md:h-16 md:max-w-[320px] md:gap-3 md:text-lg"
              >
                <PhoneOff className="h-5 w-5 md:h-6 md:w-6" />
                END CALL
              </Button>
            </div>
          </div>

          {/* RIGHT PANEL: Intelligence (host-provided panels) */}
          {showRightPanel && (
            <div className="bg-background border-border/10 z-20 flex h-[500px] w-full shrink-0 flex-col border-l md:h-full md:w-[55%]">
              {/* Header area */}
              <div className="border-border/10 flex shrink-0 items-center justify-between border-b px-4 py-3 md:px-6 md:py-4">
                {hasContactPanel ? (
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as typeof activeTab)}
                    className="w-full"
                  >
                    <TabsList className="flex h-auto flex-wrap items-center justify-start gap-1.5 border-none bg-transparent p-0">
                      {hasActivities && (
                        <TabsTrigger
                          value="activities"
                          className="data-[state=active]:border-border/30 data-[state=active]:bg-foreground/5 text-muted-foreground data-[state=active]:text-foreground rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-normal shadow-none transition-all md:text-sm"
                        >
                          History
                        </TabsTrigger>
                      )}
                      {hasContactInfo && (
                        <TabsTrigger
                          value="contact"
                          className="data-[state=active]:border-border/30 data-[state=active]:bg-foreground/5 text-muted-foreground data-[state=active]:text-foreground rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-normal shadow-none transition-all md:text-sm"
                        >
                          Contact Info
                        </TabsTrigger>
                      )}
                      {hasScript && (
                        <TabsTrigger
                          value="script"
                          className="data-[state=active]:border-border/30 data-[state=active]:bg-foreground/5 text-muted-foreground data-[state=active]:text-foreground rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-normal shadow-none transition-all md:text-sm"
                        >
                          Guion
                        </TabsTrigger>
                      )}
                      {hasTranscript && (
                        <TabsTrigger
                          value="transcript"
                          className="data-[state=active]:border-border/30 data-[state=active]:bg-foreground/5 text-muted-foreground data-[state=active]:text-foreground rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-normal shadow-none transition-all md:text-sm"
                        >
                          Transcript
                        </TabsTrigger>
                      )}
                      {hasBooking && (
                        <TabsTrigger
                          value="booking"
                          className="data-[state=active]:border-border/30 data-[state=active]:bg-foreground/5 text-muted-foreground data-[state=active]:text-foreground rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-normal shadow-none transition-all md:text-sm"
                        >
                          Book Meeting
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </Tabs>
                ) : (
                  <h3 className="text-foreground text-base font-bold md:text-lg">
                    Book Meeting
                  </h3>
                )}

                {bookingPanelOpen && !hasContactPanel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setBookingPanelOpen(false)}
                    className="hover:bg-foreground/5 hover:border-border/20 text-muted-foreground hover:text-foreground h-8 w-8 rounded-xl border border-transparent bg-transparent md:h-10 md:w-10"
                  >
                    <X className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                )}
              </div>

              {/* Content area */}
              <div className="w-full flex-1 overflow-hidden">
                {hasContactPanel && contactId ? (
                  <Tabs
                    value={activeTab}
                    className="flex h-full w-full flex-col"
                  >
                    {hasActivities && (
                      <TabsContent
                        value="activities"
                        className="m-0 h-full flex-1 overflow-y-auto p-4 focus:outline-none data-[state=inactive]:hidden md:p-6"
                      >
                        {slots.renderContactActivities?.({ contactId })}
                      </TabsContent>
                    )}
                    {hasContactInfo && (
                      <TabsContent
                        value="contact"
                        className="m-0 h-full flex-1 focus:outline-none data-[state=inactive]:hidden"
                      >
                        {slots.renderContactInfo?.({ contactId })}
                      </TabsContent>
                    )}
                    {hasScript && (
                      <TabsContent
                        value="script"
                        className="m-0 h-full flex-1 focus:outline-none data-[state=inactive]:hidden"
                      >
                        {slots.renderScript?.()}
                      </TabsContent>
                    )}
                    {hasTranscript && (
                      <TabsContent
                        value="transcript"
                        className="m-0 h-full flex-1 overflow-y-auto p-4 focus:outline-none data-[state=inactive]:hidden md:p-6"
                      >
                        {slots.renderLiveTranscriptPanel?.({ callId })}
                      </TabsContent>
                    )}
                    {hasBooking && (
                      <TabsContent
                        value="booking"
                        className="m-0 h-full flex-1 overflow-y-auto p-4 focus:outline-none data-[state=inactive]:hidden md:p-6"
                      >
                        {slots.renderBookMeeting?.({
                          contactId,
                          callId,
                          onBooked: () => {
                            setMeetingBooked(true);
                            setActiveTab("activities");
                            setBookingPanelOpen(false);
                          },
                          onCancel: () => {
                            setActiveTab("activities");
                            setBookingPanelOpen(false);
                          },
                        })}
                      </TabsContent>
                    )}
                  </Tabs>
                ) : (
                  <div className="bg-muted/10 flex h-full flex-col items-center justify-center p-6 text-center md:p-8">
                    <div className="bg-background border-border/50 mb-3 rounded-xl border p-3 shadow-sm md:mb-4 md:p-4">
                      <CalendarPlus className="h-6 w-6 text-emerald-500/80 md:h-8 md:w-8" />
                    </div>
                    <h4 className="mb-1 text-base font-bold md:mb-2 md:text-lg">
                      No contact linked
                    </h4>
                    <p className="text-muted-foreground max-w-[250px] text-xs md:text-sm">
                      Save the contact first to book meetings or view dial
                      history.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
