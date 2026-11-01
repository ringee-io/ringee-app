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
  onCallWarning,
  mapTelnyxState,
  getCallPeerConnection,
  createCallQualityProbe,
  TELNYX_EVENTS,
  OUTBOUND_RINGBACK_VOLUME,
  type Call,
  type CallQualityProbe,
} from "@ringee/dialer-core/engine";
import {
  MessageType,
  isCallCommand,
  isStartCall,
  type CallCommandMsg,
  type CallEventMsg,
  type CallQualityMsg,
  type CallState,
  type StartCallMsg,
} from "@ringee/dialer-core/contracts";

import { createCommandFilter } from "../lib/call-flow";

type TelnyxClient = ReturnType<typeof createTelnyxClient>;

let client: TelnyxClient | null = null;
let activeCall: Call | null = null;
let activeTelnyxSessionId: string | undefined;
/** START_CALL arrived and its leg is not placed yet (mic check, line login). */
let starting = false;
/** Hung up before the leg existed: it is never placed. */
let calledOff = false;
/** The hang-up is on its way out; the SDK reports `destroy` once it is. */
let hangingUp = false;
/** The leg's end was reported; what the SDK reports after is its teardown. */
let legEnded = false;
const firstDelivery = createCommandFilter();
/** The microphone captured for the call (see `captureMicrophone`). */
let micStream: MediaStream | null = null;
/** How the call's outgoing audio flows, reported before `ended`. */
let quality: CallQualityProbe | null = null;

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
  // The SDK's disconnect purges a leg it still holds and reports that back into
  // the call handler, which ends here again. With the line still set, that
  // second pass disconnected again, and so on until the stack gave out:
  // thousands of `ended` reports, BYEs and call reports from one hang-up, and a
  // panel stuck on "Ending call…" (2026-10-31). Taken first, a second pass
  // finds no line.
  const line = client;
  client = null;
  if (line) disconnectAfterTeardown(line);
  detachRemoteAudio();
  // The SDK stops the stream when a placed leg ends; a dial called off or
  // failed before its leg existed still holds it.
  micStream?.getTracks().forEach((track) => track.stop());
  micStream = null;
  quality?.finish();
  quality = null;
  activeCall = null;
  activeTelnyxSessionId = undefined;
  hangingUp = false;
}

/**
 * Close the line on the next task. The end is reported from inside the SDK's
 * own state change, before it drops the leg (`_finalize`); disconnecting then
 * would purge the leg and send it a second BYE.
 */
function disconnectAfterTeardown(line: TelnyxClient) {
  setTimeout(() => {
    try {
      void Promise.resolve(line.disconnect()).catch(() => {});
    } catch {
      /* ignore */
    }
  }, 0);
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
    if (legEnded) return;
    activeCall = call;
    // Telnyx may omit telnyxIDs from its terminal update. Retain the last
    // observed session id until after `ended` has been emitted so post-call
    // outcome/notes always carry a stable backend correlation key.
    activeTelnyxSessionId =
      call.telnyxIDs?.telnyxSessionId ?? activeTelnyxSessionId;
    // `hangup` is the SDK starting to end the call — it reports it, then sends
    // the BYE, then reports `destroy` once the BYE is out (or after 5 s).
    // Ending here tore the socket down before that BYE, and a leg placed with
    // keepConnectionAliveOnSocketClose outlives its socket: the far end kept
    // ringing after END CALL. The call is over at `destroy` (or `purge`).
    if (call.state === "hangup") return;
    const mapped = mapTelnyxState(call.state);
    // Play carrier early media when present, but keep it quiet for headset
    // users until the far end answers. `attachRemoteAudio` restores full volume
    // for the active conversation.
    attachRemoteAudio(call, mapped);
    followQuality(mapped);
    const cause = mapped === "ended" ? hangupCause(call) : undefined;
    if (mapped === "ended" && cause) {
      console.warn(
        `[Ringee] call ended — ${cause} (telnyx state: ${call.state})`,
      );
    }
    if (mapped === "ended") {
      legEnded = true;
      reportQuality();
    }
    emit(mapped, {
      telnyxSessionId: activeTelnyxSessionId,
      cause,
    });
    if (mapped === "ended") cleanup();
  });
  onCallWarning(c, (name) => quality?.warn(name));

  client = c;
  return c;
}

