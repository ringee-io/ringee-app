import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import {
  ActiveCallModal,
  DialerProvider,
  type DialerSlots,
} from "@ringee/dialer-ui";
import { useCallStore } from "@ringee/dialer-core/store";
import { isLiveCallState } from "@ringee/dialer-core/contracts";
import {
  MessageType,
  isCallSnapshot,
  type CallCommandMsg,
  type CallSnapshotMsg,
  type CallState,
  type DialRequestMsg,
} from "@ringee/dialer-core/contracts";
import { resolveDialNumber } from "@ringee/dialer-core/phone";
import { RingeeApi } from "../lib/ringee-api";
import { statusTextFor } from "../lib/call-flow";
import { DEFAULT_REGION } from "../lib/region";
import {
  ensureMicrophoneAccess,
  requestMicrophonePermission,
} from "../lib/microphone";
import { Home } from "./home";
import { ScheduleCallbackForm } from "./schedule-callback.form";
import { BookMeetingForm } from "./book-meeting.form";

function send(msg: CallCommandMsg | DialRequestMsg | { type: string }): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

const EMPTY_SNAPSHOT: CallSnapshotMsg = {
  type: MessageType.CallSnapshot,
  state: "idle",
};

export function CallExperience() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [snap, setSnap] = useState<CallSnapshotMsg>(EMPTY_SNAPSHOT);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingIdRef = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prevState = useRef<CallState>("idle");

  const {
    postCallPhase,
    enterPostCallPhase,
    reset: resetCallStore,
  } = useCallStore();

  const api = useMemo(() => new RingeeApi(() => getToken()), [getToken]);

  // Subscribe to the background's call snapshot — the side panel is a remote
  // control, this is the single source of truth it renders.
  useEffect(() => {
    const onMsg = (m: unknown) => {
      if (isCallSnapshot(m)) setSnap(m);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    send({ type: MessageType.RequestSnapshot });
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, []);

  // Reset optimistic toggles whenever a new call starts.
  useEffect(() => {
    if (snap.state === "requesting" || snap.state === "connecting") {
      setMuted(false);
      setOnHold(false);
      setIsRecording(false);
      recordingIdRef.current = null;
    }
  }, [snap.state]);

  // Drive the shared post-call (outcome/notes) phase when the call ends.
  useEffect(() => {
    if (prevState.current !== "ended" && snap.state === "ended") {
      const duration = snap.startedAt
        ? Math.max(0, Math.round((Date.now() - snap.startedAt) / 1000))
        : 0;
      enterPostCallPhase({
        duration,
        contactName: snap.contact?.name ?? null,
        contactId: snap.contact?.id ?? null,
        callId: snap.callId ?? null,
        callSessionId: null,
      });
    }
    prevState.current = snap.state;
  }, [snap, enterPostCallPhase]);

  const data = useMemo(
    () => ({
      saveCallOutcome: (input: {
        callId?: string | null;
        callSessionId?: string | null;
        outcome: Parameters<RingeeApi["saveCallOutcome"]>[0]["outcome"];
        outcomeNote?: string;
      }) => api.saveCallOutcome(input).then(() => undefined),
    }),
    [api],
  );

  const notify = useCallback(
    (_kind: "success" | "error", message: string) => setToast(message),
    [],
  );

  // The extension provides only the post-call booking/callback forms — the
  // active-call view stays lean (see the `compact` prop). These slots are what
  // make the "schedule callback / book meeting" forms show after a call ends.
  const slots = useMemo<DialerSlots>(
    () => ({
      renderScheduleCallback: ({ contactId, callId, onScheduled, onCancel }) => (
        <ScheduleCallbackForm
          api={api}
          notify={notify}
          contactId={contactId}
          callId={callId}
          onScheduled={onScheduled}
          onCancel={onCancel}
        />
      ),
      renderBookMeeting: ({ contactId, callId, onBooked, onCancel }) => (
        <BookMeetingForm
          api={api}
          notify={notify}
          contactId={contactId}
          callId={callId}
          onBooked={onBooked}
          onCancel={onCancel}
        />
      ),
    }),
    [api, notify],
  );

  // ── In-call controls → bridge to the offscreen engine via the worker ───────
  const onToggleMute = useCallback(async () => {
    const value = !muted;
    setMuted(value);
    send({ type: MessageType.CallCommand, command: { action: "mute", value } });
  }, [muted]);

  const onToggleHold = useCallback(async () => {
    const value = !onHold;
    setOnHold(value);
    send({ type: MessageType.CallCommand, command: { action: "hold", value } });
  }, [onHold]);

  const onSendDTMF = useCallback((digit: string) => {
    send({
      type: MessageType.CallCommand,
      command: { action: "dtmf", digit },
    });
  }, []);

  const onToggleRecording = useCallback(async () => {
    const sessionId = snap.telnyxSessionId;
    if (!sessionId) {
      setToast("Recording isn't available yet for this call.");
      return;
    }
    try {
      if (!isRecording) {
        const { id } = await api.startRecording(sessionId);
        recordingIdRef.current = id;
        setIsRecording(true);
      } else if (recordingIdRef.current) {
        await api.stopRecording(recordingIdRef.current, sessionId);
        recordingIdRef.current = null;
        setIsRecording(false);
      }
    } catch {
      setToast("Could not toggle recording.");
    }
  }, [api, isRecording, snap.telnyxSessionId]);

  const onHangup = useCallback(() => {
    send({ type: MessageType.CallCommand, command: { action: "hangup" } });
  }, []);

  const onPostCallClose = useCallback(() => {
    resetCallStore();
    setMuted(false);
    setOnHold(false);
    setIsRecording(false);
    recordingIdRef.current = null;
    send({ type: MessageType.EndCall });
    setSnap(EMPTY_SNAPSHOT);
  }, [resetCallStore]);

  const dialManual = useCallback((e164: string, name?: string) => {
    const msg: DialRequestMsg = {
      type: MessageType.DialRequest,
      target: { destination: e164, name },
    };
    send(msg);
  }, []);

  // Resolve free-text / a row's number to E.164 (worldwide) before dialing.
  // Grab the mic grant first (in this visible context) so the offscreen engine
  // can actually capture audio — otherwise the call rings and immediately drops.
  const handleDial = useCallback(
    async (raw: string, name?: string) => {
      const e164 = resolveDialNumber(raw, DEFAULT_REGION);
      if (!e164) return;
      // The live call runs headless in the offscreen document, which can't show
      // the mic prompt — and neither can this side panel (Chrome only prompts in
      // a tab). If we don't hold the grant the offscreen's getUserMedia fails and
      // Telnyx tears the call down moments after it connects. So ensure the grant
      // first; when it's missing this opens the permission tab — block the dial
      // and tell the user to allow it there, instead of placing a doomed call.
      const micOk = await ensureMicrophoneAccess();
      if (!micOk) {
        setToast(
          "Allow microphone access in the tab we just opened, then place your call again.",
        );
        return;
      }
      dialManual(e164, name);
    },
    [dialManual],
  );

  // Dials that originate outside the panel (page popover / context menu) open the
  // side panel without going through `handleDial`, so grab the mic grant here too
  // as soon as a call starts.
  useEffect(() => {
    if (snap.state === "requesting" || snap.state === "connecting") {
      void ensureMicrophoneAccess();
    }
  }, [snap.state]);

  // Backstop: if the offscreen engine reports it couldn't capture the mic
  // (a first-ever external dial can fail before the grant exists), open the
  // permission tab so the user can fix it in one click and retry.
  useEffect(() => {
    if (snap.state === "failed" && /microphone/i.test(snap.error ?? "")) {
      requestMicrophonePermission();
    }
  }, [snap.state, snap.error]);

  const open = isLiveCallState(snap.state) || postCallPhase;

  return (
    <DialerProvider data={data} slots={slots} notify={notify}>
      <div className="bg-background text-foreground flex h-full flex-col">
        {!open && (
          <Home
            api={api}
            userLabel={
              user?.primaryEmailAddress?.emailAddress ??
              user?.firstName ??
              undefined
            }
            error={snap.state === "failed" ? snap.error : undefined}
            dncBlocked={snap.state === "failed" && snap.dncBlocked}
            onDial={handleDial}
          />
        )}

        {open && (
          <ActiveCallModal
            compact
            open={open}
            onClose={onHangup}
            number={snap.destination || "+CALL"}
            contactName={snap.contact?.name}
            statusText={statusTextFor(snap.state)}
            isMuted={muted}
            isOnHold={onHold}
            isRecording={isRecording}
            onHangup={onHangup}
            onToggleMute={onToggleMute}
            onToggleHold={onToggleHold}
            onToggleRecording={onToggleRecording}
            onSendDTMF={onSendDTMF}
            remoteStream={null}
            isPostCall={postCallPhase}
            onPostCallClose={onPostCallClose}
            contactId={snap.contact?.id ?? null}
            callId={snap.callId ?? null}
          />
        )}

        {toast && (
          <div
            className="bg-foreground text-background fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg"
            onAnimationEnd={() => setToast(null)}
          >
            {toast}
          </div>
        )}
      </div>
    </DialerProvider>
  );
}
