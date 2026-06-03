"use client";

import { useState } from "react";
import type { ContactDetail, CreateCallSessionResult } from "@ringee-io/agent";
import {
  Building2,
  CalendarPlus,
  Check,
  Link2,
  Loader2,
  Mail,
  Phone,
  PhoneOutgoing,
  Tag,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldRow, SectionLabel } from "@/components/atoms";
import { callToolData, sendFollowup } from "@/lib/openai";
import {
  displayName,
  formatPhone,
  initials,
  relativeTime,
  titleCase,
} from "@/lib/format";

interface ContactCardProps {
  contact: ContactDetail;
}

function tagLabels(contact: ContactDetail): string[] {
  const tags = contact.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) =>
      typeof t === "string"
        ? t
        : t && typeof t === "object" && "name" in t
          ? String((t as { name: unknown }).name)
          : "",
    )
    .filter(Boolean);
}

export function ContactCard({ contact }: ContactCardProps) {
  const name = displayName(contact);
  const tags = tagLabels(contact);
  const recentCalls = Array.isArray(contact.calls) ? contact.calls : [];

  // "Queue call" creates a 1-contact session deterministically (callTool), so a
  // click maps to exactly one create_call_session — never the model guessing.
  const [queue, setQueue] = useState<"idle" | "busy" | "done">("idle");
  const [session, setSession] = useState<CreateCallSessionResult | null>(null);
  const hasContactId = typeof contact.id === "string" && contact.id.length > 0;

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
      setSession(data);
      setQueue("done");
    } else {
      // Standalone gallery or a failed call → let the model handle it.
      setQueue("idle");
      void sendFollowup(
        `Add ${name} (${contact.phoneNumber}) to a new call session`,
      );
    }
  }

  return (
    <Card className="w-full max-w-md overflow-hidden">
      <CardHeader>
        <Avatar fallback={initials(name)} className="size-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold leading-tight">
              {name}
            </h3>
          </div>
          {contact.jobTitle || contact.company ? (
            <p className="text-muted-foreground truncate text-sm">
              {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        {contact.lastCallAt ? (
          <Badge variant="outline" className="shrink-0">
            Last call {relativeTime(contact.lastCallAt)}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-2.5">
        <FieldRow icon={Phone} label="Phone">
          {formatPhone(contact.phoneNumber)}
        </FieldRow>
        {contact.email ? (
          <FieldRow icon={Mail} label="Email">
            {contact.email}
          </FieldRow>
        ) : null}
        {contact.company ? (
          <FieldRow icon={Building2} label="Company">
            {contact.company}
          </FieldRow>
        ) : null}

        {tags.length ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Tag className="size-3.5 text-muted-foreground" />
            {tags.map((t) => (
              <Badge key={t} variant="default">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}

        {recentCalls.length ? (
          <div className="space-y-1.5 pt-2">
            <SectionLabel>Recent activity</SectionLabel>
            <ul className="space-y-1">
              {recentCalls.slice(0, 3).map((call, i) => {
                const c = call as { outcome?: string; createdAt?: string };
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-medium">
                      {titleCase(c.outcome) || "Call"}
                    </span>
                    <span className="text-muted-foreground">
                      {relativeTime(c.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={queue !== "idle"}
            onClick={() => void queueCall()}
          >
            {queue === "busy" ? (
              <Loader2 className="animate-spin" />
            ) : queue === "done" ? (
              <Check />
            ) : (
              <PhoneOutgoing />
            )}
            {queue === "done" ? "Queued" : "Queue call"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void sendFollowup(
                hasContactId
                  ? `Schedule a meeting with ${name} (contactId ${contact.id}). Ask me for the date and time first.`
                  : `Schedule a meeting with ${name} (${contact.phoneNumber}). Ask me for the date and time first.`,
              )
            }
          >
            <CalendarPlus /> Meeting
          </Button>
        </div>

        {queue === "done" && session?.joinUrl ? (
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
        ) : null}
      </CardFooter>
    </Card>
  );
}
