"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ringee/frontend-shared/components/ui/dialog";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import {
  Avatar,
  AvatarFallback,
} from "@ringee/frontend-shared/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ringee/frontend-shared/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@ringee/frontend-shared/components/ui/resizable";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { cn } from "@ringee/frontend-shared/lib/utils";
import {
  CalendarCheck,
  CalendarDays,
  Captions,
  CaptionsOff,
  Check,
  Clock,
  Disc,
  FileText,
  Headphones,
  History,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  UserRound,
} from "lucide-react";
// Keep the provider engine out of the extension's side-panel bundle.
import { useCallStore } from "@ringee/dialer-core/store";
import { PostCallView } from "./post-call-view";
import { DtmfKeypad } from "./dtmf-keypad";
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
   * Render the active-call view lean, without the three-panel workspace, so
   * the modal stays single-column and small.
   * The browser extension's side panel uses this — the post-call view (outcome,
   * notes, callback/meeting forms) is unaffected and still shows.
   */
  compact?: boolean;
};

export function ActiveCallModal({
  open,
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
  const { data, slots, labels, recordingSettings } = useDialer();
  const copy = labels.workspace;
  const [elapsed, setElapsed] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const pendingOperation = useRef<"booking" | "saving" | null>(null);
  const [pending, setPending] = useState<"booking" | "saving" | null>(null);
  const [contactRefresh, setContactRefresh] = useState({
    contactId,
    revision: 0,
  });
  const changePending = (operation: "booking" | "saving", active: boolean) => {
    if (active) {
      if (pendingOperation.current !== null) return false;
      pendingOperation.current = operation;
      setPending(operation);
    } else if (pendingOperation.current === operation) {
      pendingOperation.current = null;
      setPending(null);
    }
    return true;
  };
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [actionsContainer, setActionsContainer] =
    useState<HTMLDivElement | null>(null);
  const [profileActionsContainer, setProfileActionsContainer] =
    useState<HTMLDivElement | null>(null);
  const {
    meetingBooked,
    setMeetingBooked,
    setOutcome,
    outcomeNote,
    setOutcomeNote,
    callDuration,
  } = useCallStore();

  useEffect(() => {
    if (!open || isPostCall) return;
    void data.listDispositions?.().catch(() => undefined);
  }, [open, isPostCall, data]);

  useEffect(() => {
    if (!open) {
      setElapsed(0);
      return;
    }
    if (isPostCall) return;
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [open, isPostCall]);

  const elapsedLabel = useMemo(() => {
    const seconds = isPostCall ? callDuration : elapsed;
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  }, [elapsed, isPostCall, callDuration]);
  const trialLabel = `${Math.floor(freeTrialRemainingSeconds / 60)}:${(freeTrialRemainingSeconds % 60).toString().padStart(2, "0")}`;
  const trialProgress =
    freeTrialTotalSeconds > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (freeTrialRemainingSeconds / freeTrialTotalSeconds) * 100,
          ),
        )
      : 0;

  // The host's answer signal gates playback: early media would double ringback.
  const isConnected =
    isConnectedProp ?? (statusText === "Connected" || elapsed > 0);
  const initials = contactName
    ? contactName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : null;
  const handleBooked = () => {
    setContactRefresh((previous) => ({
      contactId,
      revision: previous.contactId === contactId ? previous.revision + 1 : 1,
    }));
    const chosen = useCallStore.getState().outcome;
    setMeetingBooked(true);
    // A booking suggests an outcome, but never replaces the agent's choice.
    if (chosen) setOutcome(chosen);
  };

  const controls = (
    <div
      className={cn(
        "flex items-center gap-1",
        compact && "flex-wrap justify-center",
      )}
      aria-label={copy.controls}
    >
      <Button
        type="button"
        variant="ghost"
        aria-label={isMuted ? copy.unmute : copy.mute}
        aria-pressed={isMuted}
        onClick={onToggleMute}
        className={cn(
          controlClass,
          isMuted && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
      >
        {isMuted ? <MicOff /> : <Mic />}
        <span className={compact ? "" : "hidden xl:inline"}>
          {isMuted ? copy.unmute : copy.mute}
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={isOnHold ? copy.resume : copy.hold}
        aria-pressed={isOnHold}
        onClick={onToggleHold}
        className={cn(
          controlClass,
          isOnHold && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
      >
        {isOnHold ? <Play /> : <Pause />}
        <span className={compact ? "" : "hidden xl:inline"}>
          {isOnHold ? copy.resume : copy.hold}
        </span>
      </Button>
      {onSendDTMF && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={copy.keypad}
              className={controlClass}
            >
              <Keyboard />
              <span className={compact ? "" : "hidden xl:inline"}>
                {copy.keypad}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-auto p-4"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DtmfKeypad onSendDTMF={onSendDTMF} />
          </PopoverContent>
        </Popover>
      )}
      <Button
        type="button"
        variant="ghost"
        aria-label={
          recordingSettings.recordAllCalls
            ? copy.autoRecording
            : isRecording
              ? copy.recording
              : copy.record
        }
        aria-pressed={isRecording}
        disabled={isRecordingLoading || recordingSettings.recordAllCalls}
        onClick={onToggleRecording}
        className={cn(
          controlClass,
          isRecording && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {isRecordingLoading ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Disc />
        )}
        <span className={compact ? "" : "hidden xl:inline"}>
          {isRecording ? copy.recording : copy.record}
        </span>
      </Button>
      {slots.renderTranscribeButton?.({
        callId,
        mode: "active",
        onView: () => setTranscriptDialogOpen(true),
      })}
      {slots.renderSubtitles && (
        <Button
          type="button"
          variant="ghost"
          aria-label={copy.subtitles}
          aria-pressed={showSubtitles}
          onClick={() => setShowSubtitles((show) => !show)}
          className={cn(
            controlClass,
            !showSubtitles && "text-muted-foreground",
          )}
        >
          {showSubtitles ? <Captions /> : <CaptionsOff />}
          <span className={compact ? "" : "hidden xl:inline"}>
            {copy.subtitles}
          </span>
        </Button>
      )}
    </div>
  );

  const contactPanel = (
    <section
      className="bg-card flex min-h-0 min-w-0 flex-1 flex-col max-md:w-full max-md:flex-none"
      aria-label={copy.contact}
    >
      <PanelHeading icon={<UserRound />} title={copy.contact} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain max-md:flex-none max-md:overflow-visible max-md:overscroll-auto">
        {contactId && slots.renderContactInfo ? (
          slots.renderContactInfo({
            contactId,
            profileActionsContainer,
            refreshKey:
              contactRefresh.contactId === contactId
                ? contactRefresh.revision
                : 0,
          })
        ) : (
          <EmptyPanel icon={<UserRound />} text={copy.contactPending} />
        )}
        {contactId && slots.renderContactActivities && (
          <div className="border-t p-4">
            <h3 className="text-muted-foreground mb-4 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              <History className="size-3.5" />
              {copy.history}
            </h3>
            {slots.renderContactActivities({ contactId })}
          </div>
        )}
      </div>
    </section>
  );
  const scriptPanel = (
    <section
      className="bg-background flex min-h-0 min-w-0 flex-1 flex-col max-md:w-full max-md:flex-none"
      aria-label={copy.script}
    >
      <PanelHeading icon={<FileText />} title={copy.script} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain max-md:flex-none max-md:overflow-visible max-md:overscroll-auto">
        {slots.renderScript ? (
          slots.renderScript()
        ) : (
          <EmptyPanel icon={<FileText />} text={copy.noScript} />
        )}
      </div>
      <div className="bg-card shrink-0 space-y-2 border-t px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
          <label htmlFor="active-call-notes" className="font-medium">
            {copy.callNotes}
          </label>
          <span className="text-muted-foreground">{copy.notesHint}</span>
        </div>
        <Textarea
          id="active-call-notes"
          value={outcomeNote}
          readOnly={pending === "saving"}
          onChange={(event) => {
            if (pendingOperation.current !== "saving")
              setOutcomeNote(event.target.value);
          }}
          placeholder={copy.notesPlaceholder}
          rows={3}
          className="bg-background min-h-20 resize-none text-sm"
        />
      </div>
    </section>
  );
  const bookingPanel = (
    <section
      className="bg-card/60 flex min-h-0 min-w-0 flex-1 flex-col max-md:w-full max-md:flex-none"
      aria-label={copy.schedule}
    >
      <PanelHeading icon={<CalendarDays />} title={copy.schedule} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 max-md:flex-none max-md:overflow-visible max-md:overscroll-auto xl:p-5">
        {contactId && slots.renderBookMeeting ? (
          slots.renderBookMeeting({
            contactId,
            callId,
            layout: "workspace",
            disabled: pending === "saving",
            onPendingChange: (active) => changePending("booking", active),
            onBooked: handleBooked,
            onCancel: () => {},
          })
        ) : (
          <EmptyPanel icon={<CalendarDays />} text={copy.noCalendar} />
        )}
      </div>
    </section>
  );

  return (
    <Dialog modal open={open} onOpenChange={() => {}}>
      {slots.renderTranscriptDialog?.({
        open: open && transcriptDialogOpen,
        onOpenChange: setTranscriptDialogOpen,
        callId,
      })}
      {slots.renderSubtitles?.({
        callId,
        show: open && !isPostCall && showSubtitles,
      })}
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className={cn(
          "flex flex-col gap-3 p-0",
          compact
            ? "bg-background max-h-[95dvh] w-[95vw] !max-w-md overflow-y-auto rounded-2xl border shadow-2xl"
            : "h-[calc(100dvh-2rem)] w-[96vw] !max-w-none overflow-hidden border-0 bg-transparent shadow-none max-md:h-[calc(100dvh-1rem)] max-md:w-[calc(100vw-1rem)]",
        )}
      >
        <DialogTitle className="sr-only">
          {copy.title} — {contactName || number}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {isPostCall ? copy.wrapUp : statusText}
        </DialogDescription>
        {/* This element survives layout and timer updates. Never reload an unchanged stream. */}
        {!isPostCall && isConnected && remoteStream && (
          <audio
            autoPlay
            className="hidden"
            ref={(element) => {
              if (element && remoteStream && element.srcObject !== remoteStream)
                element.srcObject = remoteStream;
            }}
          />
        )}
        {compact && isPostCall ? (
          <div className="p-5">
            <PostCallView
              onClose={onPostCallClose}
              pending={pending === "booking"}
              onPendingChange={(active) => changePending("saving", active)}
              onBookingPendingChange={(active) =>
                changePending("booking", active)
              }
              canClose={() => pendingOperation.current !== "booking"}
            />
          </div>
        ) : (
          <>
            <header
              className={cn(
                "bg-card flex shrink-0 items-center gap-4 rounded-xl border px-4 py-2.5 shadow-lg max-lg:gap-2",
                compact
                  ? "flex-col border-0 py-6 shadow-none"
                  : "min-h-[72px] max-md:flex-wrap max-md:px-3",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 max-md:basis-1/2 max-md:flex-wrap">
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback>
                    {initials || <UserRound className="size-5" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold tracking-tight">
                    {contactName || number}
                  </p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {number}
                  </p>
                </div>
                {!compact && (
                  <div
                    ref={setProfileActionsContainer}
                    className="shrink-0 max-md:basis-full max-md:pl-[52px]"
                  />
                )}
              </div>
              <div className="shrink-0 space-y-0.5 border-r pr-5 max-md:border-0 max-md:pr-0">
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    isPostCall || isOnHold
                      ? "text-amber-600 dark:text-amber-400"
                      : isConnected
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {isPostCall ? copy.ended : isOnHold ? copy.hold : statusText}
                </p>
                <p className="font-mono text-xl leading-tight tabular-nums">
                  {elapsedLabel}
                </p>
              </div>
              {isPostCall ? (
                <div className="flex items-center gap-2 px-3 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <Check className="size-4" />
                  {copy.wrapUp}
                </div>
              ) : (
                <div
                  className={cn(
                    compact
                      ? "flex w-full flex-col items-center gap-4"
                      : "flex items-center gap-3",
                    !compact &&
                      "max-md:order-3 max-md:w-full max-md:justify-between",
                  )}
                >
                  {controls}
                  <Button
                    type="button"
                    onClick={onHangup}
                    variant="outline"
                    className="h-11 shrink-0 cursor-pointer border-red-500/25 bg-red-500/10 px-4 text-red-600 hover:bg-red-500/20 hover:text-red-600 dark:text-red-300 dark:hover:text-red-300"
                  >
                    <PhoneOff className="size-4" />
                    <span>{copy.endCall}</span>
                  </Button>
                </div>
              )}
            </header>
            {isFreeTrialCall && !isPostCall && (
              <div className="relative shrink-0 overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
                <div className="relative z-10 flex justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="size-3.5" />
                    {copy.freeTrial}
                  </span>
                  <span className="font-mono tabular-nums">{trialLabel}</span>
                </div>
                <div
                  className="absolute inset-y-0 left-0 bg-amber-500/10"
                  style={{ width: `${trialProgress}%` }}
                />
              </div>
            )}
            {!compact && (
              <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-2xl">
                <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Headphones className="text-muted-foreground size-4" />
                    {copy.title}
                  </h2>
                  <span className="text-muted-foreground text-xs max-sm:hidden">
                    {meetingBooked ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <CalendarCheck className="size-3.5" />
                        {copy.meetingBooked}
                      </span>
                    ) : (
                      copy.manualCall
                    )}
                  </span>
                </div>
                {isPostCall && (
                  <div className="bg-card max-h-[35vh] shrink-0 overflow-y-auto border-b p-4">
                    <PostCallView
                      onClose={onPostCallClose}
                      layout="workspace"
                      pending={pending === "booking"}
                      onPendingChange={(active) =>
                        changePending("saving", active)
                      }
                      canClose={() => pendingOperation.current !== "booking"}
                      actionsContainer={actionsContainer}
                    />
                  </div>
                )}
                {/* The same panel tree stays mounted across hang-up, preserving every draft. */}
                <ResizablePanelGroup
                  direction="horizontal"
                  className="min-h-0 flex-1 max-md:!flex-col max-md:!overflow-y-auto"
                >
                  <ResizablePanel
                    defaultSize={25}
                    minSize={20}
                    className="flex min-w-0 max-md:!flex-none max-md:!overflow-visible"
                  >
                    {contactPanel}
                  </ResizablePanel>
                  <ResizableHandle
                    withHandle
                    className="w-1.5 border-x bg-transparent max-md:hidden [&>div]:w-1 [&>div]:border-0 [&_svg]:hidden"
                  />
                  <ResizablePanel
                    defaultSize={40}
                    minSize={25}
                    className="flex min-w-0 max-md:!min-h-[32rem] max-md:!flex-none max-md:!overflow-visible"
                  >
                    {scriptPanel}
                  </ResizablePanel>
                  <ResizableHandle
                    withHandle
                    className="w-1.5 border-x bg-transparent max-md:hidden [&>div]:w-1 [&>div]:border-0 [&_svg]:hidden"
                  />
                  <ResizablePanel
                    defaultSize={35}
                    minSize={25}
                    className="flex min-w-0 max-md:!flex-none max-md:!overflow-visible"
                  >
                    {bookingPanel}
                  </ResizablePanel>
                </ResizablePanelGroup>
                <footer className="bg-card flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {isPostCall ? copy.wrapUp : copy.inProgress}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {isPostCall ? copy.outcomeHint : copy.keepContext}
                    </p>
                  </div>
                  <div
                    ref={setActionsContainer}
                    className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end"
                  >
                    {!isPostCall && (
                      <span className="text-muted-foreground text-xs max-md:hidden">
                        {copy.wrapUpHint}
                      </span>
                    )}
                  </div>
                </footer>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const controlClass =
  "h-12 min-w-11 cursor-pointer flex-col gap-1 px-2 text-xs font-normal [&_svg]:size-[17px] xl:px-3";

function PanelHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b px-4 text-sm font-semibold [&_svg]:text-muted-foreground [&_svg]:size-4">
      <span className="md:hidden">{icon}</span>
      <h3>{title}</h3>
    </div>
  );
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="text-muted-foreground flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center text-sm [&_svg]:size-7">
      {icon}
      <p className="max-w-60">{text}</p>
    </div>
  );
}