/** Measure the outgoing audio while the far end is on the line, not on hold. */
function followQuality(state: CallState) {
  if (state === "active") {
    quality?.setHeld(false);
    quality?.start();
  } else if (state === "held") {
    quality?.setHeld(true);
  }
}

/**
 * Hand the worker the call's audio record. It goes before `ended`, on which
 * the worker closes this document.
 */
function reportQuality() {
  const summary = quality?.finish(activeTelnyxSessionId);
  quality = null;
  if (!summary) return;
  const msg: CallQualityMsg = { type: MessageType.CallQuality, summary };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/**
 * Capture the mic BEFORE dialing. The side panel grants the permission (it's
 * the only visible context that can prompt), but the live call's capture runs
 * HERE — if the grant didn't reach the offscreen, Telnyx negotiates with no
 * outbound audio and the far end (or Telnyx) tears the call down seconds after
 * it connects. That's the "calls hang up by themselves" symptom, so a missing
 * grant surfaces as a precise error instead of a silent drop.
 *
 * The stream is the call's own: it goes to the SDK as the leg's `localStream`,
 * so the device is opened once per call, as web calls open it. This used to
 * open the mic, release it, and let the SDK open it again a moment later, and
 * the extension's legs were the ones Telnyx measured sending a fraction of
 * their audio (2026-10-31, docs/engineering/TELEPHONY.md).
 */
async function captureMicrophone(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error("[Ringee] offscreen microphone access failed", err);
    return null;
  }
}

async function startCall(msg: StartCallMsg) {
  starting = true;
  calledOff = false;
  legEnded = false;
  try {
    const mic = await captureMicrophone();
    micStream = mic;
    if (!mic) {
      emit("failed", {
        error:
          "Microphone access is blocked for Ringee — allow it and try again.",
        cause: "no-microphone (offscreen getUserMedia denied)",
      });
      cleanup();
      return;
    }
    if (calledOff) return callOff();
    const c = await connect(msg.sip);
    // Hung up while the line was logging in: the leg is never placed, so
    // nobody's phone rings.
    if (calledOff) return callOff();
    activeCall = placeCall({
      client: c,
      callerId: msg.callerId,
      destination: msg.destination,
      userId: msg.userId,
      organizationId: msg.organizationId,
      dialToken: msg.dialToken,
      localStream: mic,
    });
    quality = createCallQualityProbe({
      // A recovered call gets a new connection; read the current one.
      peer: () => getCallPeerConnection(activeCall),
      mic,
    });
  } catch (err) {
    emit("failed", {
      error: err instanceof Error ? err.message : "Could not connect the call.",
    });
    cleanup();
  } finally {
    starting = false;
  }
}

/** A dial hung up before its leg existed: back to no call, no post-call. */
function callOff() {
  emit("idle");
  cleanup();
}

/** Ends the call — or, before its leg exists, calls the dial off. */
function hangup() {
  const call = activeCall;
  if (!call) {
    if (starting) calledOff = true;
    return;
  }
  if (hangingUp) return;
  hangingUp = true;
  hangupCall(call).catch((err) => {
    // Still up: let the next press try again.
    hangingUp = false;
    console.error("[Ringee] hangup failed", err);
  });
}

function handleCommand(msg: CallCommandMsg) {
  if (!firstDelivery(msg.id)) return;
  const cmd = msg.command;
  if (cmd.action === "hangup") return hangup();
  const call = activeCall;
  if (!call) return;
  switch (cmd.action) {
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
