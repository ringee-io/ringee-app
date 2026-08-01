/**
 * Zero-dependency DOM helpers shared by every UI component.
 *
 * The UI is intentionally framework-free: it renders into a Shadow DOM so the
 * host CRM's stylesheet can never leak in (and ours can never leak out), while
 * theming still flows through inherited CSS custom properties. `h()` is a tiny
 * hyperscript; the rest are focus / a11y / lifecycle utilities.
 */

type Child = Node | string | number | false | null | undefined;

export interface ElProps {
  class?: string;
  id?: string;
  type?: string;
  role?: string;
  title?: string;
  href?: string;
  tabIndex?: number;
  text?: string;
  html?: string;
  hidden?: boolean;
  disabled?: boolean;
  value?: string;
  placeholder?: string;
  /** Extra attributes (aria-*, data-*, inputmode, autocomplete, …). */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /** Inline style overrides — used sparingly (dynamic values only). */
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  /** Event listeners keyed by event name. */
  on?: Partial<Record<string, (ev: Event) => void>>;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "g",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "stop",
  "ellipse",
]);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(
  tag: string,
  props?: ElProps,
  ...children: Child[]
): HTMLElement;
export function h(
  tag: string,
  props: ElProps = {},
  ...children: Child[]
): HTMLElement {
  const el = SVG_TAGS.has(tag)
    ? (document.createElementNS(SVG_NS, tag) as unknown as HTMLElement)
    : document.createElement(tag);

  if (props.class) el.setAttribute("class", props.class);
  if (props.id) el.id = props.id;
  if (props.type) (el as HTMLInputElement).type = props.type;
  if (props.role) el.setAttribute("role", props.role);
  if (props.title) el.setAttribute("title", props.title);
  if (props.href) el.setAttribute("href", props.href);
  if (props.tabIndex !== undefined) el.tabIndex = props.tabIndex;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.hidden) el.hidden = true;
  if (props.disabled) (el as HTMLButtonElement).disabled = true;
  if (props.value !== undefined) (el as HTMLInputElement).value = props.value;
  if (props.placeholder !== undefined)
    (el as HTMLInputElement).placeholder = props.placeholder;

  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (props.style) {
    for (const [k, v] of Object.entries(props.style)) {
      if (v == null) continue;
      if (k.startsWith("--")) el.style.setProperty(k, String(v));
      else (el.style as unknown as Record<string, string>)[k] = String(v);
    }
  }
  if (props.on) {
    for (const [ev, fn] of Object.entries(props.on)) {
      if (fn) el.addEventListener(ev, fn as EventListener);
    }
  }

  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
}

/** Replace all children of `parent` with `next`. */
export function replaceChildren(parent: Node, ...next: Child[]): void {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  append(parent, next);
}

/** Toggle a class and return the element (chainable). */
export function toggleClass(
  el: HTMLElement,
  name: string,
  on: boolean,
): HTMLElement {
  el.classList.toggle(name, on);
  return el;
}

/** Focusable selector used by the focus trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableWithin(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Trap Tab focus inside `container`. Returns a disposer. Respects the caller's
 * active element for restoration.
 */
export function trapFocus(container: HTMLElement): () => void {
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Tab") return;
    const items = focusableWithin(container);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = (container.getRootNode() as ShadowRoot | Document)
      .activeElement as HTMLElement | null;
    if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", onKey);
  return () => container.removeEventListener("keydown", onKey);
}

/** requestAnimationFrame that is safe under SSR / reduced test environments. */
export function raf(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 16);
}

let idCounter = 0;
/** Stable unique id for aria wiring. */
export function uid(prefix = "ringee"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
