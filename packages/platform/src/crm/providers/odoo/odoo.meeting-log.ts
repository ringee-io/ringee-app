import type { CrmMeetingInput } from "../../types";
import { odooIdempotencyTag } from "./odoo.mapper";

/**
 * Produces the human-facing summary + HTML body that is posted to the
 * partner/lead chatter and used as the `mail.activity` summary/note
 * when syncing a Ringee meeting. Identical content for both Odoo
 * providers so the chatter timeline is consistent regardless of API mode.
 */
export function buildOdooMeetingLog(input: CrmMeetingInput): {
  summary: string;
  body: string;
  activitySummary: string;
  activityNote: string;
} {
  const startStr = input.startAt.toISOString();
  const endStr = input.endAt.toISOString();

  const lines: string[] = [];
  lines.push(
    `<p><strong>Meeting scheduled</strong> — ${escapeHtml(input.title)}</p>`,
  );
  lines.push("<ul>");
  lines.push(`<li><strong>Start:</strong> ${escapeHtml(startStr)}</li>`);
  lines.push(`<li><strong>End:</strong> ${escapeHtml(endStr)}</li>`);
  if (input.timezone) {
    lines.push(`<li><strong>Timezone:</strong> ${escapeHtml(input.timezone)}</li>`);
  }
  if (input.ownerName) {
    lines.push(`<li><strong>Organizer:</strong> ${escapeHtml(input.ownerName)}</li>`);
  }
  if (input.calendarProvider) {
    lines.push(`<li><strong>Calendar:</strong> ${escapeHtml(input.calendarProvider)}</li>`);
  }
  lines.push("</ul>");

  if (input.attendees.length > 0) {
    lines.push(`<p><strong>Attendees</strong></p><ul>`);
    for (const a of input.attendees) {
      const parts = [a.name, a.email].filter(Boolean).map((v) => escapeHtml(v!));
      lines.push(`<li>${parts.join(" — ") || "Unknown"}</li>`);
    }
    lines.push("</ul>");
  }

  if (input.description && input.description.trim()) {
    lines.push(`<p><strong>Description</strong></p><p>${escapeHtml(input.description.trim())}</p>`);
  }

  const linkParts: string[] = [];
  if (input.meetingUrl) {
    linkParts.push(
      `<a href="${escapeAttr(input.meetingUrl)}" target="_blank" rel="noopener">Join meeting</a>`,
    );
  }
  if (input.ringeeMeetingUrl) {
    linkParts.push(
      `<a href="${escapeAttr(input.ringeeMeetingUrl)}" target="_blank" rel="noopener">View in Ringee</a>`,
    );
  }
  if (input.sourceCallUrl) {
    linkParts.push(
      `<a href="${escapeAttr(input.sourceCallUrl)}" target="_blank" rel="noopener">Source call</a>`,
    );
  }
  if (input.recordingUrl) {
    linkParts.push(
      `<a href="${escapeAttr(input.recordingUrl)}" target="_blank" rel="noopener">Recording</a>`,
    );
  }
  if (linkParts.length > 0) {
    lines.push(`<p>${linkParts.join(" · ")}</p>`);
  }

  lines.push(
    `<p><em>Synced from Ringee · ${escapeHtml(odooIdempotencyTag(input.idempotencyKey))}</em></p>`,
  );

  const summary = `Ringee meeting — ${input.title}`;

  return {
    summary,
    body: lines.join(""),
    activitySummary: summary,
    activityNote: lines.join(""),
  };
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(v: string): string {
  return escapeHtml(v).replace(/"/g, "&quot;");
}
