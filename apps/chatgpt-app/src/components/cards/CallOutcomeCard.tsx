"use client";

import type { CallOutcome, LogCallOutcomeResult } from "@ringee-io/agent";
import {
  CalendarCheck,
  CircleDollarSign,
  Clock4,
  PhoneMissed,
  PhoneOff,
  ThumbsDown,
  ThumbsUp,
  Voicemail,
} from "lucide-react";
import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { titleCase } from "@/lib/format";

type OutcomeConfig = {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const OUTCOMES: Record<CallOutcome, OutcomeConfig> = {
  meeting_booked: { icon: CalendarCheck, color: "var(--success)" },
  sale: { icon: CircleDollarSign, color: "var(--success)" },
  interested: { icon: ThumbsUp, color: "var(--info)" },
  follow_up: { icon: Clock4, color: "var(--info)" },
  callback_scheduled: { icon: Clock4, color: "var(--info)" },
  not_interested: { icon: ThumbsDown, color: "var(--muted-foreground)" },
  no_answer: { icon: PhoneMissed, color: "var(--warning)" },
  voicemail: { icon: Voicemail, color: "var(--warning)" },
  wrong_number: { icon: PhoneOff, color: "var(--destructive)" },
  gatekeeper: { icon: PhoneOff, color: "var(--warning)" },
};

export function CallOutcomeCard({
  outcome,
}: {
  outcome: LogCallOutcomeResult;
}) {
  const cfg = OUTCOMES[outcome.outcome] ?? OUTCOMES.follow_up;
  const Icon = cfg.icon;

  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <div className="h-1" style={{ background: cfg.color }} />
      <CardHeader className="items-center">
        <div
          className="flex size-10 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in oklab, ${cfg.color} 14%, transparent)`,
            color: cfg.color,
          }}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Outcome logged
          </p>
          <h3 className="truncate text-base font-semibold leading-tight">
            {titleCase(outcome.outcome)}
          </h3>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {outcome.outcomeNote ? (
          <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
            {outcome.outcomeNote}
          </blockquote>
        ) : null}
        <p className="font-mono text-[11px] text-muted-foreground">
          call {outcome.callId}
        </p>
      </CardContent>
    </Card>
  );
}
