import { useState } from "react";
import { Loader2, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Input } from "@ringee/frontend-shared/components/ui/input";
import { Sheet } from "../components/sheet";
import type { RingeeApi } from "../../lib/ringee-api";

const PRESETS = [10, 25, 50, 100];
const MIN_AMOUNT = 5; // mirrors the web recharge flow

/**
 * One-time credit recharge. Posts to the same `@OrgAdminOnly` Stripe endpoint the
 * web app uses and opens the hosted checkout in a new tab (the side panel can't
 * host the redirect). There is intentionally NO "request credit" flow here.
 */
export function AddCreditSheet({
  open,
  api,
  onClose,
  notify,
}: {
  open: boolean;
  api: RingeeApi;
  onClose: () => void;
  notify: (kind: "success" | "error", message: string) => void;
}) {
  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);
  const belowMin = amount < MIN_AMOUNT;
  const estimatedMinutes = Math.round(amount * 50);

  const checkout = async () => {
    if (belowMin || loading) return;
    setLoading(true);
    try {
      const { url } = await api.createCreditCheckout(amount);
      if (url) {
        chrome.tabs.create({ url });
        onClose();
      } else {
        notify("error", "Could not start checkout.");
      }
    } catch {
      notify("error", "Could not start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Add credits"
      onClose={onClose}
      footer={
        <>
          <Button
            onClick={checkout}
            disabled={loading || belowMin}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            size="sm"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>Continue to checkout · ${amount}</>
            )}
          </Button>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-[11px]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Secure payment by Stripe
          </p>
        </>
      }
    >
      <div className="pt-1 pb-2">
        <label className="text-muted-foreground mb-2 block text-[10px] font-medium tracking-wider uppercase">
          Choose an amount
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((val) => (
            <button
              key={val}
              onClick={() => setAmount(val)}
              className={cn(
                "rounded-lg py-2 text-sm font-semibold transition-all",
                val === amount
                  ? "bg-emerald-500/15 text-emerald-600 shadow-sm"
                  : "bg-muted/50 hover:bg-muted",
              )}
            >
              ${val}
            </button>
          ))}
        </div>

        <label className="text-muted-foreground mt-4 mb-1.5 block text-[10px] font-medium tracking-wider uppercase">
          Custom amount
        </label>
        <div className="relative">
          <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
            $
          </span>
          <Input
            type="number"
            min={MIN_AMOUNT}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            aria-invalid={belowMin}
            className={cn("h-9 pl-7 text-sm", belowMin && "border-rose-500")}
          />
        </div>
        {belowMin ? (
          <p className="mt-1 text-xs text-rose-500">
            Minimum amount is ${MIN_AMOUNT}.
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5 text-emerald-600" />≈ {estimatedMinutes}{" "}
            minutes of talk time
          </p>
        )}
      </div>
    </Sheet>
  );
}
