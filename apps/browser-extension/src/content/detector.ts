/**
 * Content script — runs on every http(s) page. It finds real phone numbers in
 * the rendered page and marks each one with a quiet underline. Hovering a number
 * reveals an animated popover anchored just above it with two actions: "Call with
 * Ringee" and "Hide"; it dismisses once the cursor leaves. The right-click
 * "Call with Ringee" menu (service worker) stays as a second way to call.
 *
 * It touches NOTHING privileged: no WebRTC, no auth, no caller ID. It only emits
 * a typed DIAL_REQUEST and lets the background worker do the gated work, and it
 * captures only non-sensitive, visible context (the number, the page URL/title,
 * and a nearby name when reasonable) — never inboxes, messages, or whole tables.
 */
import { extractNumbers } from "@ringee/dialer-core/phone";
import {
  MessageType,
  type DialRequestMsg,
  type PageOrigin,
} from "@ringee/dialer-core/contracts";
import { DEFAULT_REGION } from "../lib/region";

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "CODE",
  "PRE",
]);
const seen = new WeakSet<Text>();

function shouldSkip(node: Node): boolean {
  let el: Node | null = node.parentElement;
  while (el && el instanceof Element) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if ((el as HTMLElement).isContentEditable) return true;
    if (el.hasAttribute?.("data-ringee-anchor")) return true; // our own UI
    if (el.id === "ringee-layer") return true;
    el = el.parentElement;
  }
  return false;
}

function pageOrigin(): PageOrigin {
  return {
    url: location.href,
    title: document.title,
    source: location.hostname,
  };
}

/** Pull a likely contact name from common CRM/profile structures near the number. */
function inferName(node: Node): string | undefined {
  const card = node.parentElement?.closest(
    '[itemtype*="Person"], .contact, [data-contact-name], article, li',
  );
  const nameEl = card?.querySelector<HTMLElement>(
    '[itemprop="name"], [data-contact-name], h1, h2, .name',
  );
  const txt = nameEl?.textContent?.trim();
  return txt && txt.length < 80 ? txt : undefined;
}

function dial(e164: string, name?: string) {
  const msg: DialRequestMsg = {
    type: MessageType.DialRequest,
    target: { destination: e164, name, origin: pageOrigin() },
  };
  chrome.runtime.sendMessage(msg);
}

// ── Popover layer ─────────────────────────────────────────────────────────────
let layer: HTMLElement | null = null;
function ensureLayer(): HTMLElement {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.id = "ringee-layer";
  document.body.appendChild(layer);
  return layer;
}

interface Entry {
  anchor: HTMLElement;
  pop: HTMLElement;
  closeTimer?: number;
}
const open = new Map<HTMLElement, Entry>();

/** Cancel a pending hover-out dismissal (the cursor came back in time). */
function cancelClose(anchor: HTMLElement) {
  const entry = open.get(anchor);
  if (entry?.closeTimer !== undefined) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = undefined;
  }
}

/** Dismiss shortly after the cursor leaves, so crossing the small gap between
 * the number and the card (to click "Call") doesn't snap it shut. */
function scheduleClose(anchor: HTMLElement) {
  const entry = open.get(anchor);
  if (!entry) return;
  clearTimeout(entry.closeTimer);
  entry.closeTimer = window.setTimeout(() => closePop(anchor), 150);
}

const PHONE_SVG =
  `<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">` +
  `<path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.3 1z"/>` +
  `</svg>`;

// The Ringee mark (bundled icon, exposed via web_accessible_resources).
const RINGEE_ICON = chrome.runtime.getURL("src/icons/48.png");

function positionPop(pop: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const offscreen =
    r.bottom < 0 ||
    r.top > window.innerHeight ||
    (r.width === 0 && r.height === 0);
  if (offscreen) {
    pop.style.display = "none";
    return;
  }
  pop.style.display = "";
  pop.style.left = `${r.left + r.width / 2}px`;
  pop.style.top = `${r.top}px`;
}

function closePop(anchor: HTMLElement) {
  const entry = open.get(anchor);
  if (!entry) return;
  clearTimeout(entry.closeTimer);
  entry.pop.remove();
  open.delete(anchor);
}

