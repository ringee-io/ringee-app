/**
 * Components that only appear once a call exists: the ticking timer, the
 * contact summary, the primary call controls, and the agent footer menu.
 */
import { h, replaceChildren } from "./dom";
import { icon } from "./icons";
import { avatar } from "./components";
import { formatDuration, formatPhone } from "./format";

// ── Call timer ──────────────────────────────────────────────────────────────
export interface CallTimerHandle {
  el: HTMLElement;
  start(answeredAt: Date): void;
  freeze(seconds: number): void;
  reset(): void;
}

export function callTimer(): CallTimerHandle {
  const el = h("span", {
    class: "rg-timer",
    text: "0:00",
    attrs: { role: "timer", "aria-live": "off" },
  });
  let interval: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (interval) clearInterval(interval);
    interval = null;
  };

  return {
    el,
    start(answeredAt) {
      stop();
      const tick = () => {
        const s = Math.floor((Date.now() - answeredAt.getTime()) / 1000);
        el.textContent = formatDuration(s);
      };
      tick();
      interval = setInterval(tick, 500);
    },
    freeze(seconds) {
      stop();
      el.textContent = formatDuration(seconds);
    },
    reset() {
      stop();
      el.textContent = "0:00";
    },
  };
}

// ── Contact summary ─────────────────────────────────────────────────────────
export function contactSummary(opts: {
  name?: string | null;
  number: string;
  imageUrl?: string | null;
  fallbackName: string;
  size?: "sm" | "md";
}): HTMLElement {
  const displayName = (opts.name ?? "").trim() || opts.fallbackName;
  const showName = !!(opts.name ?? "").trim();
  return h(
    "div",
    { class: "rg-contact" },
    avatar({ name: showName ? opts.name : null, imageUrl: opts.imageUrl, size: opts.size === "sm" ? "sm" : "md" }),
    h(
      "div",
      { class: "rg-contact__meta" },
      h("span", { class: "rg-contact__name", text: displayName }),
      h("span", { class: "rg-contact__num", text: formatPhone(opts.number) }),
    ),
  );
}

// ── Call controls ───────────────────────────────────────────────────────────
export interface CallControlsHandle {
  el: HTMLElement;
  setMuted(on: boolean): void;
  setHeld(on: boolean): void;
  setKeypadOpen(on: boolean): void;
  setEnabled(on: boolean): void;
}

export interface CallControlsOptions {
  labels: {
    mute: string;
    unmute: string;
    hold: string;
    resume: string;
    keypad: string;
    hangup: string;
  };
  allowHold?: boolean;
  compact?: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onToggleKeypad: () => void;
  onHangup: () => void;
}

/** A control: round icon button with a caption below (caption hidden in the Bar). */
function control(opts: {
  icon: string;
  label: string;
  tone?: "call" | "danger";
  pressed?: boolean;
  onClick: () => void;
}): { el: HTMLButtonElement; iconWrap: HTMLElement; caption: HTMLElement } {
  const iconWrap = h("span", { class: "rg-ctl__btn" }, icon(opts.icon, 20));
  const caption = h("span", { class: "rg-ctl__label", text: opts.label });
  const el = h(
    "button",
    {
      class: "rg-ctl" + (opts.tone ? ` rg-ctl--${opts.tone}` : ""),
      type: "button",
      title: opts.label,
      attrs: {
        "aria-label": opts.label,
        ...(opts.pressed !== undefined ? { "aria-pressed": String(opts.pressed) } : {}),
      },
      on: { click: () => opts.onClick() },
    },
    iconWrap,
    caption,
  ) as HTMLButtonElement;
  return { el, iconWrap, caption };
}

