/**
 * The inline Dialer Bar: a single compact row that drops into any CRM toolbar
 * and adapts to its container width via `@container` queries (word-mark → caller
 * ID → secondary controls collapse as it narrows; contact, timer and Hangup are
 * never hidden). It shares the exact {@link DialerModel}, components and error
 * copy with the Floating dialer, so the two surfaces stay identical in behavior.
 * Banners float above the bar so its own height never jumps.
 */
import { h, replaceChildren, raf } from "./dom";
import { icon } from "./icons";
import {
  button,
  field,
  phoneInput,
  errorBanner,
  spinner,
  type PhoneHandle,
} from "./components";
import { otpInput } from "./otp-input";
import { keypad } from "./keypad";
import { callerIdSelector } from "./caller-id-selector";
import { callTimer, callControls, contactSummary } from "./call-components";
import { formatPhone } from "./format";
import { actionLabel } from "./strings";
import type { DialerModel, ScreenKey } from "./dialer-model";
import type { Screen } from "./screens";

export class BarView {
  readonly el: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly main: HTMLElement;
  private readonly bannerHost: HTMLElement;
  private readonly live: HTMLElement;
  private current: Screen | null = null;
  private currentKey: ScreenKey | null = null;
  private unsub: () => void;

  constructor(private readonly model: DialerModel) {
    this.main = h("div", { class: "rg-bar__main" });
    this.bannerHost = h("div", { hidden: true });
    this.live = h("div", {
      class: "rg-sr",
      attrs: { "aria-live": "polite", "aria-atomic": "true", role: "status" },
    });

    this.bar = h(
      "div",
      { class: "rg-bar", role: "group", attrs: { "aria-label": model.s.brand } },
      this.main,
    );

    this.el = h(
      "div",
      { class: "rg-bar-host", style: { position: "relative" } },
      this.bannerHost,
      this.bar,
      this.live,
    );

    this.render("screen");
    this.unsub = model.subscribe((reason) => this.render(reason));
  }

  private render(reason: "screen" | "patch"): void {
    const key = this.model.screen;
    if (reason === "screen" || key !== this.currentKey || !this.current) {
      this.current?.dispose?.();
      this.current = this.build(key);
      this.currentKey = key;
      replaceChildren(this.main, this.current.el);
      raf(() => this.current?.focus?.());
    } else {
      this.current.update(this.model);
    }
    this.renderBanner();
  }

  private renderBanner(): void {
    const b = this.model.banner;
    // The email/otp screens render their own inline validation; keep the
    // floating banner for actionable call/session errors only.
    if (!b || this.currentKey === "email" || this.currentKey === "otp") {
      this.bannerHost.hidden = true;
      replaceChildren(this.bannerHost);
      return;
    }
    this.bannerHost.hidden = false;
    const wrap = h(
      "div",
      {
        class: "rg-bar-popover",
        style: { left: "0", right: "0", width: "auto", bottom: "calc(100% + 8px)" },
      },
      errorBanner({
        title: b.title,
        message: b.message,
        tone: b.tone,
        actionLabel: b.action !== "none" ? actionLabel(b.action, this.model.s) : undefined,
        onAction: b.action !== "none" ? () => this.model.handleAction(b.action) : undefined,
      }),
    );
    replaceChildren(this.bannerHost, wrap);
  }

  private build(key: ScreenKey): Screen {
    switch (key) {
      case "loading":
        return this.barLoading();
      case "fatal":
        return this.barFatal();
      case "email":
        return this.barEmail();
      case "otp":
        return this.barOtp();
      case "calling":
        return this.barCalling();
      case "incall":
        return this.barIncall();
      case "ended":
        return this.barEnded();
      default:
        return this.barReady();
    }
  }

  destroy(): void {
    this.unsub();
    this.current?.dispose?.();
  }

  // ── Bar screens ───────────────────────────────────────────────────────────
  private barLoading(): Screen {
    const label = h("span", { class: "rg-loading__label", text: this.model.loadingLabel });
    const el = h("div", { class: "rg-row", attrs: { role: "status" } }, spinner(), label);
    return { el, update: (m) => (label.textContent = m.loadingLabel) };
  }

  private barFatal(): Screen {
    const el = h(
      "div",
      { class: "rg-row rg-grow", style: { justifyContent: "space-between" } },
      h(
        "span",
        { class: "rg-row", style: { color: "var(--ringee-danger)", minWidth: "0" } },
        icon("alert", 18),
        h("span", { class: "rg-contact__name", text: this.model.banner?.title ?? this.model.s.genericErrorTitle }),
      ),
      button({ label: this.model.s.actionReload, variant: "secondary", icon: "refresh", onClick: () => this.model.handleAction("reload") }).el,
    );
    return { el, update: () => undefined };
  }

