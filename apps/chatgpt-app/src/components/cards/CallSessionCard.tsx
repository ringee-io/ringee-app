"use client";

import { useState } from "react";
import type { CallSessionInfo } from "@ringee-io/agent";
import {
  Check,
  Copy,
  Link2,
  Megaphone,
  PhoneCall,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardNote, SensitivityBadge, Stat, StatusPill } from "@/components/atoms";
import { sendFollowup } from "@/lib/openai";
import { formatDateTime, relativeTime } from "@/lib/format";

interface CallSessionCardProps {
  session: CallSessionInfo;
  /** Only present right after create_call_session — share exactly, once. */
  joinUrl?: string;
}

export function CallSessionCard({ session, joinUrl }: CallSessionCardProps) {
  const [copied, setCopied] = useState(false);
  const pct =
    session.contactsCount > 0
      ? Math.round((session.callsCompleted / session.contactsCount) * 100)
      : 0;
  const isRevoked = session.status.toLowerCase() === "revoked";

  const copy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Card className="w-full max-w-md overflow-hidden">
      <CardHeader className="items-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <PhoneCall className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight">
            {session.title || "Call session"}
          </h3>
          <p className="text-muted-foreground text-xs">
            {session.expiresAt
              ? `Expires ${relativeTime(session.expiresAt)}`
              : "No expiry"}
          </p>
        </div>
        <StatusPill status={session.status} />
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">
              {session.callsCompleted}/{session.contactsCount} calls
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Queue" value={session.contactsCount} />
          <Stat label="Done" value={session.callsCompleted} />
          <Stat
            label="Expires"
            value={session.expiresAt ? formatDateTime(session.expiresAt) : "—"}
          />
        </div>

        {session.campaignId ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Megaphone className="size-3.5" />
            Campaign{" "}
            <span className="font-mono text-foreground">
              {session.campaignId}
            </span>
          </div>
        ) : null}

        {joinUrl ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {joinUrl}
              </span>
              <Button size="sm" variant="secondary" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Share this magic link exactly — it can&apos;t be re-fetched later.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link2 className="size-3.5" />
            {session.joinUrlAvailable
              ? "Magic link is active (token hidden for security)."
              : "No active magic link."}
          </div>
        )}

        {!isRevoked ? (
          <GuardNote level="destructive">
            Revoking disables the magic link immediately for everyone holding it.
            Call history is preserved. <SensitivityBadge level="destructive" />
          </GuardNote>
        ) : null}
      </CardContent>

      <CardFooter className="justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void sendFollowup(
              `Check the status of call session ${session.callSessionId}`,
            )
          }
        >
          <RefreshCw /> Refresh
        </Button>
        {!isRevoked ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              void sendFollowup(
                `Revoke call session ${session.callSessionId} — confirm I want the magic link disabled`,
              )
            }
          >
            <Trash2 /> Revoke
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
