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
  Link2,
  Loader2,
  PhoneOutgoing,
  Users,
  X,
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

function ContactRow({
  contact,
  selected,
  onToggle,
}: {
  contact: ContactSummary;
  selected: boolean;
  onToggle: (contact: ContactSummary) => void;
}) {
  const name = displayName(contact);
  const subtitle = [contact.jobTitle, contact.company]
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
      {/* Click selects (not call). The header button creates ONE session from the
          whole selection, so ChatGPT never has to guess which contacts. */}
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

export function ContactListCard({ data }: { data: SearchContactsResult }) {
  // In-card pagination: callTool swaps the page in place (no model round-trip).
  // Falls back to a follow-up turn when the host can't call tools (gallery).
  const [override, setOverride] = useState<SearchContactsResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Multi-select for batch session creation. Keyed by contactId and holding the
  // full summary so the selection survives pagination and we can name each
  // contact in the gallery fallback message.
  const [selected, setSelected] = useState<Record<string, ContactSummary>>({});
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<CreateCallSessionResult | null>(null);

  const current = override ?? data;
  const contacts = Array.isArray(current.contacts) ? current.contacts : [];
  const totalPages = Math.max(current.totalPages || 1, 1);
  const page = current.page || 1;
  const pageSize = current.limit ?? contacts.length ?? 10;
  const { all, label } = queryView(current.query);

  const selectedList = Object.values(selected);
  const selectedCount = selectedList.length;

  function toggle(contact: ContactSummary) {
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

  async function createSession() {
    if (creating || selectedCount === 0) return;
    setCreating(true);
    const data = await callToolData<CreateCallSessionResult>(
      "create_call_session",
      {
        contacts: selectedList.map((c) => ({ contactId: c.id })),
        title:
          selectedCount === 1
            ? `Call ${displayName(selectedList[0])}`
            : `Call session · ${selectedCount} contacts`,
      },
    );
    setCreating(false);
    if (data?.callSessionId) {
      setSession(data);
      setSelected({});
    } else {
      // Standalone gallery or a failed call → hand off to the model, but name the
      // exact contacts the user picked so it never asks "which contacts?".
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
      <CardHeader className="flex-col items-stretch gap-2.5">
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
                ? `Create call session (${selectedCount})`
                : "Create call session"}
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
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              selected={!!selected[c.id]}
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
