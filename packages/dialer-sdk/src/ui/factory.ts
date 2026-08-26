/**
 * Public one-call entry points for the two turnkey UIs. `createFloating` mounts
 * a launcher + panel on the page; `createBar` mounts an inline bar into a target
 * element. Both build (or reuse) a headless {@link RingeeDialer}, wire a shared
 * {@link DialerModel}, kick off `initialize()`, and hand back a small controller
 * so the integrator can drive it from their CRM (attach a contact, place a call,
 * re-theme, subscribe to events, tear down).
 */
import { RingeeDialer } from "../ringee-dialer";
import type {
  RingeeDialerOptions,
  RingeeEventHandler,
  RingeeEventName,
  StartCallInput,
} from "../types";
import { createShadowMount } from "./shadow-root";
import { DialerModel, type DialerContact } from "./dialer-model";
import { FloatingDialer, type FloatingSide } from "./floating-dialer";
import { BarView } from "./bar-view";
import { resolveStrings, type Strings } from "./strings";
import type { RingeeTheme } from "./theme";

// ── Shared UI options ────────────────────────────────────────────────────────
export interface CommonUIOptions {
  /** Reuse an existing headless dialer instead of creating one. */
  dialer?: RingeeDialer;
  /** Theme overrides (`--ringee-*`). */
  theme?: RingeeTheme;
  /** UI locale: "en" (default) or "es". */
  locale?: string;
  /** Fine-grained copy overrides, merged over the locale bundle. */
  strings?: Partial<Strings>;
  /** Show a Hold/Resume control during a call (off by default). */
  allowHold?: boolean;
  /** Label shown for the current workspace in the agent footer. */
  workspaceName?: string;
  /** Notified for every typed SDK error (also rendered in-UI). */
  onError?: (error: unknown) => void;
}

export interface FloatingOptions
  extends Partial<RingeeDialerOptions>,
    CommonUIOptions {
  side?: FloatingSide;
  defaultOpen?: boolean;
  rememberOpen?: boolean;
  /** Where to mount the host (defaults to `document.body`). */
  container?: HTMLElement;
}

export interface BarOptions
  extends Partial<RingeeDialerOptions>,
    CommonUIOptions {
  /** Target element (or its CSS selector / id) the bar renders into. Required. */
  container: HTMLElement | string;
}

export interface FloatingController {
  readonly dialer: RingeeDialer;
  open(): void;
  close(): void;
  toggle(): void;
  setContact(contact: DialerContact | null): void;
  prefill(number: string): void;
  /** Attach a contact/number, open the panel, and place the call when ready. */
  startCall(input: StartCallInput & { name?: string; imageUrl?: string }): void;
  setTheme(theme: RingeeTheme): void;
  on<T extends RingeeEventName>(
    event: T,
    handler: RingeeEventHandler<T>,
  ): () => void;
  destroy(): void;
}

export interface BarController {
  readonly dialer: RingeeDialer;
  readonly el: HTMLElement;
  setContact(contact: DialerContact | null): void;
  prefill(number: string): void;
  setTheme(theme: RingeeTheme): void;
  on<T extends RingeeEventName>(
    event: T,
    handler: RingeeEventHandler<T>,
  ): () => void;
  destroy(): void;
}

function makeDialer(
  opts: Partial<RingeeDialerOptions> & CommonUIOptions,
): RingeeDialer {
  if (opts.dialer) return opts.dialer;
  if (!opts.key) {
    throw new Error(
      "[ringee] A publishable `key` (pk_live_…) is required to create the dialer.",
    );
  }
  return new RingeeDialer({
    key: opts.key,
    apiUrl: opts.apiUrl,
    agentEmail: opts.agentEmail,
    debug: opts.debug,
  });
}

function makeModel(
  dialer: RingeeDialer,
  opts: CommonUIOptions & { agentEmail?: string },
): DialerModel {
  return new DialerModel(dialer, {
    strings: resolveStrings(opts.locale, opts.strings),
    agentEmail: opts.agentEmail,
    allowHold: opts.allowHold,
    workspaceName: opts.workspaceName,
    onError: opts.onError as ((e: any) => void) | undefined,
  });
}

function resolveContainer(target: HTMLElement | string): HTMLElement {
  if (typeof target !== "string") return target;
  const byId = document.getElementById(target.replace(/^#/, ""));
  const el = byId ?? document.querySelector<HTMLElement>(target);
  if (!el) throw new Error(`[ringee] Bar container "${target}" was not found.`);
  return el;
}

export function createFloating(options: FloatingOptions): FloatingController {
  const dialer = makeDialer(options);
  const model = makeModel(dialer, options);
  const mount = createShadowMount(
    options.container ?? document.body,
    options.theme,
  );
  const floating = new FloatingDialer(model, mount, {
    side: options.side,
    defaultOpen: options.defaultOpen,
    rememberOpen: options.rememberOpen,
  });

  dialer.initialize().catch((err) => model.reportInitError(err));

  return {
    dialer,
    open: () => floating.openPanel(),
    close: () => floating.close(),
    toggle: () => floating.toggle(),
    setContact: (c) => model.setContact(c),
    prefill: (n) => model.prefill(n),
    startCall: (input) => {
      model.setContact({
        number: input.to,
        name: input.name,
        imageUrl: input.imageUrl,
        contactId: input.contactId,
        externalContactId: input.externalContactId,
      });
      model.setNumber(input.to);
      // Per-call override — don't persist over the agent's saved default.
      model.setCallerId(input.callerIdId, { persist: false });
      floating.openPanel();
      placeWhenReady(model);
    },
    setTheme: (t) => mount.setTheme(t),
    on: (event, handler) => dialer.on(event, handler),
    destroy: () => {
      floating.destroy();
      model.destroy();
    },
  };
}

export function createBar(options: BarOptions): BarController {
  const dialer = makeDialer(options);
  const model = makeModel(dialer, options);
  const target = resolveContainer(options.container);
  const mount = createShadowMount(target, options.theme);
  const bar = new BarView(model);
  mount.root.appendChild(bar.el);

  dialer.initialize().catch((err) => model.reportInitError(err));

  return {
    dialer,
    el: mount.host,
    setContact: (c) => model.setContact(c),
    prefill: (n) => model.prefill(n),
    setTheme: (t) => mount.setTheme(t),
    on: (event, handler) => dialer.on(event, handler),
    destroy: () => {
      bar.destroy();
      model.destroy();
      mount.destroy();
    },
  };
}

/** Place a queued call the moment the dialer reaches the ready screen. */
function placeWhenReady(model: DialerModel): void {
  if (model.screen === "ready") {
    void model.placeCall();
    return;
  }
  const off = model.subscribe(() => {
    if (model.screen === "ready") {
      off();
      void model.placeCall();
    }
  });
}
