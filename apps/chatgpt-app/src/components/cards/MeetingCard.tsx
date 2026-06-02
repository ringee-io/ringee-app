"use client";

import type { ScheduleMeetingResult } from "@ringee-io/agent";
import {
  CalendarCheck,
  Clock,
  ExternalLink,
  MapPin,
  Users,
  Video,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldRow, StatusPill } from "@/components/atoms";
import { sendFollowup } from "@/lib/openai";
import { formatDateTime, relativeTime } from "@/lib/format";

interface MeetingCardProps {
  meeting: ScheduleMeetingResult;
  title?: string;
  contactName?: string;
  attendeeEmail?: string;
  location?: string;
}

export function MeetingCard({
  meeting,
  title,
  contactName,
  attendeeEmail,
  location,
}: MeetingCardProps) {
  const isLink = location ? /^https?:\/\//.test(location) : false;
  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <CardHeader className="items-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[var(--success)]">
          <CalendarCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight">
            {title || "Meeting booked"}
          </h3>
          <p className="text-muted-foreground truncate text-xs">
            {contactName ? `with ${contactName}` : "On the calendar"}
          </p>
        </div>
        {meeting.status ? <StatusPill status={meeting.status} /> : null}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4 text-muted-foreground" />
            {formatDateTime(meeting.scheduledAt)}
          </div>
          <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
            {relativeTime(meeting.scheduledAt)}
            {meeting.duration ? ` · ${meeting.duration} min` : ""}
          </p>
        </div>

        <div className="space-y-2.5">
          {attendeeEmail ? (
            <FieldRow icon={Users} label="Attendee">
              {attendeeEmail}
            </FieldRow>
          ) : null}
          {location ? (
            <FieldRow icon={isLink ? Video : MapPin} label={isLink ? "Link" : "Where"}>
              {location}
            </FieldRow>
          ) : null}
        </div>

        {meeting.error ? (
          <p className="text-xs text-[var(--destructive)]">{meeting.error}</p>
        ) : null}
      </CardContent>

      <CardFooter>
        {isLink && location ? (
          <a href={location} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" className="w-full">
              <Video /> Join meeting
            </Button>
          </a>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => void sendFollowup("Add this meeting to my calendar")}
          >
            <ExternalLink /> Add to calendar
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
