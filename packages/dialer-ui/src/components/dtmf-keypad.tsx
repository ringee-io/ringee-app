"use client";

import { useState } from "react";
import {
  DTMF_KEY_ROWS,
  DTMF_LETTER_ROWS,
  letterToDtmfDigit,
  playDtmfTone,
} from "@ringee/dialer-core/dtmf";
import { cn } from "@ringee/frontend-shared/lib/utils";

export type DtmfKeypadProps = {
  onSendDTMF: (digit: string) => void;
  className?: string;
};

type KeypadMode = "numbers" | "letters";

type EnteredKey = {
  label: string;
  digit: string;
};

export function DtmfKeypad({ onSendDTMF, className }: DtmfKeypadProps) {
  const [mode, setMode] = useState<KeypadMode>("numbers");
  const [enteredKeys, setEnteredKeys] = useState<EnteredKey[]>([]);

  const pressKey = (label: string) => {
    const digit = mode === "letters" ? letterToDtmfDigit(label) : label;
    if (!digit) return;

    playDtmfTone(digit);
    onSendDTMF(digit);
    setEnteredKeys((current) => [...current, { label, digit }]);
  };

  const hasLetters = enteredKeys.some(({ label, digit }) => label !== digit);

  return (
    <div className={cn("w-64", className)}>
      <div className="bg-muted/60 mb-3 grid grid-cols-2 rounded-md p-1">
        {(["numbers", "letters"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "numbers" ? "123" : "ABC"}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "grid gap-2",
          mode === "numbers" ? "grid-cols-4" : "grid-cols-6",
        )}
      >
        {(mode === "numbers"
          ? DTMF_KEY_ROWS.flat()
          : DTMF_LETTER_ROWS.flat()
        ).map((label) => {
          const digit = mode === "letters" ? letterToDtmfDigit(label) : label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => pressKey(label)}
              aria-label={
                mode === "letters"
                  ? `Send ${label} as DTMF ${digit}`
                  : `Send DTMF ${label}`
              }
              title={mode === "letters" ? `${label} → ${digit}` : undefined}
              className={cn(
                "bg-muted/40 hover:bg-primary hover:text-primary-foreground flex items-center justify-center rounded font-medium transition-all active:scale-90",
                mode === "numbers" ? "h-12 text-xl md:h-14" : "h-9 text-sm",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === "letters" && (
        <p className="text-muted-foreground mt-2 text-center text-[10px] leading-tight">
          Letters are sent as phone keypad digits (ABC → 2).
        </p>
      )}
      {mode === "numbers" && (
        <p className="text-muted-foreground mt-2 text-center text-[10px] leading-tight">
          A–D are special DTMF tones. + is only used when dialing.
        </p>
      )}

      {enteredKeys.length > 0 && (
        <div className="text-primary bg-primary/10 mt-3 rounded px-2 py-1.5 text-center font-mono text-sm font-semibold tracking-widest">
          <div>{enteredKeys.map(({ label }) => label).join(" ")}</div>
          {hasLetters && (
            <div className="text-muted-foreground mt-0.5 text-[10px] tracking-normal">
              DTMF: {enteredKeys.map(({ digit }) => digit).join(" ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
