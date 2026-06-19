import { useMemo, useState } from "react";
import { Phone, AlertCircle } from "lucide-react";
import PhoneInput, {
  isPossiblePhoneNumber,
  type Value,
  type Flags,
} from "react-phone-number-input";
import * as flagComponents from "country-flag-icons/react/3x2";
import "react-phone-number-input/style.css";

// Bundle the flag SVGs (vs the library's default CDN images) so the country
// selector works offline and needs no extra network/CSP allowance.
const flags = flagComponents as unknown as Flags;
import { DEFAULT_REGION } from "../lib/region";
import type { RingeeApi } from "../lib/ringee-api";
import { RingeeLogo } from "./ringee-logo";
import { TodayView } from "./today/today-view";

/**
 * The side panel's idle home — a launcher AND a "Today" dashboard, NOT a call
 * UI (the active call is the shared Active Call Modal). It shows who you're
 * signed in as, a dial bar with a country selector (same component as the web
 * app's dialer, so any country works), and the Today feed.
 */
export function Home({
  api,
  userLabel,
  error,
  dncBlocked,
  onDial,
}: {
  api: RingeeApi;
  userLabel?: string;
  error?: string;
  dncBlocked?: boolean;
  onDial: (raw: string, name?: string) => void;
}) {
  // PhoneInput emits an E.164 value directly (country code from the selector),
  // so "any country" works and we never have to guess a region for the input.
  const [value, setValue] = useState<Value | undefined>();
  const valid = useMemo(() => !!value && isPossiblePhoneNumber(value), [value]);

  const submit = () => {
    if (!valid || !value) return;
    onDial(value);
    setValue(undefined);
  };

  return (
    <div className="bg-muted/30 flex h-full flex-col">
      <header className="bg-background flex items-center justify-between px-4 py-4">
        <RingeeLogo className="h-6" />
        {userLabel && (
          <span className="bg-muted text-muted-foreground max-w-[150px] truncate rounded-full px-2.5 py-1 text-xs font-medium">
            {userLabel}
          </span>
        )}
      </header>

      {error && (
        <div
          className={
            "mx-3 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs " +
            (dncBlocked
              ? "border-rose-500/30 bg-rose-500/10 text-rose-600"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700")
          }
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-3">
        <div className="bg-background rounded-xl p-3 shadow-sm">
          <label className="text-muted-foreground mb-1.5 block text-[11px] font-semibold tracking-wide uppercase">
            Quick dial
          </label>
          <div className="flex items-center gap-2">
            <PhoneInput
              international
              defaultCountry={DEFAULT_REGION}
              flags={flags}
              placeholder="Enter number"
              value={value}
              onChange={setValue}
              onKeyDown={(e: React.KeyboardEvent) =>
                e.key === "Enter" && submit()
              }
              className="ringee-phone flex-1"
            />
            <button
              disabled={!valid}
              onClick={submit}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-40 disabled:shadow-none"
              aria-label="Call"
            >
              <Phone className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <TodayView api={api} onCall={onDial} />
    </div>
  );
}
