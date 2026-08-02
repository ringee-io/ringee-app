/**
 * The single source of truth shared by the Floating and Bar surfaces. It wraps
 * a headless {@link RingeeDialer}, subscribes to its event stream, derives a
 * coarse `ScreenKey` state machine, holds the form buffers (so re-renders never
 * lose typed input), and exposes intent methods that map user actions +
 * error-recovery actions onto the dialer. Views subscribe with `subscribe()`
 * and are told whether the *screen* changed (rebuild) or just data (patch).
 */
import type { RingeeDialer } from "../ringee-dialer";
import { RingeeError } from "../errors";
import type {
  AuthState,
  DialerState,
  EmailChallenge,
  RingeeAgent,
  RingeeCall,
  RingeeCallerId,
} from "../types";
import { errorCopy, type ErrorAction, type Strings } from "./strings";

export type ScreenKey =
  | "loading"
  | "email"
  | "otp"
  | "ready"
  | "calling"
  | "incall"
  | "ended"
  | "fatal";

export interface DialerContact {
  name?: string | null;
  number?: string | null;
  imageUrl?: string | null;
  contactId?: string;
  externalContactId?: string;
}

export interface Banner {
  title: string;
  message: string;
  action: ErrorAction;
  tone: "error" | "warning";
}

export interface DialerModelOptions {
  strings: Strings;
  agentEmail?: string;
  allowHold?: boolean;
  workspaceName?: string;
  onError?: (error: RingeeError) => void;
}

/** Reason a change was emitted: `screen` needs a rebuild, `patch` an in-place update. */
export type ChangeReason = "screen" | "patch";
type Listener = (reason: ChangeReason) => void;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FATAL = new Set([
  "INVALID_PUBLISHABLE_KEY",
  "DOMAIN_NOT_ALLOWED",
  "INTEGRATION_DISABLED",
]);

export class DialerModel {
  private readonly listeners = new Set<Listener>();
  private readonly unsubscribers: Array<() => void> = [];

  // Derived / dialer-mirrored state
  authState: AuthState = "checking";
  dialerState: DialerState = "uninitialized";
  agent: RingeeAgent | null = null;
  callerIds: RingeeCallerId[] = [];
  activeCall: RingeeCall | null = null;
  lastEndedCall: RingeeCall | null = null;

  // UI-local state
  email: string;
  number = "";
  selectedCallerId: string | undefined;
  challenge: EmailChallenge | null = null;
  banner: Banner | null = null;
  contact: DialerContact | null = null;
  keypadOpen = false;
  otpInvalidNonce = 0;
  private forceEmail = false;
  private showEnded = false;
  private fatalError = false;
  private lastScreen: ScreenKey = "loading";

  constructor(
    readonly dialer: RingeeDialer,
    readonly options: DialerModelOptions,
  ) {
    this.email = options.agentEmail ?? "";
    this.authState = dialer.getAuthState();
    this.dialerState = dialer.getState();
    this.wire();
  }

