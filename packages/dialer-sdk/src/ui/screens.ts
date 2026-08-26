/**
 * Card screens for the Floating dialer, one builder per {@link ScreenKey}. Each
 * returns a {@link Screen}: a root element, an in-place `update(model)` for
 * same-screen data changes (banner, button busy state, resend countdown), an
 * optional `dispose()` for timers, and an optional `focus()` the shell calls
 * after mounting so keyboard users land on the primary control.
 */
import { h, replaceChildren } from "./dom";
import { icon } from "./icons";
import {
  button,
  errorBanner,
  field,
  loadingBlock,
  phoneInput,
  avatar,
  type PhoneHandle,
} from "./components";
import { otpInput } from "./otp-input";
import { keypad } from "./keypad";
import { callerIdSelector } from "./caller-id-selector";
import { callTimer, callControls, contactSummary } from "./call-components";
import { formatPhone, formatDuration } from "./format";
import { actionLabel } from "./strings";
import type { DialerModel } from "./dialer-model";

export interface Screen {
  el: HTMLElement;
  update(model: DialerModel): void;
  dispose?(): void;
  focus?(): void;
}

// ── Banner slot (shared) ─────────────────────────────────────────────────────
function bannerSlot() {
  const el = h("div", { hidden: true });
  return {
    el,
    render(model: DialerModel) {
      const b = model.banner;
      if (!b) {
        el.hidden = true;
        replaceChildren(el);
        return;
      }
      el.hidden = false;
      const showAction = b.action !== "none";
      replaceChildren(
        el,
        errorBanner({
          title: b.title,
          message: b.message,
          tone: b.tone,
          actionLabel: showAction ? actionLabel(b.action, model.s) : undefined,
          onAction: showAction ? () => model.handleAction(b.action) : undefined,
        }),
      );
    },
  };
}

