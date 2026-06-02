import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  fallback,
  className,
}: {
  fallback: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground select-none",
        className,
      )}
      aria-hidden
    >
      {fallback}
    </div>
  );
}
