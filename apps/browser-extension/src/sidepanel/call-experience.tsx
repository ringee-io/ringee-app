import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/chrome-extension";
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
  isDialResult,
  type CallCommandMsg,
  type CallSnapshotMsg,
  type CallState,
  type DialRequestMsg,
} from "@ringee/dialer-core/contracts";
import { resolveDialNumber } from "@ringee/dialer-core/phone";
import { RingeeApi, type CurrentUser } from "../lib/ringee-api";
import { panelTokenProvider, workerTokenSource } from "../lib/panel-token";
import {
  ENDING_TEXT,
  ERROR_COPY,
  callDurationSeconds,
  statusTextFor,
} from "../lib/call-flow";
import { DEFAULT_REGION } from "../lib/region";
import {
  ensureMicrophoneAccess,
  requestMicrophonePermission,
} from "../lib/microphone";
import { AppShell } from "./app-shell";
import { AppProvider, NavProvider, type AppData } from "./navigation";
import { ScheduleCallbackForm } from "./schedule-callback.form";
import { BookMeetingForm } from "./book-meeting.form";

function send(msg: CallCommandMsg | DialRequestMsg | { type: string }): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/** An in-call control, with an id per press so the engine acts on it once. */
function command(cmd: CallCommandMsg["command"]): void {
  send({
    type: MessageType.CallCommand,
    id: crypto.randomUUID(),
    command: cmd,
  });
}

const EMPTY_SNAPSHOT: CallSnapshotMsg = {
  type: MessageType.CallSnapshot,
  state: "idle",
};

/** How long a dial waits for the background to say whether it was placed. */
const DIAL_ANSWER_MS = 30_000;

/** Whether the background says the dial was placed; no answer at all is no. */
async function requestDial(msg: DialRequestMsg): Promise<boolean> {
  try {
    const res: unknown = await chrome.runtime.sendMessage(msg);
    return isDialResult(res) && res.placed;
  } catch {
    return false;
  }
}

/**
 * A token from the background worker, for when the panel's own Clerk copy has
 * none (see lib/panel-token.ts). One per panel, so concurrent requests share it.
 */
const workerToken = workerTokenSource((msg) => chrome.runtime.sendMessage(msg));

