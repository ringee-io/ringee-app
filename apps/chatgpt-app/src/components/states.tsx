import * as React from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-xs text-xs">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </Card>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-[color-mix(in_oklab,var(--destructive)_35%,var(--border))]">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-[var(--destructive)]">
          <AlertTriangle className="size-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function LoadingState({
  label = "Loading…",
  rows = 2,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {label}
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i % 2 ? "w-3/4" : "w-full")} />
        ))}
      </div>
    </Card>
  );
}
