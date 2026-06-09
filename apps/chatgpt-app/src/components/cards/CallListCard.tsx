"use client";

import { useState } from "react";
import type { CallDetail, CallOutcome, ListCallsResult } from "@ringee-io/agent";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PlayCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { callToolData, sendFollowup } from "@/lib/openai";
import {
  displayName,
  formatPhone,
  initials,
  relativeTime,
  titleCase,
} from "@/lib/format";

/** Map a call outcome to a badge variant so converts/engagement stand out. */
function outcomeVariant(
  outcome: CallOutcome | null,
): "success" | "info" | "warning" | "destructive" | "outline" {
  switch (outcome) {
    case "sale":
    case "meeting_booked":
      return "success";
    case "interested":
    case "follow_up":
    case "callback_scheduled":
      return "info";
    case "not_interested":
    case "wrong_number":
      return "destructive";
    case "gatekeeper":
    case "no_answer":
    case "voicemail":
      return "warning";
    default:
      return "outline";
  }
}

/** Map call status to a badge variant. */
function statusVariant(
  status: string,
): "success" | "info" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "destructive";
    case "answered":
    case "recording":
      return "info";
    default:
      return "outline";
  }
}

function CallRow({ call }: { call: CallDetail }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const name = call.contact ? displayName(call.contact) : formatPhone(call.toNumber);
  const phone = call.contact?.phoneNumber ?? call.toNumber;
  const subtitle = [call.contact?.jobTitle, call.contact?.company]
    .filter(Boolean)
    .join(" · ");
  const when = call.startedAt ?? call.createdAt;
  const DirIcon = call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  const hasContactId =
    typeof call.contact?.id === "string" && call.contact.id.length > 0;

  return (
    <li className="px-4 py-2.5 transition-colors hover:bg-muted/40 sm:px-5">
      <div className="flex items-center gap-3">
        {call.contact ? (
          <Avatar fallback={initials(name)} className="size-9" />
        ) : (
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            aria-hidden
          >
            <Phone className="size-4" />
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            void sendFollowup(
              hasContactId
                ? `Show details for ${name} (contactId ${call.contact?.id})`
                : `Show details for ${phone}`,
            )
          }
          className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <DirIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{name}</span>
            </span>
            {call.outcome ? (
              <Badge variant={outcomeVariant(call.outcome)} className="shrink-0">
                {titleCase(call.outcome)}
              </Badge>
            ) : (
              <Badge variant={statusVariant(call.status)} className="shrink-0">
                {titleCase(call.status)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">{formatPhone(phone)}</span>
            {call.duration ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="size-3" />
                  {call.duration}
                </span>
              </>
            ) : null}
            {when ? (
              <>
                <span aria-hidden>·</span>
                <span>{relativeTime(when)}</span>
              </>
            ) : null}
          </div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </button>
      </div>

      {call.outcomeNote ? (
        <p className="mt-1.5 pl-12 text-xs text-muted-foreground">
          {call.outcomeNote}
        </p>
      ) : null}

      {(call.hasRecording || call.hasTranscription) ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-12">
          {call.recordingUrl ? (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              <PlayCircle className="size-3.5 text-muted-foreground" />
              Recording
            </a>
          ) : null}
          {call.hasTranscription ? (
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              <FileText className="size-3.5 text-muted-foreground" />
              {showTranscript ? "Hide transcript" : "Transcript"}
            </button>
          ) : null}
        </div>
      ) : null}

      {showTranscript && call.transcription ? (
        <p className="mt-1.5 ml-12 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-foreground/90">
          {call.transcription}
        </p>
      ) : null}
    </li>
  );
}

export function CallListCard({ data }: { data: ListCallsResult }) {
  // In-card pagination: callTool swaps the page in place (no model round-trip).
  // Falls back to a follow-up turn when the host can't call tools (gallery).
  const [override, setOverride] = useState<ListCallsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const current = override ?? data;
  const calls = Array.isArray(current.calls) ? current.calls : [];
  const totalPages = Math.max(current.totalPages || 1, 1);
  const page = current.page || 1;
  const pageSize = current.limit ?? calls.length ?? 10;

  async function goToPage(target: number) {
    if (loading || target < 1 || target > totalPages || target === page) return;
    setLoading(true);
    const next = await callToolData<ListCallsResult>("list_calls", {
      page: target,
      limit: pageSize,
    });
    setLoading(false);
    if (next && Array.isArray(next.calls)) {
      setOverride(next);
    } else {
      void sendFollowup(`Show page ${target} of my calls`);
    }
  }

  if (calls.length === 0 && !loading) {
    return (
      <EmptyState
        icon={Phone}
        title="No calls yet"
        description="No calls match this filter. Try a different contact, outcome or date range."
      />
    );
  }

  return (
    <Card className="w-full max-w-lg overflow-hidden">
      <CardHeader className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Phone className="size-4" />
          </div>
          <h3 className="truncate text-base font-semibold leading-tight">
            Calls
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {current.total.toLocaleString()} total
        </span>
      </CardHeader>

      <CardContent className="p-0">
        <ul
          className={`divide-y border-t transition-opacity ${
            loading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {calls.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </ul>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 sm:px-5">
            <Button
              size="sm"
              variant="ghost"
              disabled={loading || page <= 1}
              onClick={() => void goToPage(page - 1)}
            >
              <ChevronLeft /> Prev
            </Button>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading || page >= totalPages}
              onClick={() => void goToPage(page + 1)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
