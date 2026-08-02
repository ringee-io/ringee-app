/**
 * A small, consistent line-icon set (24×24, 1.75 stroke, round caps/joins) so
 * every glyph in the dialer reads as one family. Icons `currentColor`, so they
 * inherit button/text color automatically. Kept inline to avoid any external
 * asset request from an embedded CRM page.
 */

const PATHS: Record<string, string> = {
  // Communication
  phone:
    '<path d="M4.5 5.5c0-.8.7-1.5 1.5-1.5h2.2c.6 0 1.2.4 1.4 1l.9 2.6c.2.5 0 1.1-.4 1.5l-1.3 1.1a12 12 0 0 0 5 5l1.1-1.3c.4-.4 1-.6 1.5-.4l2.6.9c.6.2 1 .8 1 1.4V18c0 .8-.7 1.5-1.5 1.5A15 15 0 0 1 4.5 5.5Z"/>',
  phoneOff:
    '<path d="M10.7 5.1 9.6 4c-.2-.6-.8-1-1.4-1H6c-.8 0-1.5.7-1.5 1.5a15 15 0 0 0 4 9.9M14 14.2a15 15 0 0 0 4.3 2.3H18c.8 0 1.5-.7 1.5-1.5v-2.2c0-.6-.4-1.2-1-1.4l-2.6-.9c-.5-.2-1.1 0-1.5.4l-.9.8"/><line x1="3" y1="3" x2="21" y2="21"/>',
  phoneOutgoing:
    '<path d="M4.5 5.5c0-.8.7-1.5 1.5-1.5h2.2c.6 0 1.2.4 1.4 1l.9 2.6c.2.5 0 1.1-.4 1.5l-1.3 1.1a12 12 0 0 0 5 5l1.1-1.3c.4-.4 1-.6 1.5-.4l2.6.9c.6.2 1 .8 1 1.4V18c0 .8-.7 1.5-1.5 1.5A15 15 0 0 1 4.5 5.5Z"/><polyline points="16 8 20 4"/><polyline points="16 4 20 4 20 8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/>',
  micOff:
    '<path d="M15 5a3 3 0 0 0-6 0v4M9 12a3 3 0 0 0 5.1 2.1M6 11a6 6 0 0 0 9.5 4.9M12 17v3"/><line x1="3" y1="3" x2="21" y2="21"/>',
  grid: '<rect x="4" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="16" y="4" width="4" height="4" rx="1"/><rect x="4" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="16" y="10" width="4" height="4" rx="1"/><rect x="4" y="16" width="4" height="4" rx="1"/><rect x="10" y="16" width="4" height="4" rx="1"/><rect x="16" y="16" width="4" height="4" rx="1"/>',
  pause: '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>',
  play: '<polygon points="7 4 19 12 7 20 7 4"/>',
  // Navigation / chrome
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  chevronLeft: '<polyline points="15 6 9 12 15 18"/>',
  check: '<polyline points="4 12 9 17 20 6"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  // Status / feedback
  alert:
    '<path d="M12 3 2.5 20h19L12 3Z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17.3" r=".4" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r=".5" fill="currentColor" stroke="none"/>',
  shield:
    '<path d="M12 3 5 6v5c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"/><polyline points="9 12 11 14 15 10"/>',
  refresh:
    '<path d="M20 11a8 8 0 0 0-14-4.5L4 8"/><polyline points="4 4 4 8 8 8"/><path d="M4 13a8 8 0 0 0 14 4.5L20 16"/><polyline points="20 20 20 16 16 16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  logout:
    '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><polyline points="9 8 5 12 9 16"/><line x1="5" y1="12" x2="15" y2="12"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="4 7 12 13 20 7"/>',
  delete: '<line x1="4" y1="12" x2="14" y2="12"/><polyline points="9 7 4 12 9 17"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
};

/** Return an inline `<svg>` element for the named glyph. */
export function icon(name: keyof typeof PATHS | string, size = 20): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = PATHS[name] ?? "";
  return svg;
}

/** The Ringee brand mark: a phone glyph inside a signal ring, in brand color. */
export function brandMark(size = 22): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = `
    <rect width="32" height="32" rx="9" fill="var(--ringee-primary)"/>
    <path d="M11.2 10.4c0-.7.5-1.2 1.2-1.2h1.7c.5 0 .9.3 1.1.8l.7 2c.1.4 0 .9-.4 1.2l-.9.8a8.5 8.5 0 0 0 3.6 3.6l.8-.9c.3-.3.8-.5 1.2-.4l2 .7c.5.2.8.6.8 1.1v1.7c0 .7-.5 1.2-1.2 1.2A11 11 0 0 1 11.2 10.4Z" fill="#fff"/>
    <path d="M20.5 8.2a6.4 6.4 0 0 1 3.3 3.3M19.3 11a3 3 0 0 1 1.7 1.7" stroke="#fff" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".9"/>
  `;
  return svg;
}
