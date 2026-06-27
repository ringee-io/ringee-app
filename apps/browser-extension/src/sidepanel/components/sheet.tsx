import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A bottom-anchored sheet that slides up over the side panel. Used for the
 * outcome picker, note composer, add-credit and date pickers. Closes on
 * backdrop click or Escape; traps nothing heavier than that on purpose — the
 * panel is small and single-purpose.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        className="absolute inset-0 bg-black/40 animate-[fadeIn_0.15s_ease]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="bg-background animate-[slideUp_0.2s_ease] relative max-h-[88%] overflow-hidden rounded-t-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <span className="text-sm font-semibold">{title}</span>
          <button
            onClick={onClose}
            className="hover:bg-accent text-muted-foreground flex h-7 w-7 items-center justify-center rounded-md transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 pb-2">{children}</div>
        {footer && (
          <div className="bg-background px-4 py-3 shadow-[0_-2px_10px_-6px_rgba(0,0,0,0.12)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
