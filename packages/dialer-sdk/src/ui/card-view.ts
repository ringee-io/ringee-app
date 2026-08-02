/**
 * The full card experience used by the Floating dialer: a stable header
 * (brand + live status + minimize/close), a screen host that swaps screens on
 * state transitions, an agent footer, and a polite live region so screen-reader
 * users hear what changed. It reacts to {@link DialerModel} changes, rebuilding
 * only on a `"screen"` reason and patching in place on `"patch"`.
 */
import { h, replaceChildren, raf } from "./dom";
import { iconButton, statusDot } from "./components";
import { agentMenu } from "./call-components";
import { buildScreen, type Screen } from "./screens";
import type { DialerModel, ScreenKey } from "./dialer-model";

export interface CardViewCallbacks {
  onMinimize?: () => void;
  onClose?: () => void;
  showMinimize?: boolean;
}

export class CardView {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly live: HTMLElement;
  private readonly minimizeBtn?: HTMLButtonElement;
  private current: Screen | null = null;
  private currentKey: ScreenKey | null = null;
  private unsub: () => void;

  constructor(
    private readonly model: DialerModel,
    private readonly cb: CardViewCallbacks = {},
  ) {
    this.statusEl = h("span", { class: "rg-header__status" });
    const actions = h("div", { class: "rg-header__actions" });
    if (cb.showMinimize && cb.onMinimize) {
      this.minimizeBtn = iconButton({
        icon: "minus",
        label: model.s.minimize,
        onClick: () => cb.onMinimize?.(),
      });
      actions.appendChild(this.minimizeBtn);
    }
    if (cb.onClose) {
      actions.appendChild(
        iconButton({ icon: "x", label: model.s.close, onClick: () => cb.onClose?.() }),
      );
    }

    // Unbranded header: live status on the left, window controls on the right.
    const header = h(
      "div",
      { class: "rg-header" },
      this.statusEl,
      h("span", { class: "rg-header__spacer" }),
      actions,
    );

    this.body = h("div", { class: "rg-body" });
    this.footer = h("div", {
      class: "rg-header",
      style: { borderBottom: "0", borderTop: "1px solid var(--ringee-border)", minHeight: "auto", padding: "8px" },
      hidden: true,
    });
    this.live = h("div", {
      class: "rg-sr",
      attrs: { "aria-live": "polite", "aria-atomic": "true", role: "status" },
    });

    this.el = h(
      "div",
      { class: "rg-card", role: "dialog", attrs: { "aria-label": model.s.brand } },
      header,
      this.body,
      this.footer,
      this.live,
    );

    this.render("screen");
    this.unsub = model.subscribe((reason) => this.render(reason));
  }

  private render(reason: "screen" | "patch"): void {
    const key = this.model.screen;
    if (reason === "screen" || key !== this.currentKey || !this.current) {
      this.current?.dispose?.();
      this.current = buildScreen(key, this.model);
      this.currentKey = key;
      replaceChildren(this.body, this.current.el);
      raf(() => this.current?.focus?.());
    } else {
      this.current.update(this.model);
    }
    this.updateChrome(key);
  }

  private updateChrome(key: ScreenKey): void {
    // Header status
    let dot: HTMLElement | null = null;
    let label = "";
    if (key === "ready") {
      dot = statusDot("ready");
      label = "";
    } else if (key === "calling" || key === "incall") {
      dot = statusDot("live");
      label = this.model.s.ongoingCall;
    }
    replaceChildren(this.statusEl, dot, label ? h("span", { text: label }) : null);

    // Minimize is only meaningful during a live call.
    if (this.minimizeBtn) {
      this.minimizeBtn.hidden = !(key === "calling" || key === "incall");
    }

    // Footer agent menu on idle authenticated screens only.
    const showFooter =
      this.model.agent && (key === "ready" || key === "ended");
    this.footer.hidden = !showFooter;
    if (showFooter && this.model.agent) {
      const a = this.model.agent;
      const name =
        [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email;
      const ws = this.model.options.workspaceName
        ? this.model.options.workspaceName
        : a.organizationId
          ? a.email
          : this.model.s.workspacePersonal;
      replaceChildren(
        this.footer,
        agentMenu({
          name,
          workspaceLabel: ws,
          imageUrl: a.imageUrl,
          signOutLabel: this.model.s.signOut,
          onSignOut: () => void this.model.signOut(),
        }),
      );
    }

    // Announce coarse state to assistive tech.
    this.announce(key);
  }

  private lastAnnounced = "";
  private announce(key: ScreenKey): void {
    const s = this.model.s;
    const map: Record<ScreenKey, string> = {
      loading: this.model.loadingLabel,
      email: s.emailTitle,
      otp: s.otpTitle,
      ready: "",
      calling: this.model.dialerState === "ringing" ? s.ringing : s.dialing,
      incall: this.model.activeCall?.held ? s.onHold : s.inCall,
      ended: this.model.lastEndedCall?.state === "error" ? s.callFailedTitle : s.callEnded,
      fatal: this.model.banner?.title ?? s.genericErrorTitle,
    };
    const msg = this.model.banner && key !== "ready"
      ? `${map[key]}. ${this.model.banner.message}`
      : map[key];
    if (msg && msg !== this.lastAnnounced) {
      this.lastAnnounced = msg;
      this.live.textContent = msg;
    }
  }

  destroy(): void {
    this.unsub();
    this.current?.dispose?.();
  }
}