function head(title: string, sub?: Node | string) {
  return h(
    "div",
    { class: "rg-screen__head" },
    h("div", { class: "rg-screen__title", text: title }),
    sub != null
      ? typeof sub === "string"
        ? h("div", { class: "rg-screen__sub", text: sub })
        : h("div", { class: "rg-screen__sub" }, sub)
      : null,
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────
export function loadingScreen(model: DialerModel): Screen {
  const block = loadingBlock(model.loadingLabel);
  const el = h("div", { class: "rg-screen" }, block);
  return {
    el,
    update(m) {
      const label = block.querySelector(".rg-loading__label");
      if (label) label.textContent = m.loadingLabel;
    },
  };
}

// ── Fatal (blocking) ─────────────────────────────────────────────────────────
export function fatalScreen(model: DialerModel): Screen {
  const slot = bannerSlot();
  const el = h(
    "div",
    { class: "rg-screen" },
    h(
      "div",
      { class: "rg-center", style: { padding: "8px 0" } },
      h(
        "span",
        {
          class: "rg-avatar rg-avatar--lg",
          style: {
            background: "var(--rg-danger-soft)",
            color: "var(--ringee-danger)",
          },
          attrs: { "aria-hidden": "true" },
        },
        icon("alert", 28),
      ),
    ),
    slot.el,
    button({
      label: model.s.actionReload,
      variant: "secondary",
      block: true,
      icon: "refresh",
      onClick: () => model.handleAction("reload"),
    }).el,
  );
  slot.render(model);
  return { el, update: () => slot.render(model) };
}

// ── Email ────────────────────────────────────────────────────────────────────
export function emailScreen(model: DialerModel): Screen {
  const slot = bannerSlot();
  const emailField = field({
    label: model.s.emailLabel,
    type: "email",
    placeholder: model.s.emailPlaceholder,
    value: model.email,
    icon: "mail",
    inputMode: "email",
    autocomplete: "email",
    onInput: (v) => {
      model.setEmail(v);
      emailField.setInvalid(null);
    },
    onEnter: () => submit(),
  });

  const submitBtn = button({
    label: model.s.sendCode,
    variant: "primary",
    block: true,
    large: true,
    icon: "mail",
    onClick: () => submit(),
  });

  const submit = () => {
    void model.sendCode();
  };

  const note = h(
    "div",
    { class: "rg-hint", style: { marginTop: "2px" } },
    icon("shield", 14),
    h("span", { text: model.s.emailSecurityNote }),
  );

  const el = h(
    "div",
    { class: "rg-screen" },
    head(model.s.emailTitle, model.s.emailSubtitle),
    slot.el,
    emailField.el,
    submitBtn.el,
    note,
  );

  slot.render(model);

  return {
    el,
    focus: () => emailField.focus(),
    update(m) {
      slot.render(m);
      submitBtn.setLoading(m.authState === "sending_code", m.s.sending);
    },
  };
}

// ── OTP ──────────────────────────────────────────────────────────────────────
export function otpScreen(model: DialerModel): Screen {
  const slot = bannerSlot();
  const masked = model.challenge?.maskedEmail ?? model.email;

  const otp = otpInput({
    onComplete: (code) => void model.verify(code),
    onChange: () => otp.setInvalid(false),
  });

  const verifyBtn = button({
    label: model.s.verify,
    variant: "primary",
    block: true,
    large: true,
    onClick: () => void model.verify(otp.value()),
  });

  const resendBtn = h("button", {
    class: "rg-btn rg-btn--ghost",
    type: "button",
    text: model.s.resend,
    on: { click: () => void model.resend() },
  }) as HTMLButtonElement;

  const changeBtn = h("button", {
    class: "rg-btn rg-btn--ghost",
    type: "button",
    text: model.s.changeEmail,
    on: { click: () => model.changeEmail() },
  });

  const footer = h(
    "div",
    { class: "rg-row", style: { justifyContent: "space-between" } },
    changeBtn,
    resendBtn,
  );

  const el = h(
    "div",
    { class: "rg-screen" },
    head(
      model.s.otpTitle,
      h("span", { html: model.s.otpSubtitle(`<b>${escapeHtml(masked)}</b>`) }),
    ),
    slot.el,
    otp.el,
    verifyBtn.el,
    footer,
  );

  slot.render(model);
  let lastNonce = model.otpInvalidNonce;

  // Resend countdown, refreshed once a second.
  const tickResend = () => {
    const at = model.challenge?.resendAvailableAt?.getTime() ?? 0;
    const secs = Math.max(0, Math.ceil((at - Date.now()) / 1000));
    if (secs > 0) {
      resendBtn.disabled = true;
      resendBtn.textContent = model.s.resendIn(secs);
    } else {
      resendBtn.disabled = false;
      resendBtn.textContent = model.s.resend;
    }
  };
  tickResend();
  const interval = setInterval(tickResend, 1000);

  return {
    el,
    focus: () => otp.focus(),
    dispose: () => clearInterval(interval),
    update(m) {
      slot.render(m);
      verifyBtn.setLoading(m.authState === "verifying", m.s.verifying);
      otp.setDisabled(m.authState === "verifying");
      if (m.otpInvalidNonce !== lastNonce) {
        lastNonce = m.otpInvalidNonce;
        otp.setInvalid(true);
      }
      tickResend();
    },
  };
}

// ── Ready ────────────────────────────────────────────────────────────────────
export function readyScreen(model: DialerModel): Screen {
  const slot = bannerSlot();
  let phone: PhoneHandle;

  const callBtn = button({
    label: model.s.callButton,
    variant: "call",
    block: true,
    large: true,
    icon: "phone",
    disabled: true,
    onClick: () => void model.placeCall(),
  });

  phone = phoneInput({
    label: model.s.numberLabel,
    placeholder: model.s.numberPlaceholder,
    value: model.number,
    onInput: (v) => model.setNumber(v),
    onValidityChange: (ok) => callBtn.setDisabled(!ok),
    onEnter: () => {
      if (phone.isValid()) void model.placeCall();
    },
  });

  // Optional CRM contact context.
  const contextBox = model.contact
    ? h(
        "div",
        {
          style: {
            padding: "10px 12px",
            background: "var(--ringee-surface)",
            borderRadius: "var(--rg-radius-md)",
            border: "1px solid var(--ringee-border)",
          },
        },
        contactSummary({
          name: model.contact.name,
          number: model.contact.number ?? model.number,
          imageUrl: model.contact.imageUrl,
          fallbackName: model.s.unknownContact,
        }),
      )
    : null;

  // Collapsible keypad that feeds the number field.
  const pad = keypad((d) => {
    if (d === "+" && phone.value().includes("+")) return;
    phone.setValue(phone.value() + d);
    model.setNumber(phone.value());
    callBtn.setDisabled(!phone.isValid());
  });
  const padWrap = h(
    "div",
    { hidden: !model.keypadOpen, style: { marginTop: "2px" } },
    pad,
  );

  const keypadToggle = h(
    "button",
    {
      class: "rg-iconbtn",
      type: "button",
      title: model.s.keypadToggle,
      attrs: {
        "aria-label": model.s.keypadToggle,
        "aria-pressed": String(model.keypadOpen),
      },
      on: {
        click: () => {
          model.toggleKeypad();
          padWrap.hidden = !model.keypadOpen;
          keypadToggle.setAttribute("aria-pressed", String(model.keypadOpen));
        },
      },
    },
    icon("grid", 20),
  );

  const numberRow = h(
    "div",
    { class: "rg-row", style: { alignItems: "flex-end" } },
    h("div", { class: "rg-grow" }, phone.el),
    keypadToggle,
  );

  const callerSel =
    model.callerIds.length > 0
      ? callerIdSelector({
          callerIds: model.callerIds,
          autoLabel: model.s.callerIdAuto,
          capLabel: model.s.callerIdLabel,
          selectedId: model.selectedCallerId,
          onSelect: (id) => model.setCallerId(id),
        }).el
      : null;

  const el = h(
    "div",
    { class: "rg-screen" },
    slot.el,
    contextBox,
    numberRow,
    padWrap,
    callerSel,
    callBtn.el,
  );

  slot.render(model);
  // Initial validity.
  callBtn.setDisabled(!phone.isValid());

  return {
    el,
    focus: () => {
      if (!model.contact) phone.focus();
    },
    update(m) {
      slot.render(m);
      callBtn.setLoading(m.dialerState === "dialing", m.s.preparingCall);
    },
  };
}

// ── Calling (dialing / ringing) ──────────────────────────────────────────────
export function callingScreen(model: DialerModel): Screen {
  const stateLine = h("span", { class: "rg-callstage__state" });
  const call = model.activeCall;
  const name = (model.contact?.name ?? "").trim();
  const number = call?.to ?? model.number;

  const el = h(
    "div",
    { class: "rg-screen", style: { alignItems: "stretch" } },
    h(
      "div",
      { class: "rg-callstage" },
      h(
        "span",
        { class: "rg-halo" },
        avatar({
          name: name || null,
          imageUrl: model.contact?.imageUrl,
          size: "lg",
        }),
      ),
      h("div", {
        class: "rg-callstage__name",
        text: name || model.s.unknownContact,
      }),
      h("div", { class: "rg-callstage__num", text: formatPhone(number) }),
      stateLine,
    ),
    h(
      "div",
      { class: "rg-callctl", style: { marginTop: "6px" } },
      cancelControl(model),
    ),
  );

  const render = (m: DialerModel) => {
    const ringing = m.dialerState === "ringing";
    replaceChildren(
      stateLine,
      h("span", { class: "rg-dot rg-dot--live" }),
      h("span", { text: ringing ? m.s.ringing : m.s.dialing }),
    );
    stateLine.setAttribute("aria-label", ringing ? m.s.ringing : m.s.dialing);
  };
  render(model);

  return { el, update: render };
}

function cancelControl(model: DialerModel): HTMLElement {
  return h(
    "button",
    {
      class: "rg-ctl rg-ctl--danger",
      type: "button",
      title: model.s.cancel,
      attrs: { "aria-label": model.s.cancel },
      on: { click: () => void model.hangup() },
    },
    h("span", { class: "rg-ctl__btn" }, icon("phoneOff", 22)),
    h("span", { class: "rg-ctl__label", text: model.s.cancel }),
  );
}

// ── In-call (active / held / ending) ─────────────────────────────────────────
export function incallScreen(model: DialerModel): Screen {
  const slot = bannerSlot();
  const timer = callTimer();
  const stateLine = h("span", {
    class: "rg-callstage__state rg-callstage__state--live",
  });
  const call = model.activeCall;
  const name = (model.contact?.name ?? "").trim();

  const controls = callControls({
    labels: {
      mute: model.s.mute,
      unmute: model.s.unmute,
      hold: model.s.hold,
      resume: model.s.resume,
      keypad: model.s.keypad,
      hangup: model.s.hangup,
    },
    allowHold: model.options.allowHold,
    onToggleMute: () => model.toggleMute(),
    onToggleHold: () => void model.toggleHold(),
    onToggleKeypad: () => {
      model.toggleKeypad();
      syncKeypad(model);
    },
    onHangup: () => void model.hangup(),
  });

  const dtmfPad = keypad((d) => model.sendDigit(d));
  const padWrap = h(
    "div",
    { hidden: true, style: { marginTop: "4px" } },
    dtmfPad,
  );

  const el = h(
    "div",
    { class: "rg-screen", style: { alignItems: "stretch" } },
    slot.el,
    h(
      "div",
      { class: "rg-callstage" },
      avatar({
        name: name || null,
        imageUrl: model.contact?.imageUrl,
        size: "lg",
      }),
      h("div", {
        class: "rg-callstage__name",
        text: name || model.s.unknownContact,
      }),
      h("div", {
        class: "rg-callstage__num",
        text: formatPhone(call?.to ?? model.number),
      }),
      stateLine,
    ),
    h(
      "div",
      { style: { display: "flex", justifyContent: "center", margin: "2px 0" } },
      timer.el,
    ),
    controls.el,
    padWrap,
  );

  const syncKeypad = (m: DialerModel) => {
    padWrap.hidden = !m.keypadOpen;
    controls.setKeypadOpen(m.keypadOpen);
  };

  const render = (m: DialerModel) => {
    slot.render(m);
    const c = m.activeCall;
    const held = c?.held ?? false;
    const ending = m.dialerState === "ending";
    controls.setMuted(c?.muted ?? false);
    controls.setHeld(held);
    controls.setEnabled(!ending);
    syncKeypad(m);

    const label = ending ? m.s.ending : held ? m.s.onHold : m.s.inCall;
    replaceChildren(
      stateLine,
      h("span", { class: "rg-dot rg-dot--live" }),
      h("span", { text: label }),
    );

    if (c?.answeredAt && m.dialerState === "active" && !held)
      timer.start(c.answeredAt);
    else if (c?.answeredAt)
      timer.start(c.answeredAt); // keep counting while held
    else timer.reset();
  };
  render(model);
  if (call?.answeredAt) timer.start(call.answeredAt);

  return {
    el,
    update: render,
    dispose: () => timer.reset(),
  };
}

// ── Ended ────────────────────────────────────────────────────────────────────
export function endedScreen(model: DialerModel): Screen {
  const call = model.lastEndedCall;
  const failed = call?.state === "error";
  const connected = !!call?.answeredAt;
  const name = (model.contact?.name ?? "").trim();

  const statusIcon = h(
    "span",
    {
      class: "rg-avatar rg-avatar--lg",
      style: failed
        ? { background: "var(--rg-danger-soft)", color: "var(--ringee-danger)" }
        : {
            background: "var(--rg-accent-soft)",
            color: "var(--ringee-accent)",
          },
      attrs: { "aria-hidden": "true" },
    },
    icon(failed ? "phoneOff" : "check", 28),
  );

  const title = failed ? model.s.callFailedTitle : model.s.callEnded;

  const detail = failed
    ? model.s.notConnected
    : connected
      ? `${model.s.duration}: ${formatDuration(call?.durationSeconds ?? 0)}`
      : model.s.notConnected;

  const el = h(
    "div",
    { class: "rg-screen" },
    h(
      "div",
      { class: "rg-callstage" },
      statusIcon,
      h("div", {
        class: "rg-callstage__name",
        text: name || formatPhone(call?.to ?? ""),
      }),
      h("div", { class: "rg-callstage__state", text: title }),
      h(
        "div",
        { class: "rg-badge", style: { marginTop: "6px" } },
        icon("clock", 14),
        h("span", { text: detail }),
      ),
    ),
    button({
      label: failed ? model.s.callAgain : model.s.newCall,
      variant: "call",
      block: true,
      large: true,
      icon: "phone",
      onClick: () => model.newCall(),
    }).el,
  );

  return {
    el,
    update: () => undefined,
  };
}

// ── Screen dispatch ──────────────────────────────────────────────────────────
export function buildScreen(key: string, model: DialerModel): Screen {
  switch (key) {
    case "loading":
      return loadingScreen(model);
    case "fatal":
      return fatalScreen(model);
    case "email":
      return emailScreen(model);
    case "otp":
      return otpScreen(model);
    case "calling":
      return callingScreen(model);
    case "incall":
      return incallScreen(model);
    case "ended":
      return endedScreen(model);
    default:
      return readyScreen(model);
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