/** What `promise` settles to within `ms`; undefined once that has passed. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export function CallExperience() {
  const { getToken, userId, orgId } = useAuth();
  const [snap, setSnap] = useState<CallSnapshotMsg>(EMPTY_SNAPSHOT);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingIdRef = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [creditKey, setCreditKey] = useState(0);
  const prevState = useRef<CallState>("idle");

  const {
    postCallPhase,
    enterPostCallPhase,
    reset: resetCallStore,
  } = useCallStore();

  // A token borrowed from the worker is used only for the user and workspace
  // this panel shows.
  const api = useMemo(
    () =>
      new RingeeApi(
        panelTokenProvider(
          (opts) => getToken(opts),
          workerToken,
          () => ({ userId, orgId }),
        ),
      ),
    [getToken, userId, orgId],
  );

  // Identity / admin flag / workspace label for the shell header.
  useEffect(() => {
    let alive = true;
    api
      .getCurrentUser()
      .then((u) => alive && setMe(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api]);

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

  // END CALL was pressed and the line has yet to confirm — the BYE's round
  // trip, a few seconds at most: say so instead of looking unresponsive.
  const [ending, setEnding] = useState(false);
  useEffect(() => {
    if (!isLiveCallState(snap.state)) setEnding(false);
  }, [snap.state]);

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
      enterPostCallPhase({
        // Up to the call's recorded end: a panel opened later on the wrap-up
        // must not count the time since.
        duration: callDurationSeconds(snap),
        contactName: snap.contact?.name ?? null,
        contactId: snap.contact?.id ?? null,
        // prepare-call returns no Ringee callId up front (the Call row is created
        // later from the Telnyx `call.initiated` webhook). Hand the backend the
        // Telnyx session id instead — `/meetings/call-outcome` resolves the Call
        // from it. Without this the disposition is silently dropped (the
        // post-call save no-ops when both ids are null) and the CRM note never
        // gets the outcome/notes folded in.
        callId: snap.callId ?? null,
        callSessionId: snap.telnyxSessionId ?? null,
      });
    }
    prevState.current = snap.state;
  }, [snap, enterPostCallPhase]);

  const data = useMemo(
    () => ({
      // Outcome save AND skip/close share this request — with no `outcome` the
      // backend just pushes the CRM call-log note immediately. Works with only
      // the Telnyx session id, which is all the extension has post-call.
      saveCallOutcome: (input: {
        callId?: string | null;
        callSessionId?: string | null;
        outcome?: Parameters<RingeeApi["saveCallOutcome"]>[0]["outcome"];
        outcomeNote?: string;
      }) => api.saveCallOutcome(input),
    }),
    [api],
  );

  const notify = useCallback(
    (_kind: "success" | "error", message: string) => setToast(message),
    [],
  );

  // Auto-dismiss the toast after a moment (it has no exit animation to hook).
  useEffect(() => {
    if (toast == null) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // The extension provides only the post-call booking/callback forms — the
  // active-call view stays lean (see the `compact` prop). These slots are what
  // make the "schedule callback / book meeting" forms show after a call ends.
  const slots = useMemo<DialerSlots>(
    () => ({
      renderScheduleCallback: ({
        contactId,
        callId,
        onScheduled,
        onCancel,
      }) => (
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
    command({ action: "mute", value });
  }, [muted]);

  const onToggleHold = useCallback(async () => {
    const value = !onHold;
    setOnHold(value);
    command({ action: "hold", value });
  }, [onHold]);

  const onSendDTMF = useCallback((digit: string) => {
    command({ action: "dtmf", digit });
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
    setEnding(true);
    command({ action: "hangup" });
  }, []);

  const onPostCallClose = useCallback(() => {
    resetCallStore();
    setMuted(false);
    setOnHold(false);
    setIsRecording(false);
    recordingIdRef.current = null;
    send({ type: MessageType.EndCall });
    setSnap(EMPTY_SNAPSHOT);
    // A finished call moved the balance — refresh the header pill.
    setCreditKey((k) => k + 1);
  }, [resetCallStore]);

  // The background answers once the engine reports the leg placed, or as soon
  // as the dial is refused or called off. A dial still unanswered in time is
  // called off — hung up before its leg exists, it is never placed — and its
  // answer still taken, so a leg placed meanwhile counts and the queue
  // completes the callback it owed. Called off, it is answered at once or
  // within the worker's own wait on the engine; silence even then counts as
  // not placed, so a stuck request cannot hold up the next dial.
  const dialManual = useCallback(
    async (e164: string, name?: string): Promise<boolean> => {
      const answer = requestDial({
        type: MessageType.DialRequest,
        target: { destination: e164, name },
      });
      const placed = await within(answer, DIAL_ANSWER_MS);
      if (placed !== undefined) return placed;
      command({ action: "hangup" });
      if (await within(answer, DIAL_ANSWER_MS)) return true;
      setToast(ERROR_COPY.UNKNOWN);
      return false;
    },
    [],
  );

  // A second tap while a dial is starting would ask the backend for a second
  // call: drop it, the way the web app's `useDial` does.
  const dialing = useRef(false);

  // Resolve free-text / a row's number to E.164 (worldwide) before dialing.
  // Grab the mic grant first (in this visible context) so the offscreen engine
  // can actually capture audio — otherwise the call rings and immediately drops.
  const handleDial = useCallback(
    async (raw: string, name?: string): Promise<boolean> => {
      const e164 = resolveDialNumber(raw, DEFAULT_REGION);
      if (!e164 || dialing.current) return false;
      dialing.current = true;
      try {
        const micOk = await ensureMicrophoneAccess();
        if (!micOk) {
          setToast(
            "Allow microphone access in the tab we just opened, then place your call again.",
          );
          return false;
        }
        return await dialManual(e164, name);
      } finally {
        dialing.current = false;
      }
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

  // Backstop: if the offscreen engine reports it couldn't capture the mic, open
  // the permission tab so the user can fix it in one click and retry.
  useEffect(() => {
    if (snap.state === "failed" && /microphone/i.test(snap.error ?? "")) {
      requestMicrophonePermission();
    }
  }, [snap.state, snap.error]);

  const open = isLiveCallState(snap.state) || postCallPhase;

  const appData = useMemo<AppData>(
    () => ({
      api,
      me,
      onDial: handleDial,
      notify,
      // Bumped together with the credit pill's key: both re-read what a
      // finished call changed.
      callsFinished: creditKey,
    }),
    [api, me, handleDial, notify, creditKey],
  );

  return (
    <DialerProvider data={data} slots={slots} notify={notify}>
      <NavProvider>
        <AppProvider value={appData}>
          <div className="bg-background text-foreground relative h-full">
            {/* The shell stays mounted under the call overlay so navigation
                state survives a call — just hidden while a call is on screen. */}
            <div className={open ? "hidden" : "h-full"}>
              <AppShell
                error={snap.state === "failed" ? snap.error : undefined}
                dncBlocked={snap.state === "failed" && snap.dncBlocked}
                concurrentCall={snap.state === "failed" && snap.concurrentCall}
                creditRefreshKey={creditKey}
              />
            </div>

            {open && (
              <ActiveCallModal
                compact
                open={open}
                onClose={onHangup}
                number={snap.destination || "+CALL"}
                contactName={snap.contact?.name}
                statusText={ending ? ENDING_TEXT : statusTextFor(snap.state)}
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
              <div className="bg-foreground text-background animate-[fadeIn_0.15s_ease] fixed bottom-16 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg">
                {toast}
              </div>
            )}
          </div>
        </AppProvider>
      </NavProvider>
    </DialerProvider>
  );
}
