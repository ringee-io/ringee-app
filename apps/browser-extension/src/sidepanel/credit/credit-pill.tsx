import { useCallback, useEffect, useState } from "react";
import { Plus, Zap } from "lucide-react";
import type { RingeeApi } from "../../lib/ringee-api";
import { AddCreditSheet } from "./add-credit-sheet";

/**
 * Header credit pill — balance + an "add" affordance that opens the recharge
 * sheet. Only mounted for admins (the host checks `me.isAdmin`); the balance
 * itself comes from the `@OrgAdminOnly` `/extension/credit` endpoint. Refreshes
 * whenever `refreshKey` changes (e.g. after a call ends).
 */
export function CreditPill({
  api,
  notify,
  refreshKey,
}: {
  api: RingeeApi;
  notify: (kind: "success" | "error", message: string) => void;
  refreshKey?: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api
      .getCredit()
      .then((r) => setBalance(r.balance))
      .catch(() => setBalance(null));
  }, [api]);

  useEffect(() => load(), [load, refreshKey]);

  // Re-read when the recharge sheet closes (the user may have just paid).
  const close = () => {
    setOpen(false);
    load();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-105"
        aria-label="Add credits"
      >
        <Zap className="h-3.5 w-3.5" />
        <span>{balance === null ? "Credit" : `$${balance.toFixed(2)}`}</span>
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
          <Plus className="h-3 w-3" />
        </span>
      </button>

      <AddCreditSheet open={open} api={api} notify={notify} onClose={close} />
    </>
  );
}
