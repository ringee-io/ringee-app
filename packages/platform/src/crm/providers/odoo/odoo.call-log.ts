import type { CrmCallLogInput } from "../../types";
import { odooIdempotencyTag } from "./odoo.mapper";

/**
 * Produces the human-facing summary + HTML body that is posted to the
 * partner/lead chatter and used as the `mail.activity` summary/note.
 * Identical content for both Odoo providers so the chatter timeline is
 * consistent regardless of API mode.
 */
export function buildOdooCallLog(input: CrmCallLogInput): {
  summary: string;
  body: string;
  activitySummary: string;
  activityNote: string;
} {
  const startedAt = input.startedAt.toISOString();
  const durationMin = input.durationSeconds
    ? Math.max(1, Math.round(input.durationSeconds / 60))
    : null;

  const lines: string[] = [];
  lines.push(
    `<p><strong>${input.direction === "outbound" ? "Outbound" : "Inbound"} call</strong> — ${escapeHtml(
      startedAt,
    )}</p>`,
  );
  lines.push("<ul>");
  lines.push(`<li><strong>From:</strong> ${escapeHtml(input.from)}</li>`);
  lines.push(`<li><strong>To:</strong> ${escapeHtml(input.to)}</li>`);
  if (durationMin !== null) {
    lines.push(`<li><strong>Duration:</strong> ${durationMin} min</li>`);
  }
  if (input.outcomeLabel) {
    lines.push(
      `<li><strong>Outcome:</strong> ${escapeHtml(input.outcomeLabel)}</li>`,
    );
  }
  if (input.agentName) {
    lines.push(
      `<li><strong>Agent:</strong> ${escapeHtml(input.agentName)}</li>`,
    );
  }
  lines.push("</ul>");

  if (input.notes && input.notes.trim()) {
    lines.push(
      `<p><strong>Notes</strong></p><p>${escapeHtml(input.notes.trim())}</p>`,
    );
  }
  if (input.summary && input.summary.trim()) {
    lines.push(
      `<p><strong>Summary</strong></p><p>${escapeHtml(input.summary.trim())}</p>`,
    );
  }
  if (input.insights && Object.keys(input.insights).length > 0) {
    lines.push(`<p><strong>Insights</strong></p><ul>`);
    for (const [key, val] of Object.entries(input.insights)) {
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(
        `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(val))}</li>`,
      );
    }
    lines.push(`</ul>`);
  }
  if (input.meetingUrl) {
    lines.push(
      `<p><a href="${escapeAttr(input.meetingUrl)}" target="_blank" rel="noopener">Join meeting</a></p>`,
    );
  }
  if (input.recordingUrl) {
    lines.push(
      `<p><a href="${escapeAttr(input.recordingUrl)}" target="_blank" rel="noopener">Listen to recording</a></p>`,
    );
  }
  if (input.transcriptUrl) {
    lines.push(
      `<p><a href="${escapeAttr(input.transcriptUrl)}" target="_blank" rel="noopener">View transcript</a></p>`,
    );
  }
  if (input.transcript && input.transcript.trim()) {
    lines.push(
      `<details><summary>Transcript</summary><pre>${escapeHtml(input.transcript.trim())}</pre></details>`,
    );
  }
  lines.push(
    `<p><em>Synced from Ringee · ${escapeHtml(odooIdempotencyTag(input.idempotencyKey))}</em></p>`,
  );

  const summary = input.outcomeLabel
    ? `Ringee call — ${input.outcomeLabel}`
    : `Ringee ${input.direction} call`;

  return {
    summary,
    body: lines.join(""),
    activitySummary: summary,
    activityNote: lines.join(""),
  };
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(v: string): string {
  return escapeHtml(v).replace(/"/g, "&quot;");
}
