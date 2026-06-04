"use client";

import { useState } from "react";
import type {
  CreateCallSessionResult,
  FindContactsByOutcomeResult,
  OutcomeContactSummary,
} from "@ringee-io/agent";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Link2,
  Loader2,
  PhoneOutgoing,
  Target,
  X,
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
  outcome: OutcomeContactSummary["lastOutcome"],
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

/** Short, human header describing the outcome filter that produced this list. */
function filterLabel(outcomes: string[], match: "any" | "last"): string {
  const names = outcomes.map((o) => titleCase(o)).join(", ") || "any outcome";
  return match === "last" ? `Last call: ${names}` : names;
}

function OutcomeRow({
  contact,
  selected,
  onToggle,
}: {
  contact: OutcomeContactSummary;
  selected: boolean;
  onToggle: (contact: OutcomeContactSummary) => void;
}) {
  const name = displayName(contact);
  const subtitle = [contact.jobTitle, contact.company]
    .filter(Boolean)
    .join(" · ");
  const region = [
    contact.seniority,
    contact.department,
    contact.locationCountryCode,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasContactId = typeof contact.id === "string" && contact.id.length > 0;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 transition-colors sm:px-5 ${
        selected ? "bg-primary/5" : "hover:bg-muted/40"
      }`}
    >
      <Avatar fallback={initials(name)} className="size-9" />
      <button
        type="button"
        onClick={() =>
          void sendFollowup(
            hasContactId
              ? `Show details for ${name} (contactId ${contact.id})`
              : `Show details for ${name} (${contact.phoneNumber})`,
          )
        }
        className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          {contact.lastOutcome ? (
            <Badge
              variant={outcomeVariant(contact.lastOutcome)}
              className="shrink-0"
            >
              {titleCase(contact.lastOutcome)}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatPhone(contact.phoneNumber)}
          </span>
          {subtitle ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{subtitle}</span>
            </>
          ) : null}
        </div>
        {region || contact.lastCallAt ? (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {region ? <span className="truncate">{region}</span> : null}
            {region && contact.lastCallAt ? <span aria-hidden>·</span> : null}
            {contact.lastCallAt ? (
              <span>{relativeTime(contact.lastCallAt)}</span>
            ) : null}
          </div>
        ) : null}
      </button>
      {/* Click selects (not call). The header button creates ONE session from
          the whole selection — re-engage the contacts who already converted. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        disabled={!hasContactId}
        title={
          selected ? `${name} selected` : `Select ${name} for a call session`
        }
        aria-label={
          selected ? `${name} selected` : `Select ${name} for a call session`
        }
        onClick={() => onToggle(contact)}
        className={`flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input hover:border-primary/60 hover:bg-muted"
        }`}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </button>
    </li>
  );
}

export function OutcomeContactsCard({
  data,
}: {
  data: FindContactsByOutcomeResult;
}) {
  // In-card pagination: callTool swaps the page in place (no model round-trip),
  // carrying the SAME outcomes/match so the filtered set stays stable. Falls
  // back to a follow-up turn when the host can't call tools (gallery).
  const [override, setOverride] = useState<FindContactsByOutcomeResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<
    Record<string, OutcomeContactSummary>
  >({});
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<CreateCallSessionResult | null>(null);

  const current = override ?? data;
  const contacts = Array.isArray(current.contacts) ? current.contacts : [];
  const totalPages = Math.max(current.totalPages || 1, 1);
  const page = current.page || 1;
  const pageSize = current.limit ?? contacts.length ?? 10;
  const match = current.match ?? "any";
  const outcomes = Array.isArray(current.outcomes) ? current.outcomes : [];

  const selectedList = Object.values(selected);
  const selectedCount = selectedList.length;

  function toggle(contact: OutcomeContactSummary) {
    if (!contact.id) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[contact.id]) delete next[contact.id];
      else next[contact.id] = contact;
      return next;
    });
  }

  async function goToPage(target: number) {
    if (loading || target < 1 || target > totalPages || target === page) return;
    setLoading(true);
    const next = await callToolData<FindContactsByOutcomeResult>(
      "find_contacts_by_outcome",
      { outcomes, match, page: target, limit: pageSize },
    );
    setLoading(false);
    if (next && Array.isArray(next.contacts)) {
      setOverride(next);
    } else {
      void sendFollowup(
        `Show page ${target} of contacts with outcome ${outcomes.join(", ")}`,
      );
    }
  }

  async function createSession() {
    if (creating || selectedCount === 0) return;
    setCreating(true);
    const result = await callToolData<CreateCallSessionResult>(
      "create_call_session",
      {
        contacts: selectedList.map((c) => ({ contactId: c.id })),
        title:
          selectedCount === 1
            ? `Call ${displayName(selectedList[0])}`
            : `Re-engage · ${selectedCount} converts`,
      },
    );
    setCreating(false);
    if (result?.callSessionId) {
      setSession(result);
      setSelected({});
    } else {
      const names = selectedList
        .map((c) => `${displayName(c)} (${c.phoneNumber})`)
        .join(", ");
      void sendFollowup(
        `Create a call session with these ${selectedCount} contacts: ${names}`,
      );
    }
  }

  if (contacts.length === 0 && !loading) {
    return (
      <EmptyState
        icon={Target}
        title="No matching contacts"
        description="No contacts have a call with those outcomes yet. Try a broader outcome set or 'any' match."
      />
    );
  }

  return (
    <Card className="w-full max-w-lg overflow-hidden">
      <CardHeader className="flex-col items-stretch gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Target className="size-4" />
            </div>
            <h3 className="truncate text-base font-semibold leading-tight">
              {filterLabel(outcomes, match)}
            </h3>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {current.total.toLocaleString()} total
          </span>
        </div>

        {session?.joinUrl ? (
          <div className="space-y-1.5">
            <a
              href={session.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-muted"
            >
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">
                Call session ready — open the dialer
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {session.contactsCount} queued
              </span>
            </a>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full"
              onClick={() => setSession(null)}
            >
              Select more contacts
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={selectedCount === 0 || creating}
              onClick={() => void createSession()}
            >
              {creating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <PhoneOutgoing />
              )}
              {selectedCount > 0
                ? `Re-engage selected (${selectedCount})`
                : "Re-engage these contacts"}
            </Button>
            {selectedCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={creating}
                title="Clear selection"
                onClick={() => setSelected({})}
              >
                <X /> Clear
              </Button>
            ) : null}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <ul
          className={`divide-y border-t transition-opacity ${
            loading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {contacts.map((ct) => (
            <OutcomeRow
              key={ct.id}
              contact={ct}
              selected={!!selected[ct.id]}
              onToggle={toggle}
            />
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
