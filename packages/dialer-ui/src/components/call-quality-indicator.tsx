"use client";

import { Button } from "@ringee/frontend-shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ringee/frontend-shared/components/ui/popover";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { useId } from "react";

export interface CallQualityIndicatorProps {
  tone: "positive" | "warning" | "danger" | "neutral";
  statusText: string;
  title: string;
  description: string;
  metrics: { label: string; value: string }[];
  warning?: string;
}

const DOT_COLOR: Record<CallQualityIndicatorProps["tone"], string> = {
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-muted-foreground",
};

/** The host supplies localized, sanitized metrics; this view never reads media. */
export function CallQualityIndicator({
  tone,
  statusText,
  title,
  description,
  metrics,
  warning,
}: CallQualityIndicatorProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-8 gap-2 px-2 text-xs"
          aria-label={statusText}
        >
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 shrink-0 rounded-full", DOT_COLOR[tone])}
          />
          <span>{statusText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-80 max-w-[calc(100vw-2rem)] space-y-3 text-xs"
      >
        <p id={titleId} className="text-sm font-semibold">
          {title}
        </p>
        <p id={descriptionId} className="text-muted-foreground">
          {description}
        </p>
        <dl className="space-y-2">
          {metrics.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {warning ? (
          <p className="text-amber-600 dark:text-amber-400">{warning}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
