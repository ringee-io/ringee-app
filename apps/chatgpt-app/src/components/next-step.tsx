"use client";

import { ArrowRight } from "lucide-react";
import { sendFollowup } from "@/lib/openai";
import { cn } from "@/lib/utils";

/**
 * A consistent "what's the recommended next step" banner. Clicking it asks
 * ChatGPT to continue the outbound flow (no-op in the standalone gallery).
 */
export function NextStepBanner({
  label,
  prompt,
  className,
}: {
  label: string;
  /** Follow-up message sent to ChatGPT when clicked. Defaults to `label`. */
  prompt?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void sendFollowup(prompt ?? label)}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Next
        </span>
        <span className="font-medium">{label}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
