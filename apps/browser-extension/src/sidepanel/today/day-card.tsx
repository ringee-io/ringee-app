import { ChevronRight, Video } from "lucide-react";
import { Skeleton } from "@ringee/frontend-shared/components/ui/skeleton";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { TodaySummary } from "../../lib/ringee-api";
import { formatDayTime, plural } from "../../lib/format";

/** Only a web link is offered as "Join"; a street address is not. */
function joinUrlOf(location: string | null): string | null {
  const value = location?.trim();
  return value && /^https?:\/\//i.test(value) ? value : null;
}

/** How the user's own day is going, and the next meeting on it. */
export function DayCard({
  summary,
  failed,
  now,
  onOpenMeeting,
}: {
  summary: TodaySummary | null;
  failed: boolean;
  now: Date;
  onOpenMeeting: (id: string) => void;
}) {
  const meeting = summary?.nextMeeting ?? null;
  const joinUrl = joinUrlOf(meeting?.location ?? null);

  const stats = summary
    ? [
        {
          value: summary.calls,
          label: plural(summary.calls, "call", "calls"),
        },
        {
          value: summary.conversations,
          label: plural(summary.conversations, "conversation", "conversations"),
        },
        {
          value: summary.meetingsBooked,
          label: plural(
            summary.meetingsBooked,
            "meeting booked",
            "meetings booked",
          ),
        },
      ]
    : null;

  return (
    <section
      aria-labelledby="today-day-title"
      className="bg-card space-y-2.5 rounded-xl p-3 shadow-sm"
    >
      <h2 id="today-day-title" className="text-sm font-bold tracking-tight">
        Today
      </h2>

      {failed ? (
        <p className="text-muted-foreground text-xs">
          Today&apos;s numbers didn&apos;t load.
        </p>
      ) : !stats ? (
        <Skeleton className="h-[58px] w-full" />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-muted/60 flex flex-col-reverse justify-end gap-0.5 rounded-lg p-2"
              >
                <dt className="text-muted-foreground text-[11px] leading-tight">
                  {stat.label}
                </dt>
                <dd className="text-xl leading-none font-bold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-[11px]">
            Only your own calls today, in this workspace. A conversation is one
            that reached a person.
          </p>
        </>
      )}

      {summary && (
        <div className="border-border/60 flex items-center gap-2 border-t pt-2.5">
          {meeting ? (
            <button
              onClick={() => onOpenMeeting(meeting.id)}
              className="hover:bg-accent/60 -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition"
            >
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground block text-[11px]">
                  Next meeting
                </span>
                <span className="block truncate text-sm font-semibold">
                  {meeting.title ||
                    `Meeting with ${
                      meeting.contact?.name ||
                      formatForDisplay(meeting.contact?.phoneNumber ?? "")
                    }`}
                </span>
                <span className="text-muted-foreground block text-[11px]">
                  {formatDayTime(new Date(meeting.scheduledAt), now)} ·{" "}
                  {meeting.duration} min
                </span>
              </span>
              <ChevronRight className="text-muted-foreground/50 h-4 w-4 shrink-0" />
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[11px]">Next meeting</p>
              <p className="text-sm">No more meetings today</p>
            </div>
          )}
          {joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-accent flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition"
            >
              <Video className="h-3.5 w-3.5" />
              Join
            </a>
          )}
        </div>
      )}
    </section>
  );
}
