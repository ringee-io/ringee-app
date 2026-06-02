import * as React from "react";
import type { Sensitivity } from "@ringee-io/agent";
import { ShieldAlert, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Color-coded status pill with a leading dot. */
export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone: Record<string, string> = {
    active: "var(--success)",
    confirmed: "var(--success)",
    scheduled: "var(--info)",
    completed: "var(--muted-foreground)",
    expired: "var(--warning)",
    revoked: "var(--destructive)",
    cancelled: "var(--destructive)",
  };
  const color = tone[status.toLowerCase()] ?? "var(--muted-foreground)";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {status}
    </span>
  );
}

/**
 * Communicates how risky an action is. This is the single visual language used
 * across the app to differentiate normal / sensitive / destructive operations.
 */
export function SensitivityBadge({ level }: { level: Sensitivity }) {
  if (level === "read") return null;
  const map = {
    write: { variant: "info" as const, icon: ShieldCheck, label: "Normal action" },
    sensitive: { variant: "warning" as const, icon: Sparkles, label: "Sensitive" },
    destructive: { variant: "destructive" as const, icon: Trash2, label: "Destructive" },
  };
  const cfg = map[level];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant}>
      <Icon />
      {cfg.label}
    </Badge>
  );
}

/** A small inline confirmation hint for sensitive/destructive cards. */
export function GuardNote({
  level,
  children,
}: {
  level: Exclude<Sensitivity, "read" | "write">;
  children: React.ReactNode;
}) {
  const color = level === "destructive" ? "var(--destructive)" : "var(--warning)";
  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
      style={{
        borderColor: `color-mix(in oklab, ${color} 30%, var(--border))`,
        background: `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" style={{ color }} />
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

/** A compact labelled stat used in headers/footers. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

/** A label/value row used inside card bodies. */
export function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{children}</span>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}
