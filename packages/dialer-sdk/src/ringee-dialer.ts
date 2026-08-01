import { ApiClient, type BootstrapResponse } from "./api-client";
import { SessionManager } from "./session-manager";
import { EventBus } from "./event-bus";
import { BrowserCallLock } from "./browser-call-lock";
import { RemoteAudioManager } from "./audio/remote-audio-manager";
import { AudioDeviceManager } from "./audio/audio-device-manager";
import { TelnyxAdapter, type TelnyxCredential } from "./telnyx/telnyx-adapter";
import { RingeeError, toRingeeError } from "./errors";
import type {
  AudioDevice,
  AuthState,
  DialerState,
  EmailChallenge,
  RingeeAgent,
  RingeeCall,
  RingeeCallerId,
  RingeeDialerOptions,
  RingeeEventHandler,
  RingeeEventName,
  StartCallInput,
  VerifyEmailCodeInput,
} from "./types";

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Headless, framework-agnostic Ringee dialer. Coordinates the API client,
 * session persistence, the Telnyx adapter, audio, and the single-call lock,
 * exposing a small imperative API + a typed event stream. No UI, no React.
 */
export class RingeeDialer {
  private readonly api: ApiClient;
  private readonly sessions = new SessionManager();
  private readonly bus = new EventBus();
  private readonly audioDevices = new AudioDeviceManager();
  private readonly remoteAudio: RemoteAudioManager;
  private readonly lock: BrowserCallLock;
  private readonly adapter: TelnyxAdapter;
  private readonly instanceId = Math.random().toString(36).slice(2, 10);

  private authState: AuthState = "checking";
  private dialerState: DialerState = "uninitialized";
  private agent: RingeeAgent | null = null;
  private callerIds: RingeeCallerId[] = [];
  private sessionToken: string | null = null;
  private credential: TelnyxCredential | null = null;
  private integrationId: string | null = null;
  private origin: string | null = null;
  private activeCall: RingeeCall | null = null;
  private initialized = false;

