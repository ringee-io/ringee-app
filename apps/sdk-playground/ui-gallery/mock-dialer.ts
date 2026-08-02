/**
 * A drop-in stand-in for the headless `RingeeDialer` used only by the visual
 * playground. It implements the same public method + event surface but performs
 * no network calls and no WebRTC, so every screen can be shown (and the whole
 * flow clicked through) without a backend or a real phone call. Two modes:
 *   - `interactive` simulates realistic, timed transitions on each action.
 *   - `static` stays put so a gallery tile can freeze one exact state.
 */
import type {
  AuthState,
  DialerState,
  EmailChallenge,
  RingeeAgent,
  RingeeCall,
  RingeeCallerId,
  RingeeEventHandler,
  RingeeEventName,
  RingeeEventPayloads,
} from "../../../packages/dialer-sdk/src/types";

type Handlers = { [K in RingeeEventName]?: Set<(p: RingeeEventPayloads[K]) => void> };

export interface MockConfig {
  mode?: "interactive" | "static";
  agent?: RingeeAgent;
  callerIds?: RingeeCallerId[];
  /** Force verify to fail with an incorrect-code error. */
  failVerify?: boolean;
  /** Simulate the destination never answering (dialing → ended, no answer). */
  noAnswer?: boolean;
}

export const DEMO_AGENT: RingeeAgent = {
  id: "agent_1",
  firstName: "Taylor",
  lastName: "Reed",
  email: "taylor@company.com",
  imageUrl: null,
  organizationId: "org_1",
  role: "member",
};

export const DEMO_CALLER_IDS: RingeeCallerId[] = [
  { id: "cid_1", phoneNumber: "+13055550198", isPrimary: true, canRecord: true },
  { id: "cid_2", phoneNumber: "+525512345678", isPrimary: false, canRecord: true },
];

export class MockDialer {
  private handlers: Handlers = {};
  private auth: AuthState = "checking";
  private state: DialerState = "uninitialized";
  private agent: RingeeAgent | null = null;
  private callerIds: RingeeCallerId[] = [];
  private current: RingeeCall | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  readonly cfg: MockConfig;

  constructor(cfg: MockConfig = {}) {
    this.cfg = { mode: "interactive", ...cfg };
    this.agent = cfg.agent ?? DEMO_AGENT;
    this.currenterIds = cfg.callerIds ?? DEMO_CALLER_IDS;
  }

  // ── Event bus ─────────────────────────────────────────────────────────────
  on<T extends RingeeEventName>(event: T, handler: RingeeEventHandler<T>): () => void {
    const set = (this.handlers[event] ??= new Set()) as Set<(p: RingeeEventPayloads[T]) => void>;
    set.add(handler);
    return () => set.delete(handler);
  }

  emit<T extends RingeeEventName>(event: T, payload: RingeeEventPayloads[T]): void {
    const set = this.handlers[event] as Set<(p: RingeeEventPayloads[T]) => void> | undefined;
    if (set) for (const fn of [...set]) fn(payload);
  }

  // ── Getters the model reads ───────────────────────────────────────────────
  getAuthState() { return this.auth; }
  getState() { return this.state; }
  getAgent() { return this.agent; }
  getCallerIds() { return [...this.currenterIds]; }
  getActiveCall() { return this.current; }

  private setAuth(a: AuthState) { this.auth = a; this.emit("authStateChanged", { state: a }); }
  private setState(s: DialerState) { this.state = s; this.emit("stateChanged", { state: s }); }
  private after(ms: number, fn: () => void) { this.timers.push(setTimeout(fn, ms)); }

  // ── Public API surface (interactive) ──────────────────────────────────────
  async initialize() {
    this.setAuth("anonymous");
    this.emit("authRequired", {});
  }

  async requestEmailCode(email: string): Promise<EmailChallenge> {
    this.setAuth("sending_code");
    const challenge = this.makeChallenge(email);
    this.after(700, () => {
      this.emit("codeSent", { challenge });
      this.setAuth("awaiting_code");
    });
    return challenge;
  }