function openPop(anchor: HTMLElement, e164: string, name?: string) {
  if (open.has(anchor)) return;
  const pop = document.createElement("div");
  pop.className = "ringee-pop";
  pop.innerHTML =
    `<div class="ringee-pop__card">` +
    `<div class="ringee-pop__head">` +
    `<img class="ringee-pop__icon" src="${RINGEE_ICON}" alt="" />` +
    `<span class="ringee-pop__brand">Ringee</span>` +
    `<span class="ringee-pop__num"></span>` +
    `</div>` +
    `<div class="ringee-pop__actions">` +
    `<button type="button" class="ringee-pop__btn ringee-pop__btn--call">${PHONE_SVG}<span>Call with Ringee</span></button>` +
    `<button type="button" class="ringee-pop__btn ringee-pop__btn--hide">Hide</button>` +
    `</div></div>`;
  pop.querySelector(".ringee-pop__num")!.textContent =
    anchor.textContent || e164;

  pop
    .querySelector(".ringee-pop__btn--call")!
    .addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dial(e164, name);
      pop.classList.add("ringee-pop--calling");
      pop.querySelector(".ringee-pop__btn--call span")!.textContent =
        "Calling…";
      setTimeout(() => closePop(anchor), 1200);
    });
  pop
    .querySelector(".ringee-pop__btn--hide")!
    .addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePop(anchor);
    });

  // Keep the card up while the cursor is over it; dismiss once it leaves.
  pop.addEventListener("mouseenter", () => cancelClose(anchor));
  pop.addEventListener("mouseleave", () => scheduleClose(anchor));

  ensureLayer().appendChild(pop);
  open.set(anchor, { anchor, pop });
  positionPop(pop, anchor);
}

let raf = 0;
function reposition() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    for (const { anchor, pop } of open.values()) {
      if (!anchor.isConnected) closePop(anchor);
      else positionPop(pop, anchor);
    }
  });
}
window.addEventListener("scroll", reposition, { passive: true, capture: true });
window.addEventListener("resize", reposition, { passive: true });

// ── Detection ─────────────────────────────────────────────────────────────────
/** Replace the number substring [start,end) of `textNode` with a marked span. */
function wrapNumber(textNode: Text, start: number, end: number): HTMLElement {
  textNode.splitText(end);
  const numNode = textNode.splitText(start);
  const span = document.createElement("span");
  span.setAttribute("data-ringee-anchor", "1");
  numNode.parentNode!.replaceChild(span, numNode);
  span.appendChild(numNode);
  return span;
}

function processTextNode(node: Text) {
  if (seen.has(node) || shouldSkip(node)) return;
  const text = node.nodeValue ?? "";
  if (text.length < 7) return;
  const found = extractNumbers(text, DEFAULT_REGION);
  if (!found.length) return;
  seen.add(node);

  const name = inferName(node);
  // Wrap right-to-left so earlier match offsets stay valid after each split.
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i];
    const anchor = wrapNumber(node, f.startsAt, f.endsAt);
    const e164 = f.e164;
    anchor.addEventListener("mouseenter", () => {
      cancelClose(anchor);
      openPop(anchor, e164, name);
    });
    anchor.addEventListener("mouseleave", () => scheduleClose(anchor));
    anchor.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPop(anchor, e164, name);
    });
  }
}

function scan(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.nodeValue?.trim().length ?? 0) >= 7
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const batch: Text[] = [];
  let cur = walker.nextNode();
  while (cur) {
    batch.push(cur as Text);
    cur = walker.nextNode();
  }
  batch.forEach(processTextNode);
}

// Debounced rescan for dynamic content (LinkedIn/HubSpot/Salesforce inject late).
let pending = 0;
const observer = new MutationObserver((mutations) => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) processTextNode(n as Text);
        else if (
          n.nodeType === Node.ELEMENT_NODE &&
          (n as Element).id !== "ringee-layer" &&
          !(n as Element).closest("[data-ringee-anchor]")
        )
          scan(n);
      });
    }
  });
});

/**
 * Never run on Ringee's own surfaces: the web app already IS the dialer, so
 * dropping "Call with Ringee" pills over its own phone numbers is noise. Covers
 * ringee.io + every subdomain (app/api/www) and the configured web-app host
 * (which is localhost in dev).
 */
function isRingeeOwnSite(): boolean {
  const host = location.hostname;
  if (host === "ringee.io" || host.endsWith(".ringee.io")) return true;
  try {
    const syncHost = import.meta.env.VITE_CLERK_SYNC_HOST as string | undefined;
    if (syncHost && new URL(syncHost).hostname === host) return true;
  } catch {
    /* ignore malformed env */
  }
  return false;
}

function start() {
  if (isRingeeOwnSite()) return;
  scan(document.body);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
