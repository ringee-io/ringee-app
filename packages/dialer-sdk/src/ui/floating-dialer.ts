/**
 * The Floating dialer: a fixed launcher button that opens an animated card
 * panel. Keeps the panel open/closed state for the session, minimizes to the
 * launcher during a live call (with a pulsing indicator so the call is never
 * lost), traps focus while open, closes on Escape / backdrop, and drops to a
 * full-screen sheet on small screens. The call itself keeps running regardless
 * of open state — closing never hangs up.
 */
import { h, trapFocus, raf } from "./dom";
import { icon } from "./icons";
import { CardView } from "./card-view";
import type { ShadowMount } from "./shadow-root";
import { prefersReducedMotion } from "./motion";
import { DialerModel } from "./dialer-model";

export type FloatingSide = "right" | "left";

export interface FloatingChromeOptions {
  side?: FloatingSide;
  defaultOpen?: boolean;
  rememberOpen?: boolean;
}

const OPEN_KEY = "ringee:sdk:floating-open";

export class FloatingDialer {
  readonly mount: ShadowMount;
  private readonly container: HTMLElement;
  private readonly launcher: HTMLButtonElement;
  private readonly launcherBadge: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly card: CardView;
  private backdrop: HTMLElement | null = null;
  private open = false;
  private releaseTrap: (() => void) | null = null;
  private returnFocusTo: HTMLElement | null = null;
  private unsub: () => void;

  constructor(
    private readonly model: DialerModel,
    mount: ShadowMount,
    private readonly opts: FloatingChromeOptions = {},
  ) {
    this.mount = mount;

    this.card = new CardView(model, {
      showMinimize: true,
      onMinimize: () => this.close(),
      onClose: () => this.close(),
    });
    this.panel = this.card.el;
    this.panel.classList.add("rg-panel");
    this.panel.id = "rg-panel";

    this.launcherBadge = h("span", { class: "rg-launcher__badge", hidden: true });
    this.launcher = h(
      "button",
      {
        class: "rg-launcher",
        type: "button",
        title: model.s.launcherOpen,
        attrs: {
          "aria-label": model.s.launcherOpen,
          "aria-haspopup": "dialog",
          "aria-expanded": "false",
          "aria-controls": "rg-panel",
        },
        on: { click: () => this.toggle() },
      },
      icon("phone", 24),
      this.launcherBadge,
    ) as HTMLButtonElement;

    this.container = h(
      "div",
      {
        class: "rg-floating",
        attrs: { "data-side": opts.side ?? "right", "data-open": "false" },
      },
      this.panel,
      this.launcher,
    );
    this.panel.hidden = true;
    mount.root.appendChild(this.container);

    // Escape closes the panel.
    this.container.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Escape" && this.open) {
        ev.stopPropagation();
        this.close();
      }
    });

    this.unsub = model.subscribe(() => this.syncLauncher());
    this.syncLauncher();

    const remembered =
      opts.rememberOpen !== false && sessionRead() === "1";
    if (opts.defaultOpen || remembered) this.openPanel(false);
  }

  // ── Public controls ─────────────────────────────────────────────────────
  toggle(): void {
    this.open ? this.close() : this.openPanel(true);
  }

  openPanel(focus = true): void {
    if (this.open) return;
    this.open = true;
    this.returnFocusTo = this.launcher;
    this.container.setAttribute("data-open", "true");
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.title = this.model.s.launcherClose;
    this.panel.hidden = false;
    this.ensureBackdrop();
    if (this.opts.rememberOpen !== false) sessionWrite("1");

    this.releaseTrap = trapFocus(this.panel);
    if (focus) raf(() => this.focusFirst());
    this.syncLauncher();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.container.setAttribute("data-open", "false");
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.title = this.model.s.launcherOpen;
    this.releaseTrap?.();
    this.releaseTrap = null;
    this.removeBackdrop();
    if (this.opts.rememberOpen !== false) sessionWrite("0");

    const done = () => {
      this.panel.hidden = true;
      this.syncLauncher();
    };
    if (prefersReducedMotion() || typeof this.panel.animate !== "function") {
      done();
    } else {
      const anim = this.panel.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(8px) scale(.98)" },
        ],
        { duration: 140, easing: "cubic-bezier(.4,0,1,1)" },
      );
      anim.onfinish = done;
      anim.oncancel = done;
    }
    this.returnFocusTo?.focus();
  }

  setSide(side: FloatingSide): void {
    this.container.setAttribute("data-side", side);
  }

  destroy(): void {
    this.unsub();
    this.card.destroy();
    this.removeBackdrop();
    this.mount.destroy();
  }

  // ── Internals ───────────────────────────────────────────────────────────
  private focusFirst(): void {
    const target = this.panel.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled]):not(.rg-iconbtn)',
    );
    (target ?? this.panel).focus?.();
  }

  private syncLauncher(): void {
    const inCall =
      this.model.screen === "calling" || this.model.screen === "incall";
    const live = inCall && !this.open;
    // Pulsing ring + badge on the launcher when a call is live but minimized.
    this.launcher.classList.toggle("rg-launcher--live", live);
    this.launcherBadge.hidden = !live;
    if (live) {
      this.launcherBadge.textContent = "1";
      this.launcher.setAttribute("aria-label", this.model.s.ongoingCall);
      this.launcher.title = this.model.s.ongoingCall;
    } else if (!this.open) {
      this.launcher.setAttribute("aria-label", this.model.s.launcherOpen);
      this.launcher.title = this.model.s.launcherOpen;
    }
  }

  private ensureBackdrop(): void {
    // Backdrop only matters on the mobile full-screen sheet; it is harmless on
    // desktop (kept transparent by the media query hiding the sheet layout).
    if (this.backdrop) return;
    if (!isNarrow()) return;
    this.backdrop = h("button", {
      class: "rg-backdrop",
      attrs: { "aria-label": this.model.s.close, tabindex: "-1" },
      on: { click: () => this.close() },
    });
    this.mount.root.insertBefore(this.backdrop, this.container);
  }

  private removeBackdrop(): void {
    this.backdrop?.remove();
    this.backdrop = null;
  }
}

function isNarrow(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 480px)").matches;
}

function sessionRead(): string | null {
  try {
    return window.sessionStorage?.getItem(OPEN_KEY) ?? null;
  } catch {
    return null;
  }
}
function sessionWrite(v: string): void {
  try {
    window.sessionStorage?.setItem(OPEN_KEY, v);
  } catch {
    /* ignore */
  }
}
