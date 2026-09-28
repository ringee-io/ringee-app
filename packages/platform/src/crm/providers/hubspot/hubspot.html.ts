/**
 * HubSpot renders activity bodies (`hs_call_body`, `hs_note_body`,
 * `hs_task_body`, `hs_meeting_body`) as rich text — HTML, not markdown. Every
 * body this adapter writes is assembled here, so escaping lives in one place:
 * note text is typed by users and a transcript is whatever the caller said.
 */

/**
 * A private-use character marks where a rendered link is put back after the
 * surrounding text is escaped. Stripped from the input first, so text cannot
 * forge one.
 */
const MARK = "";
const MARKS = //g;
const PLACEHOLDER = /(\d+)/g;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>"']+/g;
const BOLD = /\*\*([^*\n]+?)\*\*/g;
/** Punctuation and markdown emphasis that end a sentence, not a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]*_]+$/;
const LIST_ITEM = /^\s*[-*]\s+/;
const HEADING = /^#{1,6}\s+/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The URL when it is an absolute http(s) URL, otherwise null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** An anchor for a URL that already passed `safeHttpUrl`. */
export function htmlLink(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

/** Plain text as HTML: escaped, line breaks kept. */
export function textToHtml(text: string): string {
  return escapeHtml(text.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

/**
 * The small markdown dialect the CRM services write note bodies in —
 * `**bold**`, `[label](url)`, `- item` lists, `#` heading lines and
 * blank-line paragraphs — plus bare URLs, which become links. Anything else
 * is kept as literal, escaped text.
 */
export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map(renderBlock)
    .join("");
}

function renderBlock(block: string): string {
  const lines = block.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return "";

  if (lines.every((line) => LIST_ITEM.test(line))) {
    const items = lines.map(
      (line) => `<li>${renderInline(line.replace(LIST_ITEM, ""))}</li>`,
    );
    return `<ul>${items.join("")}</ul>`;
  }

  const rendered = lines.map((line) =>
    HEADING.test(line)
      ? `<strong>${renderInline(line.replace(HEADING, ""))}</strong>`
      : renderInline(line),
  );
  return `<p>${rendered.join("<br>")}</p>`;
}

function renderInline(text: string): string {
  const anchors: string[] = [];
  const stash = (html: string) => `${MARK}${anchors.push(html) - 1}${MARK}`;

  let out = text
    .replace(MARKS, "")
    .replace(MARKDOWN_LINK, (match, label: string, href: string) => {
      const url = safeHttpUrl(href);
      return url ? stash(htmlLink(url, label)) : match;
    });
  out = out.replace(BARE_URL, (match) => {
    const trimmed = match.replace(TRAILING_PUNCTUATION, "");
    const url = safeHttpUrl(trimmed);
    return url
      ? stash(htmlLink(url, trimmed)) + match.slice(trimmed.length)
      : match;
  });
  out = escapeHtml(out).replace(BOLD, "<strong>$1</strong>");
  return out.replace(
    PLACEHOLDER,
    (_match, index: string) => anchors[Number(index)] ?? "",
  );
}

/**
 * Renders `render(text)`, shortening `text` until the result fits `limit`.
 * What gets cut is the long free text (a transcript), never the markup around
 * it — cutting rendered HTML would leave a tag half open. If the fixed part
 * alone is over the limit the result stays over it; nothing Ringee writes
 * comes close.
 */
export function fitWithin(
  text: string,
  render: (text: string) => string,
  limit: number,
): string {
  let current = text;
  let html = render(current);
  for (
    let attempt = 0;
    html.length > limit && current.length > 0 && attempt < 8;
    attempt++
  ) {
    const keep = Math.floor(current.length * (limit / html.length) * 0.9);
    current =
      keep > 0 ? `${current.slice(0, keep).trimEnd()} … [truncated]` : "";
    html = render(current);
  }
  return html;
}
