/**
 * Offscreen document — the WebRTC engine.
 *
 * Why this exists: in Manifest V3 the service worker is killed aggressively and
 * has no DOM, so it can't hold a PeerConnection, call getUserMedia, or play
 * remote audio. The side panel can, but it dies the moment the user closes it —
 * mid-call. An offscreen document is a real, headless extension page Chrome
 * keeps alive while we declare an audio/userMedia reason. So the live call (and
 * its audio) lives HERE; the side panel is just a remote control.
 *
 * It uses the SAME @ringee/dialer-core engine as the web app — there is exactly
 * one implementation of createTelnyxClient/placeCall/mute/hold/hangup/DTMF.
 */
import {
  createTelnyxClient,
  placeCall,
  muteCall,
  holdCall,
  hangupCall,
  sendDtmf,
  onCallUpdate,
  mapTelnyxState,
  TELNYX_EVENTS,
  OUTBOUND_RINGBACK_VOLUME,
  type Call,
} from "@ringee/dialer-core/engine";
import {
  MessageType,
  isCallCommand,
  isStartCall,
  type CallCommandMsg,
  type CallEventMsg,
  type CallState,
  type StartCallMsg,
} from "@ringee/dialer-core/contracts";

type TelnyxClient = ReturnType<typeof createTelnyxClient>;

let client: TelnyxClient | null = null;
let activeCall: Call | null = null;
let activeTelnyxSessionId: string | undefined;

/**
 * The side panel passes `remoteStream={null}` to the Active Call Modal — it's a
 * remote control with no live media. So the far end's audio has to be played
 * HERE, in the offscreen document, by attaching `call.remoteStream` to a real
 * <audio> element. Without this the call connects but is completely silent.
 */
const remoteAudio = document.getElementById(
  "ringee-remote-audio",
) as HTMLAudioElement | null;

function attachRemoteAudio(call: Call, state: CallState) {
  const stream = (call as unknown as { remoteStream?: MediaStream })
    .remoteStream;
  if (!remoteAudio || !stream) return;
  remoteAudio.volume =
    state === "active" || state === "held" ? 1 : OUTBOUND_RINGBACK_VOLUME;
  if (remoteAudio.srcObject === stream) return;
  remoteAudio.srcObject = stream;
  void remoteAudio.play().catch(() => {});
}

function detachRemoteAudio() {
  if (remoteAudio) remoteAudio.srcObject = null;
}

function emit(state: CallState, detail?: CallEventMsg["detail"]) {
  const msg: CallEventMsg = { type: MessageType.CallEvent, state, detail };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/**
 * Telnyx stamps the reason a call ended on the Call object (cause / sipReason /
 * sipCode). When a call hangs up on its own we want to KNOW why instead of a
 * silent "Call ended" — a media/SDP failure (no mic) reads very differently
 * from a Telnyx-side rejection (bad caller ID / connection profile). Collapse
 * whatever is present into one short human string.
 */
function hangupCause(call: Call): string | undefined {
  const c = call as unknown as {
    cause?: string;
    causeCode?: number;
    sipReason?: string;
    sipCode?: number;
  };
  const parts = [
    c.cause,
    c.sipReason && c.sipReason !== c.cause ? c.sipReason : undefined,
    c.sipCode ? `SIP ${c.sipCode}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Release the socket + mic when there's no active call (cleanup, MV3-safe). */
function cleanup() {
  try {
    client?.disconnect?.();
  } catch {
    /* ignore */
  }
  detachRemoteAudio();
  client = null;
  activeCall = null;
  activeTelnyxSessionId = undefined;
}

async function connect(sip: StartCallMsg["sip"]): Promise<TelnyxClient> {
  if (client) return client;
  const c = createTelnyxClient({
    login: sip.username,
    password: sip.password,
  });

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      c.off(TELNYX_EVENTS.ready, onReady);
      resolve();
    };
    const onErr = (e: unknown) => {
      c.off(TELNYX_EVENTS.error, onErr);
      reject(e);
    };
    c.on(TELNYX_EVENTS.ready, onReady);
    c.on(TELNYX_EVENTS.error, onErr);
    c.connect();
  });

  onCallUpdate(c, (call) => {
    activeCall = call;
    // Telnyx may omit telnyxIDs from its terminal update. Retain the last
    // observed session id until after `ended` has been emitted so post-call
    // outcome/notes always carry a stable backend correlation key.
    activeTelnyxSessionId =
      call.telnyxIDs?.telnyxSessionId ?? activeTelnyxSessionId;
    const mapped = mapTelnyxState(call.state);
    // Play carrier early media when present, but keep it quiet for headset
    // users until the far end answers. `attachRemoteAudio` restores full volume
    // for the active conversation.
    attachRemoteAudio(call, mapped);
    const cause = mapped === "ended" ? hangupCause(call) : undefined;
    if (mapped === "ended" && cause) {
      console.warn(
        `[Ringee] call ended — ${cause} (telnyx state: ${call.state})`,
      );
    }
    emit(mapped, {
      telnyxSessionId: activeTelnyxSessionId,
      cause,
    });
    if (mapped === "ended") cleanup();
  });

  client = c;
  return c;
}

/**
 * Prove the offscreen document can actually capture the mic BEFORE dialing.
 * The side panel grants the permission (it's the only visible context that can
 * prompt), but the live call's getUserMedia runs HERE — if the grant didn't
 * reach the offscreen, Telnyx negotiates with no outbound audio and the far end
 * (or Telnyx) tears the call down seconds after it connects. That's the
 * "calls hang up by themselves" symptom. We acquire + immediately release so
 * Telnyx owns the device during the call, and surface a precise error instead
 * of a silent drop when the grant is missing.
 */
async function verifyMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err) {
    console.error("[Ringee] offscreen microphone access failed", err);
    return false;
  }
}

async function startCall(msg: StartCallMsg) {
  try {
    if (!(await verifyMicrophone())) {
      emit("failed", {
        error:
          "Microphone access is blocked for Ringee — allow it and try again.",
        cause: "no-microphone (offscreen getUserMedia denied)",
      });
      cleanup();
      return;
    }
    const c = await connect(msg.sip);
    activeCall = placeCall({
      client: c,
      callerId: msg.callerId,
      destination: msg.destination,
      userId: msg.userId,
      organizationId: msg.organizationId,
    });
  } catch (err) {
    emit("failed", {
      error: err instanceof Error ? err.message : "Could not connect the call.",
    });
    cleanup();
  }
}

function handleCommand(msg: CallCommandMsg) {
  const call = activeCall;
  if (!call) return;
  const cmd = msg.command;
  switch (cmd.action) {
    case "hangup":
      void hangupCall(call);
      break;
    case "mute":
      void muteCall(call, cmd.value);
      break;
    case "hold":
      void holdCall(call, cmd.value);
      break;
    case "dtmf":
      sendDtmf(call, cmd.digit);
      break;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (isStartCall(msg)) void startCall(msg);
  else if (isCallCommand(msg)) handleCommand(msg);
  else if (msg?.type === MessageType.EndCall) cleanup();
  return false;
});
