"use client";

import type { CreateCallbackResult } from "@ringee-io/agent";
import { Bell, CalendarClock, NotebookPen, PhoneCall } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/atoms";
import { NextStepBanner } from "@/components/next-step";
import { sendFollowup } from "@/lib/openai";
import { formatDateTime, relativeTime } from "@/lib/format";

interface CallbackCardProps {
  callback: CreateCallbackResult;
  /** Optional context for nicer copy. */
  contactName?: string;
}

export function CallbackCard({ callback, contactName }: CallbackCardProps) {
  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <CardHeader className="items-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--info)_14%,transparent)] text-[var(--info)]">
          <Bell className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight">
            Callback scheduled
          </h3>
          <p className="text-muted-foreground truncate text-xs">
            {contactName ? `with ${contactName}` : "Reminder set"}
          </p>
        </div>
        {callback.status ? <StatusPill status={callback.status} /> : null}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-muted-foreground" />
            {formatDateTime(callback.scheduledAt)}
          </div>
          <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
            {relativeTime(callback.scheduledAt)}
          </p>
        </div>
        {callback.error ? (
          <p className="text-xs text-[var(--destructive)]">{callback.error}</p>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => void sendFollowup("Add a note to this callback")}
          >
            <NotebookPen /> Add note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void sendFollowup("Reschedule this callback")}
          >
            <PhoneCall /> Reschedule
          </Button>
        </div>
        <NextStepBanner
          label="Queue the contact for the next call"
          prompt="Create a call session for this contact"
        />
      </CardFooter>
    </Card>
  );
}
