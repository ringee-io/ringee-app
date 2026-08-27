/**
 * Six-cell one-time-code input. Handles the things a naive version gets wrong:
 * autofocus, auto-advance, backspace-to-previous, full-code paste, iOS/Android
 * SMS autofill (`autocomplete="one-time-code"`), Enter-to-submit, and screen
 * readers (the group is labelled; each cell announces its position). The code
 * is NOT cleared on an invalid attempt — only re-highlighted — so the user can
 * fix a single wrong digit.
 */
import { h, uid } from "./dom";

export interface OtpOptions {
  length?: number;
  onComplete?: (code: string) => void;
  onChange?: (code: string) => void;
}

export interface OtpHandle {
  el: HTMLElement;
  value(): string;
  clear(): void;
  focus(): void;
  setInvalid(on: boolean): void;
  setDisabled(on: boolean): void;
}

export function otpInput(opts: OtpOptions = {}): OtpHandle {
  const length = opts.length ?? 6;
  const groupId = uid("rg-otp");
  const cells: HTMLInputElement[] = [];

  const setFilledFlags = () => {
    for (const c of cells)
      c.setAttribute("data-filled", c.value ? "true" : "false");
  };

  const read = () => cells.map((c) => c.value).join("");

  const emit = () => {
    setFilledFlags();
    const code = read();
    opts.onChange?.(code);
    if (code.length === length && cells.every((c) => c.value)) {
      opts.onComplete?.(code);
    }
  };

  const focusCell = (i: number) => {
    const cell = cells[Math.max(0, Math.min(length - 1, i))];
    cell?.focus();
    cell?.select();
  };

  const fill = (chars: string, from = 0) => {
    const digits = chars
      .replace(/\D/g, "")
      .slice(0, length - from)
      .split("");
    digits.forEach((d, k) => (cells[from + k]!.value = d));
    const next = Math.min(from + digits.length, length - 1);
    focusCell(next);
    emit();
  };

  for (let i = 0; i < length; i++) {
    const cell = h("input", {
      class: "rg-otp__cell",
      type: "text",
      attrs: {
        inputmode: "numeric",
        maxlength: "1",
        // Only the first cell advertises SMS autofill so the browser doesn't
        // scatter a full code across every box.
        autocomplete: i === 0 ? "one-time-code" : "off",
        "aria-label": `Digit ${i + 1} of ${length}`,
        "data-filled": "false",
      },
    }) as HTMLInputElement;

    cell.addEventListener("focus", () => cell.select());

    cell.addEventListener("input", () => {
      const raw = cell.value.replace(/\D/g, "");
      if (raw.length > 1) {
        // Autofill / fast typing dumped several chars into one cell.
        cell.value = "";
        fill(raw, i);
        return;
      }
      cell.value = raw;
      if (raw) focusCell(i + 1);
      emit();
    });

    cell.addEventListener("keydown", (ev) => {
      const key = ev.key;
      if (key === "Backspace") {
        if (cell.value) {
          cell.value = "";
          emit();
        } else if (i > 0) {
          ev.preventDefault();
          cells[i - 1]!.value = "";
          focusCell(i - 1);
          emit();
        }
      } else if (key === "ArrowLeft") {
        ev.preventDefault();
        focusCell(i - 1);
      } else if (key === "ArrowRight") {
        ev.preventDefault();
        focusCell(i + 1);
      } else if (key === "Enter") {
        const code = read();
        if (code.length === length) opts.onComplete?.(code);
      }
    });

    cell.addEventListener("paste", (ev) => {
      ev.preventDefault();
      const text = ev.clipboardData?.getData("text") ?? "";
      fill(text, i);
    });

    cells.push(cell);
  }

  const el = h(
    "div",
    {
      class: "rg-otp",
      role: "group",
      id: groupId,
      attrs: { "aria-label": "6-digit verification code" },
    },
    ...cells,
  );

  return {
    el,
    value: read,
    clear() {
      for (const c of cells) c.value = "";
      setFilledFlags();
      focusCell(0);
    },
    focus: () => focusCell(0),
    setInvalid(on) {
      el.classList.toggle("rg-otp--invalid", on);
      if (on) {
        // Re-trigger the shake if it was already invalid.
        el.classList.remove("rg-otp--invalid");
        void el.offsetWidth;
        el.classList.add("rg-otp--invalid");
        focusCell(0);
      }
    },
    setDisabled(on) {
      for (const c of cells) c.disabled = on;
    },
  };
}