  async resendEmailCode(_id: string): Promise<EmailChallenge> {
    const challenge = this.makeChallenge("taylor@company.com");
    this.emit("codeSent", { challenge });
    return challenge;
  }

  async verifyEmailCode(_input: { challengeId: string; code: string }): Promise<RingeeAgent> {
    this.setAuth("verifying");
    if (this.cfg.failVerify) {
      await sleep(650);
      this.setAuth("awaiting_code");
      throw { code: "INVALID_EMAIL_CODE", message: "invalid" };
    }
    this.after(750, () => {
      this.emit("signedIn", { agent: this.agent! });
      this.setAuth("authenticated");
      this.setState("ready");
      this.emit("ready", {});
    });
    return this.agent!;
  }

  async signOut() {
    this.clear();
    this.current = null;
    this.setState("uninitialized");
    this.emit("signedOut", {});
    this.setAuth("anonymous");
  }

  async call(input: { to: string }): Promise<RingeeCall> {
    this.current = {
      id: "call_1", to: input.to, from: this.currenterIds[0]!.phoneNumber,
      direction: "outbound", state: "dialing", startedAt: new Date(),
      answeredAt: null, endedAt: null, durationSeconds: 0, muted: false, held: false,
    };
    this.setState("dialing");
    this.emit("dialing", { call: this.current });
    this.after(1100, () => {
      if (!this.current) return;
      this.current = { ...this.current, state: "ringing" };
      this.setState("ringing");
      this.emit("ringing", { call: this.current });
    });
    if (this.cfg.noAnswer) {
      this.after(4200, () => this.finish("ended"));
    } else {
      this.after(3000, () => {
        if (!this.current) return;
        this.current = { ...this.current, state: "active", answeredAt: new Date() };
        this.setState("active");
        this.emit("answered", { call: this.current });
      });
    }
    return this.current;
  }

  async hangup() { this.finish("ended"); }
  mute() { if (this.current) { this.current = { ...this.current, muted: true }; this.emit("muted", { call: this.current }); } }
  unmute() { if (this.current) { this.current = { ...this.current, muted: false }; this.emit("unmuted", { call: this.current }); } }
  async hold() { if (this.current) { this.current = { ...this.current, held: true }; this.setState("held"); this.emit("held", { call: this.current }); } }
  async resume() { if (this.current) { this.current = { ...this.current, held: false }; this.setState("active"); this.emit("resumed", { call: this.current }); } }
  sendDigits(_d: string) { /* no-op */ }
  async destroy() { this.clear(); }
  getInputDevices() { return Promise.resolve([]); }
  getOutputDevices() { return Promise.resolve([]); }
  setInputDevice() { return Promise.resolve(); }
  setOutputDevice() { return Promise.resolve(); }

  private finish(kind: "ended" | "error") {
    if (!this.current) return;
    const answeredAt = this.current.answeredAt;
    const endedAt = new Date();
    const durationSeconds = answeredAt ? Math.max(0, Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000)) : 0;
    const finished: RingeeCall = { ...this.current, state: kind === "error" ? "error" : "ended", endedAt, durationSeconds };
    this.current = null;
    this.setState("ready");
    if (kind === "error") this.emit("failed", { call: finished, error: { code: "CALL_FAILED", message: "failed", retryable: true } });
    else this.emit("ended", { call: finished });
  }

  private makeChallenge(email: string): EmailChallenge {
    const masked = maskEmail(email);
    return { id: "ch_1", maskedEmail: masked, expiresAt: new Date(Date.now() + 300000), resendAvailableAt: new Date(Date.now() + 30000) };
  }
  private clear() { for (const t of this.timers) clearTimeout(t); this.timers = []; }

  // ── Frozen-state presets used by the gallery ──────────────────────────────
  presetAuth(a: AuthState) { this.auth = a; return this; }
  presetState(s: DialerState) { this.state = s; return this; }
  presetCall(c: RingeeCall | null) { this.current = c; return this; }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = (name ?? "").slice(0, 2);
  return `${head}${"*".repeat(Math.max(2, (name ?? "").length - 2))}@${domain}`;
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
