/**
 * The reusable component primitives shared by the Floating and Bar dialers.
 * Each factory returns `{ el, …handle }` — a DOM node plus a tiny imperative
 * API — so the view can update text/state in place without re-rendering (which
 * keeps focus, animations, and caret position intact).
 */
import { h, uid } from "./dom";
import { icon } from "./icons";

// ── Button ──────────────────────────────────────────────────────────────────
export type ButtonVariant =
  | "primary"
  | "call"
  | "secondary"
  | "ghost"
  | "danger";

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  block?: boolean;
  large?: boolean;
  icon?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

export interface ButtonHandle {
  el: HTMLButtonElement;
  setLoading(on: boolean, label?: string): void;
  setDisabled(on: boolean): void;
  setLabel(text: string): void;
}

export function button(opts: ButtonOptions): ButtonHandle {
  const labelEl = h("span", { text: opts.label });
  const cls = ["rg-btn", `rg-btn--${opts.variant ?? "secondary"}`];
  if (opts.block) cls.push("rg-btn--block");
  if (opts.large) cls.push("rg-btn--lg");

  const el = h(
    "button",
    {
      class: cls.join(" "),
      type: "button",
      disabled: opts.disabled,
      attrs: opts.ariaLabel ? { "aria-label": opts.ariaLabel } : {},
      on: { click: () => opts.onClick?.() },
    },
    opts.icon ? icon(opts.icon, 18) : null,
    labelEl,
  ) as HTMLButtonElement;

  let restoreLabel = opts.label;
  return {
    el,
    setLabel(text) {
      restoreLabel = text;
      labelEl.textContent = text;
    },
    setDisabled(on) {
      el.disabled = on;
    },
    setLoading(on, label) {
      el.disabled = on;
      el.setAttribute("aria-busy", on ? "true" : "false");
      const existing = el.querySelector(".rg-spinner");
      if (on) {
        if (!existing) {
          el.insertBefore(
            h("span", {
              class:
                "rg-spinner" +
                (opts.variant === "primary" ||
                opts.variant === "call" ||
                opts.variant === "danger"
                  ? " rg-spinner--on-primary"
                  : ""),
            }),
            el.firstChild,
          );
        }
        if (label) labelEl.textContent = label;
      } else {
        existing?.remove();
        labelEl.textContent = restoreLabel;
      }
    },
  };
}

// ── Icon button ─────────────────────────────────────────────────────────────
export interface IconButtonOptions {
  icon: string;
  label: string; // accessible name (also the tooltip)
  size?: number;
  muted?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function iconButton(opts: IconButtonOptions): HTMLButtonElement {
  const el = h("button", {
    class: "rg-iconbtn" + (opts.muted ? " rg-iconbtn--muted" : ""),
    type: "button",
    title: opts.label,
    disabled: opts.disabled,
    attrs: {
      "aria-label": opts.label,
      ...(opts.pressed !== undefined
        ? { "aria-pressed": String(opts.pressed) }
        : {}),
    },
    on: { click: () => opts.onClick?.() },
  }) as HTMLButtonElement;
  el.appendChild(icon(opts.icon, opts.size ?? 20));
  return el;
}

// ── Field + text input ──────────────────────────────────────────────────────
export interface FieldOptions {
  label?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  icon?: string;
  inputMode?: string;
  autocomplete?: string;
  ariaLabel?: string;
  onInput?: (value: string) => void;
  onEnter?: () => void;
}

export interface FieldHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  value(): string;
  setValue(v: string): void;
  setInvalid(message: string | null): void;
  focus(): void;
}

export function field(opts: FieldOptions): FieldHandle {
  const inputId = uid("rg-in");
  const hintId = uid("rg-hint");
  const input = h("input", {
    class: "rg-input",
    id: inputId,
    type: opts.type ?? "text",
    placeholder: opts.placeholder ?? "",
    value: opts.value ?? "",
    attrs: {
      inputmode: opts.inputMode ?? "",
      autocomplete: opts.autocomplete ?? "off",
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      "aria-label": opts.ariaLabel ?? opts.label ?? "",
    },
    on: {
      input: () => opts.onInput?.(input.value),
      keydown: (ev) => {
        if ((ev as KeyboardEvent).key === "Enter") opts.onEnter?.();
      },
    },
  }) as HTMLInputElement;

  const wrap = h(
    "div",
    { class: "rg-inputwrap" },
    opts.icon
      ? h("span", { class: "rg-inputwrap__icon" }, icon(opts.icon, 18))
      : null,
    input,
  );
  const hint = h("div", { class: "rg-hint", id: hintId, hidden: true });

  const el = h(
    "div",
    { class: "rg-field" },
    opts.label
      ? h("label", { class: "rg-label", attrs: { for: inputId } }, opts.label)
      : null,
    wrap,
    hint,
  );

  return {
    el,
    input,
    value: () => input.value,
    setValue(v) {
      input.value = v;
    },
    setInvalid(message) {
      wrap.classList.toggle("rg-inputwrap--invalid", !!message);
      hint.classList.toggle("rg-hint--error", !!message);
      input.setAttribute("aria-invalid", message ? "true" : "false");
      if (message) {
        hint.hidden = false;
        hint.textContent = "";
        hint.appendChild(icon("alert", 13));
        hint.appendChild(h("span", { text: message }));
        input.setAttribute("aria-describedby", hintId);
      } else {
        hint.hidden = true;
        input.removeAttribute("aria-describedby");
      }
    },
    focus: () => input.focus(),
  };
}