  private barEmail(): Screen {
    const s = this.model.s;
    const emailField = field({
      placeholder: s.emailPlaceholder,
      value: this.model.email,
      icon: "mail",
      ariaLabel: s.emailLabel,
      type: "email",
      inputMode: "email",
      autocomplete: "email",
      onInput: (v) => {
        this.model.setEmail(v);
        emailField.setInvalid(null);
      },
      onEnter: () => void this.model.sendCode(),
    });
    const send = button({
      label: s.sendCode,
      variant: "primary",
      icon: "mail",
      onClick: () => void this.model.sendCode(),
    });
    const el = h(
      "div",
      { class: "rg-bar__main" },
      h("div", { class: "rg-bar__field" }, emailField.el),
      send.el,
    );
    return {
      el,
      focus: () => emailField.focus(),
      update: (m) => {
        send.setLoading(m.authState === "sending_code", m.s.sending);
        if (m.banner && m.banner.action === "none") emailField.setInvalid(m.banner.message);
      },
    };
  }

  private barOtp(): Screen {
    const s = this.model.s;
    const otp = otpInput({
      onComplete: (code) => void this.model.verify(code),
      onChange: () => otp.setInvalid(false),
    });
    const verify = button({ label: s.verify, variant: "primary", onClick: () => void this.model.verify(otp.value()) });
    const change = h("button", {
      class: "rg-iconbtn",
      type: "button",
      title: s.changeEmail,
      attrs: { "aria-label": s.changeEmail, "data-collapse": "secondary" },
      on: { click: () => this.model.changeEmail() },
    });
    change.appendChild(icon("arrowLeft", 18));

    const el = h(
      "div",
      { class: "rg-bar__main" },
      change,
      h(
        "span",
        { class: "rg-contact__num", attrs: { "data-collapse": "callerid" }, style: { flex: "none" } },
        formatPhone(this.model.challenge?.maskedEmail ?? "") || (this.model.challenge?.maskedEmail ?? ""),
      ),
      h("div", { class: "rg-grow", style: { maxWidth: "230px" } }, otp.el),
      verify.el,
    );
    let lastNonce = this.model.otpInvalidNonce;
    return {
      el,
      focus: () => otp.focus(),
      update: (m) => {
        verify.setLoading(m.authState === "verifying", m.s.verifying);
        otp.setDisabled(m.authState === "verifying");
        if (m.otpInvalidNonce !== lastNonce) {
          lastNonce = m.otpInvalidNonce;
          otp.setInvalid(true);
        }
      },
    };
  }

  private barReady(): Screen {
    const s = this.model.s;
    let phone: PhoneHandle;
    const callBtn = button({
      label: s.callButton,
      variant: "call",
      icon: "phone",
      disabled: true,
      onClick: () => void this.model.placeCall(),
    });

    phone = phoneInput({
      placeholder: s.numberPlaceholder,
      value: this.model.number,
      ariaLabel: s.numberLabel,
      onInput: (v) => this.model.setNumber(v),
      onValidityChange: (ok) => callBtn.setDisabled(!ok),
      onEnter: () => {
        if (phone.isValid()) void this.model.placeCall();
      },
    });

    // Contact chip when a CRM contact is attached; otherwise the phone field.
    const primary = this.model.contact
      ? h(
          "div",
          { class: "rg-bar__field", style: { display: "flex", alignItems: "center" } },
          contactSummary({
            name: this.model.contact.name,
            number: this.model.contact.number ?? this.model.number,
            imageUrl: this.model.contact.imageUrl,
            fallbackName: s.unknownContact,
            size: "sm",
          }),
        )
      : h("div", { class: "rg-bar__field" }, phone.el);

    const caller =
      this.model.callerIds.length > 0
        ? h(
            "div",
            { attrs: { "data-collapse": "callerid" }, style: { flex: "0 1 170px", minWidth: "0" } },
            callerIdSelector({
              callerIds: this.model.callerIds,
              autoLabel: s.callerIdAuto,
              capLabel: s.callerIdLabel,
              selectedId: this.model.selectedCallerId,
              onSelect: (id) => this.model.setCallerId(id),
            }).el,
          )
        : null;

    const el = h("div", { class: "rg-bar__main" }, primary, caller, callBtn.el);
    if (!this.model.contact) callBtn.setDisabled(!phone.isValid());
    else callBtn.setDisabled(false);

    return {
      el,
      focus: () => {
        if (!this.model.contact) phone.focus();
      },
      update: (m) => callBtn.setLoading(m.dialerState === "dialing", m.s.preparingCall),
    };
  }