  constructor(private readonly options: RingeeDialerOptions) {
    this.api = new ApiClient(options.key, options.apiUrl);
    this.remoteAudio = new RemoteAudioManager(this.instanceId);
    this.lock = new BrowserCallLock(
      `ringee-call-lock-${options.key.slice(-12)}`,
    );
    this.adapter = new TelnyxAdapter(
      {
        onStateChange: (state) => this.onCallState(state),
        onRemoteStream: (stream) => {
          void this.remoteAudio
            .attachStream(stream)
            .catch((err) => this.emitError(toRingeeError(err)));
        },
        onConnectionError: (err) => this.emitError(err),
      },
      options.debug ?? false,
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (typeof window === "undefined") {
      throw new RingeeError(
        "SDK_NOT_INITIALIZED",
        "The Ringee SDK can only be initialized in a browser.",
      );
    }
    if (this.initialized) return;

    this.setAuthState("checking");
    this.origin = window.location.origin;
    this.remoteAudio.mount();

    // Validate the publishable key + origin.
    await this.api.initialize().then((res) => {
      this.integrationId = res.integrationId;
      this.sessions.bind(res.integrationId, this.origin!);
    });

    this.initialized = true;

    // Try to restore a persisted session (survives reload).
    const stored = this.sessions.load();
    if (stored) {
      try {
        const bootstrap = await this.api.restore(stored);
        await this.applyBootstrap(bootstrap);
        return;
      } catch {
        this.sessions.clear();
      }
    }

    this.setAuthState("anonymous");
    this.bus.emit("authRequired", {});
  }

  async destroy(): Promise<void> {
    this.adapter.disconnect();
    this.remoteAudio.destroy();
    this.lock.free();
    this.credential = null;
    this.activeCall = null;
    this.setDialerState("uninitialized");
    this.bus.clear();
    this.initialized = false;
  }

  // ── Authentication ───────────────────────────────────────────────────────

  async requestEmailCode(email: string): Promise<EmailChallenge> {
    this.assertInitialized();
    this.setAuthState("sending_code");
    try {
      const res = await this.api.emailStart(email);
      const challenge = this.toChallenge(res);
      this.setAuthState("awaiting_code");
      this.bus.emit("codeSent", { challenge });
      return challenge;
    } catch (err) {
      this.setAuthState("error");
      throw this.rethrow(err);
    }
  }

  async verifyEmailCode(input: VerifyEmailCodeInput): Promise<RingeeAgent> {
    this.assertInitialized();
    this.setAuthState("verifying");
    try {
      const bootstrap = await this.api.emailVerify(
        input.challengeId,
        input.code,
      );
      await this.applyBootstrap(bootstrap);
      return this.agent!;
    } catch (err) {
      this.setAuthState("awaiting_code");
      throw this.rethrow(err);
    }
  }

  async resendEmailCode(challengeId: string): Promise<EmailChallenge> {
    this.assertInitialized();
    const res = await this.api.emailResend(challengeId).catch((err) => {
      throw this.rethrow(err);
    });
    const challenge = this.toChallenge(res);
    this.bus.emit("codeSent", { challenge });
    return challenge;
  }

  async signOut(): Promise<void> {
    if (this.activeCall) await this.hangup().catch(() => undefined);
    this.adapter.disconnect();
    this.sessions.clear();
    this.sessionToken = null;
    this.credential = null;
    this.agent = null;
    this.callerIds = [];
    this.setDialerState("uninitialized");
    this.setAuthState("signed_out");
    this.bus.emit("signedOut", {});
    this.setAuthState("anonymous");
  }

  getAuthState(): AuthState {
    return this.authState;
  }

  getAgent(): RingeeAgent | null {
    return this.agent;
  }

  getCallerIds(): RingeeCallerId[] {
    return [...this.callerIds];
  }

  // ── Calling ──────────────────────────────────────────────────────────────

  async call(input: StartCallInput): Promise<RingeeCall> {
    this.assertInitialized();
    if (this.authState !== "authenticated") {
      throw new RingeeError("AUTH_REQUIRED", "Sign in before placing a call.");
    }
    if (this.activeCall) {
      throw new RingeeError(
        "CALL_ALREADY_ACTIVE",
        "There is already an active call.",
      );
    }
    const to = (input.to ?? "").trim();
    if (!E164.test(to)) {
      throw new RingeeError(
        "INVALID_PHONE_NUMBER",
        "A valid E.164 number is required.",
      );
    }

    const gotLock = await this.lock.acquire();
    if (!gotLock) {
      throw new RingeeError(
        "CALL_ALREADY_ACTIVE",
        "Another tab already has an active call.",
      );
    }

    try {
      const idempotencyKey = this.uuid();
      const auth = await this.api.authorizeCall(
        this.sessionToken!,
        {
          to,
          callerIdId: input.callerIdId,
          contactId: input.contactId,
          externalContactId: input.externalContactId,
        },
        idempotencyKey,
      );

      await this.audioDevices.ensureMicrophone();

      this.activeCall = {
        id: auth.callId,
        to: auth.destinationNumber,
        from: auth.callerIdNumber,
        direction: "outbound",
        state: "dialing",
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        durationSeconds: 0,
        muted: false,
        held: false,
      };
      this.setDialerState("dialing");

      this.adapter.newCall({
        destination: to,
        callerId: auth.callerIdNumber,
        userId: this.agent!.id,
        organizationId: this.agent!.organizationId ?? undefined,
        correlationToken: auth.correlationToken,
      });

      this.bus.emit("dialing", { call: this.activeCall });
      return this.activeCall;
    } catch (err) {
      this.lock.free();
      const error = this.rethrow(err);
      this.bus.emit("failed", { call: this.activeCall, error });
      this.activeCall = null;
      this.setDialerState("ready");
      throw error;
    }
  }

  async hangup(): Promise<void> {
    if (!this.activeCall) {
      throw new RingeeError("NO_ACTIVE_CALL", "There is no active call.");
    }
    this.setDialerState("ending");
    await this.adapter.hangup();
  }

  mute(): void {
    if (!this.activeCall) return;
    void this.adapter.mute();
    this.activeCall = { ...this.activeCall, muted: true };
    this.bus.emit("muted", { call: this.activeCall });
  }

  unmute(): void {
    if (!this.activeCall) return;
    void this.adapter.unmute();
    this.activeCall = { ...this.activeCall, muted: false };
    this.bus.emit("unmuted", { call: this.activeCall });
  }

  async hold(): Promise<void> {
    if (!this.activeCall) return;
    await this.adapter.hold();
    this.activeCall = { ...this.activeCall, held: true };
    this.bus.emit("held", { call: this.activeCall });
  }

  async resume(): Promise<void> {
    if (!this.activeCall) return;
    await this.adapter.resume();
    this.activeCall = { ...this.activeCall, held: false };
    this.bus.emit("resumed", { call: this.activeCall });
  }

  sendDigits(digits: string): void {
    if (!this.activeCall) return;
    this.adapter.sendDigits(digits);
  }

  getState(): DialerState {
    return this.dialerState;
  }

  getActiveCall(): RingeeCall | null {
    return this.activeCall;
  }

  // ── Devices ──────────────────────────────────────────────────────────────

  getInputDevices(): Promise<AudioDevice[]> {
    return this.audioDevices.getInputDevices();
  }

  getOutputDevices(): Promise<AudioDevice[]> {
    return this.audioDevices.getOutputDevices();
  }

  async setInputDevice(deviceId: string): Promise<void> {
    this.audioDevices.setInputDevice(deviceId);
    this.bus.emit("deviceChanged", {});
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    await this.remoteAudio.setOutputDevice(deviceId);
    this.bus.emit("deviceChanged", {});
  }

  // ── Events ───────────────────────────────────────────────────────────────

  on<TEvent extends RingeeEventName>(
    event: TEvent,
    handler: RingeeEventHandler<TEvent>,
  ): () => void {
    return this.bus.on(event, handler);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async applyBootstrap(bootstrap: BootstrapResponse): Promise<void> {
    this.sessionToken = bootstrap.accessToken;
    this.sessions.save(bootstrap.accessToken);
    this.credential = bootstrap.telnyxToken;
    this.callerIds = bootstrap.callerIds;
    this.agent = {
      id: bootstrap.agent.id,
      firstName: bootstrap.agent.firstName,
      lastName: bootstrap.agent.lastName,
      email: bootstrap.agent.email,
      imageUrl: bootstrap.agent.imageUrl,
      organizationId: bootstrap.workspace.organizationId,
      role: bootstrap.agent.role,
    };

    this.setDialerState("initializing");
    await this.adapter.connect(this.credential);

    this.setAuthState("authenticated");
    this.bus.emit("signedIn", { agent: this.agent });
    this.setDialerState("ready");
    this.bus.emit("ready", {});
  }

  private onCallState(state: DialerState): void {
    if (!this.activeCall) {
      this.setDialerState(state);
      return;
    }
    const prev = this.activeCall.state;
    this.activeCall = { ...this.activeCall, state };
    this.setDialerState(state);

    if (state === prev) return;

    switch (state) {
      case "ringing":
        this.bus.emit("ringing", { call: this.activeCall });
        break;
      case "active": {
        if (!this.activeCall.answeredAt) {
          this.activeCall = { ...this.activeCall, answeredAt: new Date() };
        }
        this.bus.emit("answered", { call: this.activeCall });
        break;
      }
      case "ended":
        this.finishCall("ended");
        break;
      case "error":
        this.finishCall("error");
        break;
      default:
        break;
    }
  }

  private finishCall(kind: "ended" | "error"): void {
    if (!this.activeCall) return;
    const answeredAt = this.activeCall.answeredAt;
    const endedAt = new Date();
    const durationSeconds = answeredAt
      ? Math.max(
          0,
          Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000),
        )
      : 0;
    const finished: RingeeCall = {
      ...this.activeCall,
      state: kind === "error" ? "error" : "ended",
      endedAt,
      durationSeconds,
    };
    this.remoteAudio.detach();
    this.lock.free();
    this.activeCall = null;
    this.setDialerState("ready");

    if (kind === "error") {
      this.bus.emit("failed", {
        call: finished,
        error: new RingeeError("CALL_FAILED", "The call failed."),
      });
    } else {
      this.bus.emit("ended", { call: finished });
    }
  }

  private toChallenge(res: {
    challengeId: string;
    expiresIn: number;
    maskedEmail: string;
    resendAvailableIn: number;
  }): EmailChallenge {
    const now = Date.now();
    return {
      id: res.challengeId,
      maskedEmail: res.maskedEmail,
      expiresAt: new Date(now + res.expiresIn * 1000),
      resendAvailableAt: new Date(now + res.resendAvailableIn * 1000),
    };
  }

  private setAuthState(state: AuthState): void {
    if (this.authState === state) return;
    this.authState = state;
    this.bus.emit("authStateChanged", { state });
    if (state === "expired") this.bus.emit("sessionExpired", {});
  }

  private setDialerState(state: DialerState): void {
    if (this.dialerState === state) return;
    this.dialerState = state;
    this.bus.emit("stateChanged", { state });
  }

  private emitError(error: RingeeError): void {
    this.bus.emit("error", { error });
  }

  private rethrow(err: unknown): RingeeError {
    const error = toRingeeError(err);
    if (error.code === "SESSION_EXPIRED") {
      this.sessions.clear();
      this.sessionToken = null;
      this.setAuthState("expired");
    }
    this.emitError(error);
    return error;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new RingeeError(
        "SDK_NOT_INITIALIZED",
        "Call initialize() before using the dialer.",
      );
    }
  }

  private uuid(): string {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
    } catch {
      /* ignore */
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
