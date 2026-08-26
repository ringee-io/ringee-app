import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, ChevronDown, Globe, Phone } from "lucide-react";
import * as flagComponents from "country-flag-icons/react/3x2";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { RingeeApi, WorkspaceNumber } from "../../lib/ringee-api";
import { Sheet } from "../components/sheet";
import { Spinner } from "../components/ui";
import {
  getSelectedCallerId,
  setSelectedCallerId,
  subscribeSelectedCallerId,
} from "../../lib/selected-caller-id";

/**
 * Header "Call from" control. Lets the user pick which of their registered
 * numbers outbound calls go out on; the pick is persisted in local storage and
 * read by the background worker at dial time (see `selected-caller-id.ts`).
 * "Automatic" (null) hands caller-ID resolution back to the backend (rotation /
 * workspace default). Hidden when the workspace has no dialable numbers.
 */
export function CallerIdPicker({ api }: { api: RingeeApi }) {
  const [numbers, setNumbers] = useState<WorkspaceNumber[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api
      .listNumbers()
      .then((r) => setNumbers(r.numbers))
      .catch(() => setNumbers([]));
  }, [api]);

  useEffect(() => load(), [load]);

  // Mirror the stored pick + keep it in sync with any other panel instance.
  useEffect(() => {
    getSelectedCallerId().then(setSelected);
    return subscribeSelectedCallerId(setSelected);
  }, []);

  // Self-heal: a pick that is no longer a valid number (workspace switched, DID
  // released) falls back to Automatic so the header never shows a phantom number.
  useEffect(() => {
    if (!numbers || !selected) return;
    if (!numbers.some((n) => n.phoneNumber === selected)) {
      void setSelectedCallerId(null);
    }
  }, [numbers, selected]);

  const effective = useMemo(
    () => numbers?.find((n) => n.phoneNumber === selected) ?? null,
    [numbers, selected],
  );

  const choose = useCallback((phoneNumber: string | null) => {
    void setSelectedCallerId(phoneNumber);
    setSelected(phoneNumber);
    setOpen(false);
  }, []);

  // Nothing to pick from → don't clutter the header.
  if (numbers !== null && numbers.length === 0) return null;

  return (
    <>
      <button
        onClick={() => {
          load(); // refresh in case a number was just added
          setOpen(true);
        }}
        className="text-foreground/80 hover:bg-accent flex max-w-[136px] items-center gap-1.5 rounded-full border border-black/5 bg-black/[0.03] py-1 pr-1.5 pl-2 text-xs font-medium transition dark:border-white/10 dark:bg-white/5"
        aria-label="Choose the number to call from"
        title={
          effective
            ? `Calling from ${formatForDisplay(effective.phoneNumber)}`
            : "Automatic caller ID"
        }
      >
        {effective ? (
          <Flag iso={effective.isoCountry} width={18} />
        ) : (
          <Phone className="h-3.5 w-3.5 text-emerald-600" />
        )}
        <span className="truncate">
          {effective ? formatForDisplay(effective.phoneNumber) : "Auto"}
        </span>
        <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      </button>

      <Sheet open={open} title="Call from" onClose={() => setOpen(false)}>
        {numbers === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-1 pb-1">
            <OptionRow
              icon={<Phone className="h-4 w-4 text-emerald-600" />}
              title="Automatic"
              subtitle="Let Ringee pick the best number"
              selected={selected === null}
              onClick={() => choose(null)}
            />

            <p className="text-muted-foreground mt-2 mb-1 px-1 text-[10px] font-semibold tracking-wider uppercase">
              Your numbers
            </p>

            {numbers.map((n) => (
              <OptionRow
                key={n.id}
                icon={<Flag iso={n.isoCountry} width={22} />}
                title={formatForDisplay(n.phoneNumber)}
                subtitle={
                  n.kind === "verified_caller_id"
                    ? "Verified caller ID"
                    : "Ringee number"
                }
                badge={n.kind === "verified_caller_id"}
                selected={selected === n.phoneNumber}
                onClick={() => choose(n.phoneNumber)}
              />
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

function OptionRow({
  icon,
  title,
  subtitle,
  badge,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
        selected ? "bg-emerald-500/10" : "hover:bg-accent",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {badge && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          )}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {subtitle}
        </span>
      </span>
      {selected && (
        <Check
          className="h-4 w-4 shrink-0 text-emerald-600"
          aria-label="Selected"
        />
      )}
    </button>
  );
}

type FlagMap = Record<
  string,
  React.ComponentType<{
    title?: string;
    className?: string;
    style?: React.CSSProperties;
  }>
>;
const flags = flagComponents as unknown as FlagMap;

/**
 * ISO-3166 alpha-2 → flag SVG (consistent across OSes, unlike emoji flags).
 * Falls back to a globe for unknown/"XX" codes. Height keeps the 3:2 ratio.
 */
function Flag({ iso, width }: { iso: string; width: number }) {
  const code = (iso || "").trim().toUpperCase();
  const F = /^[A-Z]{2}$/.test(code) ? flags[code] : undefined;
  if (!F) {
    return (
      <Globe
        className="text-muted-foreground shrink-0"
        style={{ width, height: width }}
      />
    );
  }
  return (
    <F
      title={code}
      className="shrink-0 rounded-[2px]"
      style={{ width, height: (width * 2) / 3 }}
    />
  );
}