// ── Phone input ─────────────────────────────────────────────────────────────
const E164 = /^\+[1-9]\d{6,14}$/;

/** Keep only a leading "+" and digits — tolerant of spaces, dashes, parens. */
export function sanitizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return (hasPlus ? "+" : "") + digits;
}

export interface PhoneHandle extends FieldHandle {
  e164(): string;
  isValid(): boolean;
}

export function phoneInput(
  opts: FieldOptions & { onValidityChange?: (ok: boolean) => void },
): PhoneHandle {
  const base = field({
    ...opts,
    type: "tel",
    inputMode: "tel",
    autocomplete: "tel",
    icon: opts.icon ?? "phone",
    onInput: (v) => {
      const clean = sanitizePhone(v);
      if (clean !== v) {
        const pos = base.input.selectionStart ?? clean.length;
        base.input.value = clean;
        try {
          base.input.setSelectionRange(
            pos - (v.length - clean.length),
            pos - (v.length - clean.length),
          );
        } catch {
          /* ignore */
        }
      }
      opts.onInput?.(clean);
      opts.onValidityChange?.(E164.test(clean));
    },
  });
  return {
    ...base,
    e164: () => sanitizePhone(base.value()),
    isValid: () => E164.test(sanitizePhone(base.value())),
  };
}

// ── Avatar ──────────────────────────────────────────────────────────────────
export function initialsFrom(
  name?: string | null,
  email?: string | null,
): string {
  const source = (name ?? "").trim() || (email ?? "").trim();
  if (!source) return "?";
  if (source.includes("@")) return source[0]!.toUpperCase();
  const parts = source.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (a + b).toUpperCase() || "?";
}

export function avatar(opts: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}): HTMLElement {
  const cls =
    "rg-avatar" +
    (opts.size === "lg"
      ? " rg-avatar--lg"
      : opts.size === "sm"
        ? " rg-avatar--sm"
        : "");
  if (opts.imageUrl) {
    const img = h("img", {
      attrs: {
        src: opts.imageUrl,
        alt: "",
        loading: "lazy",
        decoding: "async",
      },
    });
    // Fall back to initials if the image fails to load.
    const el = h("span", { class: cls, attrs: { "aria-hidden": "true" } }, img);
    img.addEventListener("error", () => {
      el.textContent = initialsFrom(opts.name, opts.email);
    });
    return el;
  }
  return h(
    "span",
    { class: cls, attrs: { "aria-hidden": "true" } },
    initialsFrom(opts.name, opts.email),
  );
}

// ── Badge / status dot ──────────────────────────────────────────────────────
export function badge(
  text: string,
  tone: "neutral" | "brand" | "danger" | "warning" = "neutral",
  withDot?: "ready" | "live" | "danger" | "warn",
): HTMLElement {
  const map = {
    neutral: "",
    brand: " rg-badge--brand",
    danger: " rg-badge--danger",
    warning: " rg-badge--warning",
  };
  return h(
    "span",
    { class: "rg-badge" + map[tone] },
    withDot ? statusDot(withDot) : null,
    h("span", { text }),
  );
}

export function statusDot(
  kind: "idle" | "ready" | "live" | "danger" | "warn",
): HTMLElement {
  const suffix = kind === "idle" ? "" : ` rg-dot--${kind}`;
  return h("span", {
    class: "rg-dot" + suffix,
    attrs: { "aria-hidden": "true" },
  });
}

// ── Spinner / loading block ─────────────────────────────────────────────────
export function spinner(onPrimary = false): HTMLElement {
  return h("span", {
    class: "rg-spinner" + (onPrimary ? " rg-spinner--on-primary" : ""),
    attrs: { role: "status", "aria-label": "Cargando" },
  });
}

export function loadingBlock(label: string): HTMLElement {
  return h(
    "div",
    { class: "rg-loading", attrs: { role: "status", "aria-live": "polite" } },
    spinner(),
    h("span", { class: "rg-loading__label", text: label }),
  );
}

// ── Inline error banner ─────────────────────────────────────────────────────
export function errorBanner(opts: {
  title: string;
  message: string;
  tone?: "error" | "warning";
  actionLabel?: string;
  onAction?: () => void;
}): HTMLElement {
  return h(
    "div",
    {
      class: "rg-error" + (opts.tone === "warning" ? " rg-error--warning" : ""),
      role: "alert",
      attrs: { "aria-live": "assertive" },
    },
    h(
      "span",
      { class: "rg-error__icon" },
      icon(opts.tone === "warning" ? "info" : "alert", 18),
    ),
    h(
      "div",
      { class: "rg-error__body" },
      h("div", { class: "rg-error__title", text: opts.title }),
      h("div", { class: "rg-error__msg", text: opts.message }),
      opts.actionLabel && opts.onAction
        ? h("button", {
            class: "rg-btn rg-btn--ghost rg-error__action",
            type: "button",
            text: opts.actionLabel,
            on: { click: () => opts.onAction?.() },
          })
        : null,
    ),
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
export function emptyState(iconName: string, text: string): HTMLElement {
  return h(
    "div",
    { class: "rg-empty" },
    icon(iconName, 24),
    h("span", { text }),
  );
}
