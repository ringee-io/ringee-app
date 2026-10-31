import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  isPrivateHost,
  isReservedAddress,
  requestPublic,
  ResponseTooLargeError,
} from "@ringee/platform";

/**
 * Parsing and fetching a user-supplied web address that Ringee retrieves on
 * their behalf.
 *
 * Three places do this — drafting company context from a website, crawling a
 * page into a knowledge base, and reviewing a demo request's company website —
 * and all take the address from someone outside and make a server-side request
 * with it. Without this the API is a request forwarder aimed at Ringee's own
 * network.
 *
 * A hostname check alone is not enough, so this module enforces three things:
 * only http(s); the host must not *resolve* to a reserved address (a public
 * name can point at 127.0.0.1 or at a cloud metadata endpoint); and every
 * redirect hop is checked again, because the first response is free to send the
 * request somewhere the first check would have refused.
 */

/** How many redirects to follow before giving up. */
const MAX_REDIRECTS = 5;

/**
 * Most of a page Ringee reads, counted after decompression: a few kilobytes of
 * gzip can expand past what the process can hold.
 */
const MAX_PAGE_BYTES = 1_000_000;

export function requirePublicUrl(raw: string | null | undefined): URL {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new BadRequestException("A web address is required.");
  }

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new BadRequestException(`"${raw}" is not a valid web address.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException(
      "Only http and https addresses are supported.",
    );
  }
  if (isPrivateHost(url.hostname)) {
    throw new BadRequestException("That address is not a public website.");
  }
  return url;
}

/**
 * Fetches a URL that has already passed `requirePublicUrl`, re-checking the
 * target before every request.
 *
 * Redirects are followed by hand rather than by `redirect: "follow"`: the
 * built-in follow never re-runs the check, so one 302 to `http://169.254.169.254`
 * is all it takes to read a cloud metadata endpoint through this API.
 *
 * Returns null when the address cannot be retrieved. Callers treat that as "no
 * content", never as an error worth surfacing — the address came from a user
 * and being unreachable is an ordinary outcome.
 */
export async function fetchPublicPage(
  url: URL,
  init: { timeoutMs: number; headers?: Record<string, string> },
): Promise<Response | null> {
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvesToPublicAddress(target);

    // Redirects come back here, so the next hop goes through the check above;
    // the socket itself only connects to an address that passes it.
    const response = await requestPublic(target, {
      timeoutMs: init.timeoutMs,
      headers: init.headers,
      maxBodyBytes: MAX_PAGE_BYTES,
    });

    if (!isRedirect(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel().catch(() => undefined);

    // A relative Location resolves against the hop it came from.
    const next = new URL(location, target);
    if (next.protocol !== "https:" && next.protocol !== "http:") return null;
    if (isPrivateHost(next.hostname)) return null;
    target = next;
  }

  return null;
}

/**
 * The markup of a page `fetchPublicPage` returned, read only up to the page
 * budget. The page is someone else's to size, so a longer one is cut off there
 * rather than read whole — and its beginning still counts as the page.
 */
export async function readPageText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (size < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      size += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    // The transport fails the body past the same budget; what arrived before
    // that is the page, cut off.
    if (!(error instanceof ResponseTooLargeError)) throw error;
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

/**
 * A fetched page as plain text, for a model to read: no comments, scripts,
 * styles or tags. Never rendered — but end tags are matched the way browsers
 * accept them (`</script >`, `</script foo>`, comments closed by `--!>`), so
 * the page cannot hide script source in the text by writing them oddly.
 *
 * One pass with `indexOf`, never a backtracking pattern: the page is someone
 * else's, and thousands of unclosed `<script` or `<` would make a regex scan
 * the rest of the document from each of them.
 */
export function htmlToText(html: string): string {
  const lower = html.toLowerCase();
  let text = "";
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    if (open === -1) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, open) + " ";

    if (lower.startsWith("<!--", open)) {
      // An unclosed comment runs to the end of the document, as in a browser.
      const end = commentEnd(lower, open + 4);
      if (end === -1) break;
      i = end;
      continue;
    }

    const rawText = rawTextElementAt(lower, open);
    if (rawText) {
      // An unclosed script or style hides the rest of the document.
      const close = closingTagAt(lower, rawText, open + rawText.length + 1);
      if (close === -1) break;
      const end = lower.indexOf(">", close);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    const end = html.indexOf(">", open + 1);
    if (end === -1) {
      // No `>` anywhere after this point: nothing else can be a tag.
      text += html.slice(open);
      break;
    }
    i = end + 1;
  }
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Index just past the comment closed after `from` (`-->` or `--!>`), or -1. */
function commentEnd(lower: string, from: number): number {
  let at = lower.indexOf("--", from);
  while (at !== -1) {
    if (lower.startsWith("-->", at)) return at + 3;
    if (lower.startsWith("--!>", at)) return at + 4;
    at = lower.indexOf("--", at + 1);
  }
  return -1;
}

const RAW_TEXT_ELEMENTS = ["script", "style"] as const;

/** `script` or `style` when an opening tag of one starts at `at`. */
function rawTextElementAt(
  lower: string,
  at: number,
): (typeof RAW_TEXT_ELEMENTS)[number] | null {
  for (const name of RAW_TEXT_ELEMENTS) {
    if (
      lower.startsWith(`<${name}`, at) &&
      !isNameChar(lower[at + name.length + 1])
    ) {
      return name;
    }
  }
  return null;
}

/** Where the element's end tag (`</name` then a non-name character) starts. */
function closingTagAt(lower: string, name: string, from: number): number {
  let at = lower.indexOf(`</${name}`, from);
  while (at !== -1 && isNameChar(lower[at + name.length + 2])) {
    at = lower.indexOf(`</${name}`, at + 1);
  }
  return at;
}

function isNameChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9_]/.test(ch);
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * Resolves the hostname and refuses the request when any address it answers
 * with is reserved.
 *
 * Every address is checked, not just the first: a name that answers with one
 * public and one loopback address must not be fetched, because which one the
 * socket picks is not ours to decide.
 */
async function assertResolvesToPublicAddress(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");

  // An IP literal was already checked by `isPrivateHost`; there is nothing to
  // resolve, and asking DNS about it would only add a round trip.
  if (isIP(host)) return;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    // A name that does not resolve cannot be fetched either way. Refusing here
    // keeps the failure on this side of the socket.
    throw new BadRequestException("That address could not be resolved.");
  }

  if (addresses.some((entry) => isReservedAddress(entry.address))) {
    throw new BadRequestException("That address is not a public website.");
  }
}
