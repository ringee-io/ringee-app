"use client";

import type { LeadCandidate, SearchLeadsResult } from "@ringee-io/agent";
import {
  Building2,
  CheckCircle2,
  MapPin,
  Sparkles,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { GuardNote, SensitivityBadge } from "@/components/atoms";
import { sendFollowup } from "@/lib/openai";
import { initials, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

function Confidence({ value }: { value: number | null }) {
  const pct = Math.round((value ?? 0) * 100);
  const color =
    pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--muted-foreground)";
  return (
    <div className="flex items-center gap-1.5" title={`Match confidence ${pct}%`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function LeadRow({ lead, jobId }: { lead: LeadCandidate; jobId: string }) {
  const p = lead.person;
  const name = p.fullName ?? "Unknown";
  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
      <Avatar fallback={initials(name)} className="size-9" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          <Confidence value={lead.confidence} />
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {[p.jobTitle, titleCase(p.seniority)].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {lead.company?.name ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3" />
              {lead.company.name}
            </span>
          ) : null}
          {p.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {p.location}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DataChip available={p.emailsAvailable} label="email" />
          <DataChip available={p.phonesAvailable} label="phone" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button
          size="sm"
          variant="warning"
          onClick={() =>
            void sendFollowup(
              `Reveal lead ${lead.externalId} from job ${jobId} (confirm: this spends credits)`,
            )
          }
        >
          <Sparkles /> Reveal
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void sendFollowup(
              `Import lead ${lead.externalId} from job ${jobId} as a contact`,
            )
          }
        >
          <UserPlus /> Import
        </Button>
      </div>
    </li>
  );
}

function DataChip({ available, label }: { available: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        available
          ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]"
          : "bg-muted text-muted-foreground",
      )}
    >
      {available ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {label}
    </span>
  );
}

export function LeadSearchResults({ data }: { data: SearchLeadsResult }) {
  return (
    <Card className="w-full max-w-lg overflow-hidden">
      <CardHeader className="flex-col items-stretch gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold leading-tight">
              {data.total.toLocaleString()} leads found
            </h3>
            <p className="text-muted-foreground text-xs">
              via {titleCase(String(data.provider))}
              {data.cached ? " · cached" : ""} · page {data.page}
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            job {data.jobId.slice(0, 8)}
          </Badge>
        </div>
        <GuardNote level="sensitive">
          These are <strong>candidates, not contacts</strong>. Revealing unlocks
          email/phone and <strong>spends credits</strong> — confirm before revealing.
          <SensitivityBadge level="sensitive" />
        </GuardNote>
      </CardHeader>

      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {data.results.map((lead) => (
            <LeadRow key={lead.externalId} lead={lead} jobId={data.jobId} />
          ))}
        </ul>
        {data.hasMore ? (
          <div className="border-t px-4 py-3 sm:px-5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() =>
                void sendFollowup(
                  `Show the next page of leads for job ${data.jobId}`,
                )
              }
            >
              Load more results
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