export function callControls(opts: CallControlsOptions): CallControlsHandle {
  const mute = control({
    icon: "mic",
    label: opts.labels.mute,
    pressed: false,
    onClick: opts.onToggleMute,
  });
  const keypad = control({
    icon: "grid",
    label: opts.labels.keypad,
    pressed: false,
    onClick: opts.onToggleKeypad,
  });
  const hold = opts.allowHold
    ? control({ icon: "pause", label: opts.labels.hold, pressed: false, onClick: opts.onToggleHold })
    : null;
  const hangup = control({ icon: "phoneOff", label: opts.labels.hangup, tone: "danger", onClick: opts.onHangup });

  const el = h(
    "div",
    { class: "rg-callctl" },
    mute.el,
    keypad.el,
    hold?.el ?? null,
    hangup.el,
  );

  return {
    el,
    setMuted(on) {
      mute.el.setAttribute("aria-pressed", String(on));
      mute.el.setAttribute("aria-label", on ? opts.labels.unmute : opts.labels.mute);
      mute.el.title = on ? opts.labels.unmute : opts.labels.mute;
      replaceChildren(mute.iconWrap, icon(on ? "micOff" : "mic", 20));
      mute.caption.textContent = on ? opts.labels.unmute : opts.labels.mute;
    },
    setHeld(on) {
      if (!hold) return;
      hold.el.setAttribute("aria-pressed", String(on));
      hold.el.setAttribute("aria-label", on ? opts.labels.resume : opts.labels.hold);
      hold.el.title = on ? opts.labels.resume : opts.labels.hold;
      replaceChildren(hold.iconWrap, icon(on ? "play" : "pause", 20));
      hold.caption.textContent = on ? opts.labels.resume : opts.labels.hold;
    },
    setKeypadOpen(on) {
      keypad.el.setAttribute("aria-pressed", String(on));
    },
    setEnabled(on) {
      for (const b of [mute.el, keypad.el, hold?.el, hangup.el]) {
        if (b && !b.classList.contains("rg-ctl--danger")) (b as HTMLButtonElement).disabled = !on;
      }
    },
  };
}

// ── Agent footer menu ───────────────────────────────────────────────────────
export function agentMenu(opts: {
  name: string;
  workspaceLabel: string;
  imageUrl?: string | null;
  signOutLabel: string;
  onSignOut: () => void;
}): HTMLElement {
  const menu = h(
    "div",
    { class: "rg-menu", role: "menu", hidden: true, style: { bottom: "calc(100% + 6px)", top: "auto" } },
    h(
      "button",
      {
        class: "rg-option",
        type: "button",
        role: "menuitem",
        on: { click: () => opts.onSignOut() },
      },
      icon("logout", 16),
      h("span", { class: "rg-option__num", text: opts.signOutLabel }),
    ),
  );

  const trigger = h(
    "button",
    {
      class: "rg-agent",
      type: "button",
      attrs: { "aria-haspopup": "menu", "aria-expanded": "false" },
    },
    avatar({ name: opts.name, imageUrl: opts.imageUrl, size: "sm" }),
    h(
      "span",
      { class: "rg-agent__meta" },
      h("span", { class: "rg-agent__name", text: opts.name }),
      h("span", { class: "rg-agent__ws", text: opts.workspaceLabel }),
    ),
    icon("chevronDown", 16),
  );

  let open = false;
  const setOpen = (next: boolean) => {
    open = next;
    menu.hidden = !next;
    trigger.setAttribute("aria-expanded", String(next));
    if (next) document.addEventListener("pointerdown", onOutside, true);
    else document.removeEventListener("pointerdown", onOutside, true);
  };
  const onOutside = (ev: Event) => {
    if (!wrap.contains(ev.target as Node)) setOpen(false);
  };
  trigger.addEventListener("click", () => setOpen(!open));
  menu.addEventListener("keydown", (ev) => {
    if ((ev as KeyboardEvent).key === "Escape") {
      setOpen(false);
      trigger.focus();
    }
  });

  const wrap = h("div", { style: { position: "relative" } }, trigger, menu);
  return wrap;
}
