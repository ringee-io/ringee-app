import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@ringee/frontend-shared/lib/utils";

/** Centered spinner. `inline` renders a small one without the vertical padding. */
export function Spinner({ inline }: { inline?: boolean }) {
  return (
    <div className={cn("flex justify-center", inline ? "py-3" : "py-10")}>
      <Loader2
        className={cn(
          "text-muted-foreground animate-spin",
          inline ? "h-4 w-4" : "h-5 w-5",
        )}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <span className="bg-muted text-muted-foreground mb-3 flex h-11 w-11 items-center justify-center rounded-full">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {message && (
        <p className="text-muted-foreground mt-1 text-xs">{message}</p>
      )}
    </div>
  );
}

/** A titled card section with an optional count badge and leading icon. */
export function Section({
  title,
  count,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-xl shadow-sm">
      <div className="text-muted-foreground flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold tracking-wide uppercase">
        {Icon && <Icon className="h-3.5 w-3.5 text-emerald-600" />}
        {title}
        {typeof count === "number" && (
          <span className="bg-muted text-muted-foreground ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            {count}
          </span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** A label/value row used inside detail cards. */
export function Field({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="text-foreground flex items-start gap-2 text-sm">
      {Icon && (
        <Icon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Sticky screen header with a back button, title and an optional trailing action. */
export function ScreenHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 backdrop-blur">
      {onBack && (
        <button
          onClick={onBack}
          className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md transition"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      <span className="flex-1 truncate text-sm font-semibold">{title}</span>
      {action}
    </header>
  );
}

/** Deterministic emerald-tinted initials avatar (name → initials, else number). */
export function Avatar({
  name,
  fallback,
  size = 40,
}: {
  name?: string | null;
  fallback?: string | null;
  size?: number;
}) {
  const initials = computeInitials(name, fallback);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-emerald-500/12 font-semibold text-emerald-600"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

function computeInitials(
  name?: string | null,
  fallback?: string | null,
): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
    if (letters) return letters;
  }
  const digits = (fallback || "").replace(/\D/g, "");
  if (digits) return digits.slice(-2);
  return "•";
}

type PillTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-600",
  warning: "bg-amber-500/10 text-amber-600",
  danger: "bg-rose-500/10 text-rose-600",
  info: "bg-blue-500/10 text-blue-600",
};

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: PillTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        TONE_CLASS[tone],
      )}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

/**
 * A tappable list row: leading avatar/icon, title + subtitle, optional trailing
 * content and a chevron. The shared building block for every feed/list.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  chevron = true,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2.5 text-left transition"
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="text-muted-foreground block truncate text-xs">
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
      {chevron && (
        <ChevronRight className="text-muted-foreground/50 h-4 w-4 shrink-0" />
      )}
    </button>
  );
}

/** Circular icon badge used as a list-row leading element. */
export function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
      <Icon className="h-4 w-4" />
    </span>
  );
}