  private barCalling(): Screen {
    const s = this.model.s;
    const call = this.model.activeCall;
    const state = h("span", { class: "rg-badge rg-badge--brand", attrs: { "data-collapse": "callerid" } });
    const el = h(
      "div",
      { class: "rg-bar__main" },
      contactSummary({
        name: this.model.contact?.name,
        number: call?.to ?? this.model.number,
        imageUrl: this.model.contact?.imageUrl,
        fallbackName: s.unknownContact,
        size: "sm",
      }),
      state,
      h(
        "button",
        {
          class: "rg-ctl rg-ctl--danger",
          type: "button",
          title: s.cancel,
          attrs: { "aria-label": s.cancel },
          style: { flexDirection: "row" },
          on: { click: () => void this.model.hangup() },
        },
        h("span", { class: "rg-ctl__btn" }, icon("phoneOff", 20)),
      ),
    );
    const render = (m: DialerModel) => {
      const ringing = m.dialerState === "ringing";
      replaceChildren(
        state,
        h("span", { class: "rg-dot rg-dot--live" }),
        h("span", { text: ringing ? s.ringing : s.dialing }),
      );
    };
    render(this.model);
    return { el, update: render };
  }

  private barIncall(): Screen {
    const s = this.model.s;
    const call = this.model.activeCall;
    const timer = callTimer();

    const controls = callControls({
      labels: {
        mute: s.mute, unmute: s.unmute, hold: s.hold, resume: s.resume, keypad: s.keypad, hangup: s.hangup,
      },
      allowHold: this.model.options.allowHold,
      compact: true,
      onToggleMute: () => this.model.toggleMute(),
      onToggleHold: () => void this.model.toggleHold(),
      onToggleKeypad: () => togglePad(),
      onHangup: () => void this.model.hangup(),
    });

    // DTMF keypad in a popover above the bar (never grows the row).
    const pad = keypad((d) => this.model.sendDigit(d));
    const padPop = h(
      "div",
      { class: "rg-bar-popover", hidden: true, style: { width: "220px" } },
      pad,
    );
    const togglePad = () => {
      this.model.toggleKeypad();
      padPop.hidden = !this.model.keypadOpen;
      controls.setKeypadOpen(this.model.keypadOpen);
    };
    const onOutside = (ev: Event) => {
      // composedPath pierces the shadow boundary; `ev.target` would otherwise
      // retarget to the host and read every in-bar click as "outside".
      const inside = (ev.composedPath?.() ?? []).includes(el) || el.contains(ev.target as Node);
      if (this.model.keypadOpen && !inside) {
        this.model.setKeypadOpen(false);
        padPop.hidden = true;
        controls.setKeypadOpen(false);
      }
    };
    document.addEventListener("pointerdown", onOutside, true);

    const el = h(
      "div",
      { class: "rg-bar__main", style: { position: "relative" } },
      contactSummary({
        name: this.model.contact?.name,
        number: call?.to ?? this.model.number,
        imageUrl: this.model.contact?.imageUrl,
        fallbackName: s.unknownContact,
        size: "sm",
      }),
      h("span", { class: "rg-bar__sep" }),
      h("span", { class: "rg-timer", style: { flex: "none" } }, timer.el),
      h("span", { class: "rg-header__spacer" }),
      controls.el,
      padPop,
    );

    const render = (m: DialerModel) => {
      const c = m.activeCall;
      controls.setMuted(c?.muted ?? false);
      controls.setHeld(c?.held ?? false);
      controls.setEnabled(m.dialerState !== "ending");
      if (c?.answeredAt) timer.start(c.answeredAt);
    };
    render(this.model);
    if (call?.answeredAt) timer.start(call.answeredAt);
    return {
      el,
      update: render,
      dispose: () => {
        timer.reset();
        document.removeEventListener("pointerdown", onOutside, true);
      },
    };
  }

  private barEnded(): Screen {
    const s = this.model.s;
    const call = this.model.lastEndedCall;
    const failed = call?.state === "error";
    const el = h(
      "div",
      { class: "rg-bar__main" },
      h(
        "span",
        { class: "rg-badge" + (failed ? " rg-badge--danger" : " rg-badge--brand") },
        icon(failed ? "phoneOff" : "check", 15),
        h("span", { text: failed ? s.callFailedTitle : s.callEnded }),
      ),
      contactSummary({
        name: this.model.contact?.name,
        number: call?.to ?? this.model.number,
        imageUrl: this.model.contact?.imageUrl,
        fallbackName: s.unknownContact,
        size: "sm",
      }),
      h("span", { class: "rg-header__spacer" }),
      button({
        label: failed ? s.callAgain : s.newCall,
        variant: "call",
        icon: "phone",
        onClick: () => this.model.newCall(),
      }).el,
    );
    return { el, update: () => undefined };
  }
}
