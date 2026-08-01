/**
 * Telephone keypad. Emits the pressed key on click and on physical-keyboard
 * entry when focused (0-9, *, #, and "+" long-press on 0). Reused for both
 * building a number pre-call and sending DTMF mid-call.
 */
import { h } from "./dom";

const KEYS: Array<{ d: string; s?: string }> = [
  { d: "1" },
  { d: "2", s: "ABC" },
  { d: "3", s: "DEF" },
  { d: "4", s: "GHI" },
  { d: "5", s: "JKL" },
  { d: "6", s: "MNO" },
  { d: "7", s: "PQRS" },
  { d: "8", s: "TUV" },
  { d: "9", s: "WXYZ" },
  { d: "*" },
  { d: "0", s: "+" },
  { d: "#" },
];

export function keypad(onDigit: (digit: string) => void): HTMLElement {
  const grid = h("div", {
    class: "rg-keypad",
    role: "group",
    attrs: { "aria-label": "Teclado numérico" },
  });

  for (const key of KEYS) {
    const btn = h(
      "button",
      {
        class: "rg-key",
        type: "button",
        attrs: { "aria-label": key.d === "0" ? "0 más" : key.d },
        on: { click: () => onDigit(key.d) },
      },
      h("span", { class: "rg-key__d", text: key.d }),
      h("span", { class: "rg-key__s", text: key.s ?? "" }),
    );
    // Long-press 0 → "+"
    if (key.d === "0") {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const start = () => {
        timer = setTimeout(() => {
          onDigit("+");
          timer = null;
        }, 450);
      };
      const cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", cancel);
      btn.addEventListener("pointerleave", cancel);
    }
    grid.appendChild(btn);
  }
  return grid;
}
