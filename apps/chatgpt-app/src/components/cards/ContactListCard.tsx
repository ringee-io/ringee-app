"use client";

import { useState } from "react";
import type {
  ContactSummary,
  CreateCallSessionResult,
  SearchContactsResult,
} from "@ringee-io/agent";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PhoneOutgoing,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { callToolData, sendFollowup } from "@/lib/openai";
import { displayName, formatPhone, initials, relativeTime } from "@/lib/format";

/** How the current query reads in the header ("All contacts" for the `*` all-list). */
function queryView(query?: string | null): { all: boolean; label: string } {
  const q = (query ?? "").trim();
  const all = q === "" || q === "*";
  return { all, label: all ? "All contacts" : `Results for “${q}”` };
}

function ContactRow({ contact }: { contact: ContactSummary }) {
  const name = displayName(contact);
  const subtitle = [contact.jobTitle, contact.company]
    .filter(Boolean)
    .join(" · ");
  const hasContactId = typeof contact.id === "string" && contact.id.length > 0;
  // Per-row queue state: a click maps to exactly one create_call_session.
  const [queue, setQueue] = useState<"idle" | "busy" | "done">("idle");

  async function queueCall() {
    if (queue !== "idle") return;
    setQueue("busy");
    const data = hasContactId
      ? await callToolData<CreateCallSessionResult>("create_call_session", {
          contacts: [{ contactId: contact.id }],
          title: `Call ${name}`,
        })
      : null;
    if (data?.callSessionId) {
      setQueue("done");
    } else {
      setQueue("idle");
      void sendFollowup(
        `Add ${name} (${contact.phoneNumber}) to a new call session`,
      );
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40 sm:px-5">
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
          {contact.lastCallAt ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {relativeTime(contact.lastCallAt)}
            </span>
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
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        disabled={queue !== "idle"}
        title={queue === "done" ? `${name} queued` : `Queue a call to ${name}`}
        aria-label={
          queue === "done" ? `${name} queued` : `Queue a call to ${name}`
        }
        onClick={() => void queueCall()}
      >
        {queue === "busy" ? (
          <Loader2 className="animate-spin" />
        ) : queue === "done" ? (
          <Check className="text-[var(--success)]" />
        ) : (
          <PhoneOutgoing />
        )}
      </Button>
    </li>
  );
}

export function ContactListCard({ data }: { data: SearchContactsResult }) {
  // In-card pagination: callTool swaps the page in place (no model round-trip).
  // Falls back to a follow-up turn when the host can't call tools (gallery).
  const [override, setOverride] = useState<SearchContactsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const current = override ?? data;
  const contacts = Array.isArray(current.contacts) ? current.contacts : [];
  const totalPages = Math.max(current.totalPages || 1, 1);
  const page = current.page || 1;
  const pageSize = current.limit ?? contacts.length ?? 10;
  const { all, label } = queryView(current.query);

  async function goToPage(target: number) {
    if (loading || target < 1 || target > totalPages || target === page) return;
    setLoading(true);
    const next = await callToolData<SearchContactsResult>("search_contacts", {
      query: current.query ?? "*",
      page: target,
      limit: pageSize,
    });
    setLoading(false);
    if (next && Array.isArray(next.contacts)) {
      setOverride(next);
    } else {
      // Host can't run tools here — let the model fetch the next page.
      void sendFollowup(
        `Show page ${target} of ${all ? "all contacts" : `“${current.query}”`}`,
      );
    }
  }

  if (contacts.length === 0 && !loading) {
    return (
      <EmptyState
        icon={Users}
        title={all ? "No contacts yet" : "No contacts found"}
        description={
          all
            ? "Add your first contact, or prospect new leads to get started."
            : "Try a different name, phone or company — or prospect new leads."
        }
      />
    );
  }

  return (
    <Card className="w-full max-w-lg overflow-hidden">
      <CardHeader className="flex-col items-stretch gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Users className="size-4" />
            </div>
            <h3 className="text-base font-semibold leading-tight">{label}</h3>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {current.total.toLocaleString()} total
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ul
          className={`divide-y border-t transition-opacity ${
            loading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} />
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
