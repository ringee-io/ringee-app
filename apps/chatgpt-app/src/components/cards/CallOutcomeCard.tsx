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
import { NextStepBanner } from "@/components/next-step";
import { titleCase } from "@/lib/format";

type OutcomeConfig = {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  nextLabel: string;
  nextPrompt: string;
};

const OUTCOMES: Record<CallOutcome, OutcomeConfig> = {
  meeting_booked: {
    icon: CalendarCheck,
    color: "var(--success)",
    nextLabel: "Confirm the meeting details",
    nextPrompt: "Schedule / confirm the meeting for this contact",
  },
  sale: {
    icon: CircleDollarSign,
    color: "var(--success)",
    nextLabel: "Log the deal and next steps",
    nextPrompt: "What are the next steps after closing this contact?",
  },
  interested: {
    icon: ThumbsUp,
    color: "var(--info)",
    nextLabel: "Book a follow-up meeting",
    nextPrompt: "Schedule a meeting with this interested contact",
  },
  follow_up: {
    icon: Clock4,
    color: "var(--info)",
    nextLabel: "Schedule a callback",
    nextPrompt: "Create a callback for this contact",
  },
  callback_scheduled: {
    icon: Clock4,
    color: "var(--info)",
    nextLabel: "Review the callback time",
    nextPrompt: "Show the callback for this contact",
  },
  not_interested: {
    icon: ThumbsDown,
    color: "var(--muted-foreground)",
    nextLabel: "Move to the next lead",
    nextPrompt: "Who should I call next?",
  },
  no_answer: {
    icon: PhoneMissed,
    color: "var(--warning)",
    nextLabel: "Schedule a callback",
    nextPrompt: "Create a callback for this contact later today",
  },
  voicemail: {
    icon: Voicemail,
    color: "var(--warning)",
    nextLabel: "Schedule a callback",
    nextPrompt: "Create a callback for this contact tomorrow",
  },
  wrong_number: {
    icon: PhoneOff,
    color: "var(--destructive)",
    nextLabel: "Update the contact's phone",
    nextPrompt: "Update this contact's phone number",
  },
  gatekeeper: {
    icon: PhoneOff,
    color: "var(--warning)",
    nextLabel: "Schedule a retry",
    nextPrompt: "Create a callback to try past the gatekeeper",
  },
};

export function CallOutcomeCard({ outcome }: { outcome: LogCallOutcomeResult }) {
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
        <NextStepBanner label={cfg.nextLabel} prompt={cfg.nextPrompt} />
      </CardContent>
    </Card>
  );
}