  // ── Subscription ──────────────────────────────────────────────────────────
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const next = this.computeScreen();
    const reason: ChangeReason = next === this.lastScreen ? "patch" : "screen";
    this.lastScreen = next;
    for (const fn of [...this.listeners]) {
      try {
        fn(reason);
      } catch {
        /* never let a view throw into the model */
      }
    }
  }

  get s(): Strings {
    return this.options.strings;
  }

  get screen(): ScreenKey {
    return this.computeScreen();
  }

  get loadingLabel(): string {
    if (this.authState === "checking") return this.s.restoring;
    if (this.dialerState === "dialing" && !this.activeCall) return this.s.preparingCall;
    return this.s.connectingAudio;
  }

  private computeScreen(): ScreenKey {
    if (this.fatalError) return "fatal";
    switch (this.authState) {
      case "checking":
        return "loading";
      case "authenticated":
        break;
      default:
        // anonymous, sending_code, awaiting_code, verifying, expired…
        return this.isOtpPhase() ? "otp" : "email";
    }
    // authenticated
    if (this.showEnded) return "ended";
    switch (this.dialerState) {
      case "initializing":
      case "connecting":
        return "loading";
      case "dialing":
      case "ringing":
        return "calling";
      case "active":
      case "held":
      case "ending":
        return "incall";
      default:
        return "ready";
    }
  }

  /** True while the OTP flow is in progress (drives the OTP vs email screen). */
  private isOtpPhase(): boolean {
    return (
      !this.forceEmail &&
      (this.authState === "awaiting_code" || this.authState === "verifying")
    );
  }

  // ── Event wiring ──────────────────────────────────────────────────────────
  private wire(): void {
    const on = this.dialer.on.bind(this.dialer);
    this.unsubscribers.push(
      on("authStateChanged", ({ state }) => {
        this.authState = state;
        if (state === "authenticated") {
          this.agent = this.dialer.getAgent();
          this.callerIds = this.dialer.getCallerIds();
          this.restoreCallerId();
          this.forceEmail = false;
          this.banner = null;
        }
        this.emit();
      }),
      on("stateChanged", ({ state }) => {
        this.dialerState = state;
        this.activeCall = this.dialer.getActiveCall();
        this.emit();
      }),
      on("codeSent", ({ challenge }) => {
        this.challenge = challenge;
        this.emit();
      }),
      on("signedIn", ({ agent }) => {
        this.agent = agent;
        this.callerIds = this.dialer.getCallerIds();
        this.restoreCallerId();
        this.emit();
      }),
      on("dialing", ({ call }) => {
        this.activeCall = call;
        this.showEnded = false;
        this.emit();
      }),
      on("ringing", ({ call }) => {
        this.activeCall = call;
        this.emit();
      }),
      on("answered", ({ call }) => {
        this.activeCall = call;
        this.emit();
      }),
      on("ended", ({ call }) => {
        this.lastEndedCall = call;
        this.activeCall = null;
        this.showEnded = true;
        this.keypadOpen = false;
        this.emit();
      }),
      on("failed", ({ call, error }) => {
        if (call) {
          this.lastEndedCall = call;
          this.activeCall = null;
          this.showEnded = true;
        } else {
          this.setBanner(error);
        }
        this.keypadOpen = false;
        this.emit();
      }),
      on("signedOut", () => {
        this.agent = null;
        this.callerIds = [];
        this.selectedCallerId = undefined;
        this.challenge = null;
        this.showEnded = false;
        this.keypadOpen = false;
        this.emit();
      }),
      on("sessionExpired", () => {
        this.setBannerCopy("SESSION_EXPIRED");
        this.emit();
      }),
      on("error", ({ error }) => {
        if (FATAL.has(error.code)) {
          this.fatalError = true;
          this.setBanner(error);
          this.emit();
        }
        this.options.onError?.(
          error instanceof RingeeError ? error : new RingeeError(error.code, error.message),
        );
      }),
    );
  }

  // ── Intent methods ────────────────────────────────────────────────────────
  setEmail(v: string): void {
    this.email = v;
  }
  setNumber(v: string): void {
    this.number = v;
  }
  /**
   * Select the caller ID to dial from. User-driven selections persist per agent
   * so the choice survives reloads; programmatic per-call overrides (from
   * `startCall`) pass `persist: false` so they never clobber the saved default.
   */
  setCallerId(id: string | undefined, opts: { persist?: boolean } = {}): void {
    this.selectedCallerId = id;
    if (opts.persist !== false) this.persistCallerId(id);
  }
  setKeypadOpen(open: boolean): void {
    if (this.keypadOpen === open) return;
    this.keypadOpen = open;
    this.emit();
  }
  dismissBanner(): void {
    if (!this.banner) return;
    this.banner = null;
    this.emit();
  }

  /** Integrator API: attach the current CRM contact + default number. */
  setContact(contact: DialerContact | null): void {
    this.contact = contact;
    if (contact?.number) this.number = contact.number;
    this.emit();
  }

  async sendCode(): Promise<void> {
    const email = this.email.trim();
    if (!EMAIL_RE.test(email)) {
      this.banner = {
        title: this.s.errors.INVALID_EMAIL.title,
        message: this.s.emailInvalid,
        action: "none",
        tone: "error",
      };
      this.emit();
      throw new RingeeError("INVALID_EMAIL", this.s.emailInvalid);
    }
    this.forceEmail = false;
    this.banner = null;
    try {
      await this.dialer.requestEmailCode(email);
      // authStateChanged → awaiting_code drives the screen switch.
    } catch (err) {
      this.setBanner(err);
      this.emit();
    }
  }

  async verify(code: string): Promise<void> {
    if (code.replace(/\D/g, "").length !== 6) {
      this.banner = {
        title: this.s.errors.INVALID_EMAIL_CODE.title,
        message: this.s.otpIncomplete,
        action: "none",
        tone: "error",
      };
      this.emit();
      return;
    }
    if (!this.challenge) return;
    this.banner = null;
    try {
      await this.dialer.verifyEmailCode({ challengeId: this.challenge.id, code });
    } catch (err) {
      this.setBanner(err);
      this.otpInvalidNonce += 1;
      this.emit();
    }
  }

  async resend(): Promise<void> {
    if (!this.challenge) return;
    this.banner = null;
    try {
      await this.dialer.resendEmailCode(this.challenge.id);
    } catch (err) {
      this.setBanner(err);
      this.emit();
    }
  }

  changeEmail(): void {
    this.forceEmail = true;
    this.challenge = null;
    this.banner = null;
    this.emit();
  }

  async placeCall(): Promise<void> {
    const to = this.number.trim();
    this.banner = null;
    try {
      await this.dialer.call({
        to,
        callerIdId: this.selectedCallerId,
        contactId: this.contact?.contactId,
        externalContactId: this.contact?.externalContactId,
      });
    } catch (err) {
      this.setBanner(err);
      this.emit();
    }
  }

  async hangup(): Promise<void> {
    try {
      await this.dialer.hangup();
    } catch {
      /* already gone */
    }
  }

  toggleMute(): void {
    const call = this.activeCall;
    if (!call) return;
    if (call.muted) this.dialer.unmute();
    else this.dialer.mute();
    this.activeCall = this.dialer.getActiveCall();
    this.emit();
  }

  async toggleHold(): Promise<void> {
    const call = this.activeCall;
    if (!call) return;
    if (call.held) await this.dialer.resume();
    else await this.dialer.hold();
    this.activeCall = this.dialer.getActiveCall();
    this.emit();
  }

  toggleKeypad(): void {
    this.setKeypadOpen(!this.keypadOpen);
  }

  sendDigit(d: string): void {
    this.dialer.sendDigits(d);
  }

  newCall(): void {
    this.showEnded = false;
    this.keypadOpen = false;
    this.banner = null;
    this.emit();
  }

  async signOut(): Promise<void> {
    await this.dialer.signOut();
  }

  /** Run the recovery action attached to the current banner. */
  handleAction(action: ErrorAction): void {
    switch (action) {
      case "retry":
      case "allowMic":
        this.banner = null;
        if (this.screen === "email") void this.sendCode();
        else if (this.screen === "otp") void this.resend();
        else void this.placeCall();
        break;
      case "resend":
        void this.resend();
        break;
      case "changeEmail":
        this.changeEmail();
        break;
      case "signIn":
        this.forceEmail = true;
        this.challenge = null;
        this.banner = null;
        this.emit();
        break;
      case "reload":
        if (typeof window !== "undefined") window.location.reload();
        break;
      default:
        this.dismissBanner();
    }
  }

  /** Surface a failure from `dialer.initialize()` (rejects instead of emitting). */
  reportInitError(err: unknown): void {
    const code =
      err instanceof RingeeError
        ? err.code
        : (err as { code?: string } | null)?.code ?? "UNKNOWN_ERROR";
    if (FATAL.has(code)) this.fatalError = true;
    this.setBannerCopy(code);
    this.options.onError?.(
      err instanceof RingeeError ? err : new RingeeError(code as RingeeError["code"], String(code)),
    );
    this.emit();
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
    this.listeners.clear();
  }

  // ── Caller-ID persistence ─────────────────────────────────────────────────
  /** Storage key is scoped to the agent so shared devices don't cross-pollute. */
  private callerIdStorageKey(): string | null {
    const agentId = this.agent?.id;
    return agentId ? `ringee:sdk:callerid:${agentId}` : null;
  }

  /** Restore a saved caller ID once the agent + caller IDs are known. */
  private restoreCallerId(): void {
    const key = this.callerIdStorageKey();
    if (!key) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage?.getItem(key) ?? null;
    } catch {
      /* storage unavailable (private mode, sandboxed iframe) — stay on auto */
    }
    // Only adopt it if the number is still assigned to the agent; otherwise auto.
    this.selectedCallerId =
      stored && this.callerIds.some((c) => c.id === stored) ? stored : undefined;
  }

  private persistCallerId(id: string | undefined): void {
    const key = this.callerIdStorageKey();
    if (!key) return;
    try {
      if (id) window.localStorage?.setItem(key, id);
      else window.localStorage?.removeItem(key);
    } catch {
      /* ignore — persistence is best-effort */
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private setBanner(err: unknown): void {
    const code =
      err instanceof RingeeError
        ? err.code
        : (err as { code?: string } | null)?.code ?? "UNKNOWN_ERROR";
    this.setBannerCopy(code);
  }

  private setBannerCopy(code: string): void {
    const copy = errorCopy(code as RingeeError["code"], this.s);
    this.banner = {
      title: copy.title,
      message: copy.message,
      action: copy.action,
      tone: copy.tone ?? "error",
    };
  }
}
