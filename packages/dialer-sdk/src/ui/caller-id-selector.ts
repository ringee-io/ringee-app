/**
 * Caller-ID picker built as an accessible listbox (button + popup). Keyboard:
 * Enter/Space/↓ open, ↑/↓ move, Enter select, Esc close; a click outside also
 * closes. Selecting "Automatic" yields `undefined`, letting the backend's
 * rotation engine choose the number.
 */
import { h, uid } from "./dom";
import { icon } from "./icons";
import { formatPhone } from "./format";
import type { RingeeCallerId } from "../types";

export interface CallerIdSelectorOptions {
  callerIds: RingeeCallerId[];
  autoLabel: string;
  capLabel: string;
  allowAuto?: boolean;
  /** Currently selected caller-ID id (e.g. restored from a previous session). */
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
}

export interface CallerIdHandle {
  el: HTMLElement;
  selectedId(): string | undefined;
  close(): void;
}

export function callerIdSelector(opts: CallerIdSelectorOptions): CallerIdHandle {
  const listId = uid("rg-cid");
  const options: Array<{ id: string | undefined; label: string; sub?: string }> = [];
  if (opts.allowAuto !== false) options.push({ id: undefined, label: opts.autoLabel });
  for (const c of opts.callerIds) {
    options.push({
      id: c.id,
      label: formatPhone(c.phoneNumber),
      sub: c.isPrimary ? "Principal" : undefined,
    });
  }

  // Default: the primary number, else auto, else first.
  const primary = opts.callerIds.find((c) => c.isPrimary);
  const fallback: string | undefined =
    opts.allowAuto === false ? primary?.id ?? opts.callerIds[0]?.id : undefined;
  // Honor a restored selection when it still maps to an available option.
  let selected: string | undefined =
    opts.selectedId != null && options.some((o) => o.id === opts.selectedId)
      ? opts.selectedId
      : fallback;
  let activeIndex = Math.max(0, options.findIndex((o) => o.id === selected));
  let open = false;

  const valueEl = h("span", { class: "rg-select__val" });
  const chev = h("span", { class: "rg-select__chev" }, icon("chevronDown", 16));
  const trigger = h(
    "button",
    {
      class: "rg-select",
      type: "button",
      attrs: {
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "aria-label": opts.capLabel,
      },
    },
    h("span", { class: "rg-inputwrap__icon" }, icon("phone", 16)),
    h(
      "span",
      { class: "rg-select__label" },
      h("span", { class: "rg-select__cap", text: opts.capLabel }),
      valueEl,
    ),
    chev,
  );

  const menu = h("div", {
    class: "rg-menu",
    role: "listbox",
    id: listId,
    hidden: true,
    attrs: { "aria-label": opts.capLabel },
  });

  const optionEls: HTMLElement[] = options.map((o, i) =>
    h(
      "button",
      {
        class: "rg-option",
        type: "button",
        role: "option",
        attrs: { "aria-selected": String(o.id === selected) },
        on: {
          click: () => choose(i),
          mousemove: () => setActive(i),
        },
      },
      h(
        "span",
        { class: "rg-option__num" },
        o.label,
        o.sub ? h("span", { class: "rg-select__cap", style: { marginLeft: "8px" } }, o.sub) : null,
      ),
      h("span", { class: "rg-option__check" }, icon("check", 16)),
    ),
  );
  optionEls.forEach((e) => menu.appendChild(e));

  const el = h("div", { class: "rg-field", style: { position: "relative" } }, trigger, menu);

  function renderValue() {
    const opt = options.find((o) => o.id === selected) ?? options[0];
    valueEl.textContent = opt?.label ?? opts.autoLabel;
    optionEls.forEach((e, i) =>
      e.setAttribute("aria-selected", String(options[i]!.id === selected)),
    );
  }

  function setActive(i: number) {
    activeIndex = (i + options.length) % options.length;
    optionEls.forEach((e, k) => e.setAttribute("data-active", String(k === activeIndex)));
    optionEls[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function choose(i: number) {
    selected = options[i]!.id;
    renderValue();
    setOpen(false);
    trigger.focus();
    opts.onSelect?.(selected);
  }

  function setOpen(next: boolean) {
    open = next;
    menu.hidden = !next;
    trigger.setAttribute("aria-expanded", String(next));
    if (next) {
      setActive(Math.max(0, options.findIndex((o) => o.id === selected)));
      document.addEventListener("pointerdown", onOutside, true);
    } else {
      document.removeEventListener("pointerdown", onOutside, true);
    }
  }

  function onOutside(ev: Event) {
    // `ev.target` is retargeted to the shadow host for document-level listeners,
    // so `el.contains(target)` is always false inside the shadow root (it would
    // close the menu on the very click meant to pick an option). composedPath()
    // pierces the shadow boundary and reports the real click path.
    const path = ev.composedPath?.() ?? [];
    if (path.includes(el)) return;
    if (!el.contains(ev.target as Node)) setOpen(false);
  }

  trigger.addEventListener("click", () => setOpen(!open));
  trigger.addEventListener("keydown", (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (!open && (k === "ArrowDown" || k === "Enter" || k === " ")) {
      ev.preventDefault();
      setOpen(true);
    }
  });
  menu.addEventListener("keydown", (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (k === "Escape") {
      setOpen(false);
      trigger.focus();
    } else if (k === "ArrowDown") {
      ev.preventDefault();
      setActive(activeIndex + 1);
    } else if (k === "ArrowUp") {
      ev.preventDefault();
      setActive(activeIndex - 1);
    } else if (k === "Enter" || k === " ") {
      ev.preventDefault();
      choose(activeIndex);
    }
  });

  renderValue();

  return {
    el,
    selectedId: () => selected,
    close: () => setOpen(false),
  };
}
