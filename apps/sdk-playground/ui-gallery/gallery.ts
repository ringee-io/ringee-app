/**
 * Visual playground for the Ringee Dialer SDK UI. Renders every required state
 * of both the Floating panel and the Dialer Bar as frozen tiles (driven by a
 * no-network {@link MockDialer}), plus a fully clickable live demo of each
 * surface. Build with esbuild (see build.mjs) and open index.html.
 */
import { DialerModel } from "../../../packages/dialer-sdk/src/ui/dialer-model";
import { CardView } from "../../../packages/dialer-sdk/src/ui/card-view";
import { BarView } from "../../../packages/dialer-sdk/src/ui/bar-view";
import { createShadowMount } from "../../../packages/dialer-sdk/src/ui/shadow-root";
import { resolveStrings } from "../../../packages/dialer-sdk/src/ui/strings";
import { icon } from "../../../packages/dialer-sdk/src/ui/icons";
import { createFloating, createBar } from "../../../packages/dialer-sdk/src/ui/factory";
import type { RingeeCall } from "../../../packages/dialer-sdk/src/types";
import type { RingeeTheme } from "../../../packages/dialer-sdk/src/ui/theme";
import { MockDialer, DEMO_AGENT, DEMO_CALLER_IDS } from "./mock-dialer";

const CONTACT = { name: "Marcos Herrera", number: "+13055550142", contactId: "c1" };
const strings = resolveStrings("es");
// Default the gallery to light so it matches the page chrome; the header toggle
// (or `?theme=dark`) flips every mounted surface to the hand-tuned dark palette.
const START_DARK =
  typeof location !== "undefined" && /(\?|&)theme=dark/.test(location.search);
const theme: RingeeTheme = { colorScheme: START_DARK ? "dark" : "light" };
if (START_DARK && typeof document !== "undefined") {
  document.documentElement.setAttribute("data-demo-theme", "dark");
}

function activeCall(withAnswer: boolean, state: RingeeCall["state"]): RingeeCall {
  return {
    id: "call_1", to: CONTACT.number, from: DEMO_CALLER_IDS[0]!.phoneNumber,
    direction: "outbound", state,
    startedAt: new Date(Date.now() - 130000),
    answeredAt: withAnswer ? new Date(Date.now() - 125000) : null,
    endedAt: null, durationSeconds: 0, muted: false, held: false,
  };
}

/** Build a frozen model in a specific state without any events/network. */
function frozenModel(setup: {
  auth: Parameters<MockDialer["presetAuth"]>[0];
  state: Parameters<MockDialer["presetState"]>[0];
  patch?: (m: DialerModel, mock: MockDialer) => void;
}): { model: DialerModel } {
  const mock = new MockDialer({ mode: "static" });
  mock.presetAuth(setup.auth).presetState(setup.state);
  const model = new DialerModel(mock as never, { strings, allowHold: true });
  model.agent = DEMO_AGENT;
  model.callerIds = DEMO_CALLER_IDS;
  setup.patch?.(model, mock);
  return { model };
}

// ── Tile helpers ──────────────────────────────────────────────────────────────
function tile(label: string, note: string): { root: HTMLElement; stage: HTMLElement } {
  const stage = el("div", "stage");
  const root = el("figure", "tile");
  root.append(
    stage,
    (() => {
      const cap = el("figcaption", "cap");
      cap.append(el("b", "", label), el("span", "note", note));
      return cap;
    })(),
  );
  return { root, stage };
}

function panelTile(
  label: string,
  note: string,
  setup: Parameters<typeof frozenModel>[0],
  opts: { width?: number } = {},
) {
  const { root, stage } = tile(label, note);
  stage.classList.add("stage--panel");
  const mount = createShadowMount(stage, theme);
  const { model } = frozenModel(setup);
  const card = new CardView(model, {
    showMinimize: true,
    onMinimize: () => undefined,
    onClose: () => undefined,
  });
  card.el.classList.add("rg-panel");
  card.el.style.width = `${opts.width ?? 360}px`;
  card.el.style.animation = "none";
  mount.root.appendChild(card.el);
  return root;
}

function barTile(
  label: string,
  note: string,
  setup: Parameters<typeof frozenModel>[0],
  width = 640,
) {
  const { root, stage } = tile(label, note);
  const mount = createShadowMount(stage, theme);
  const { model } = frozenModel(setup);
  const bar = new BarView(model);
  const frame = el("div", "barframe");
  frame.style.width = `${width}px`;
  frame.style.maxWidth = "100%";
  frame.appendChild(bar.el);
  mount.root.appendChild(frame);
  return root;
}

function launcherTile(label: string, note: string) {
  const { root, stage } = tile(label, note);
  stage.classList.add("stage--launcher");
  const mount = createShadowMount(stage, theme);
  const btn = el("button", "");
  btn.className = "rg-launcher";
  btn.setAttribute("aria-label", strings.launcherOpen);
  btn.title = strings.launcherOpen;
  btn.appendChild(icon("phone", 24));
  const holder = el("div", "");
  holder.style.position = "static";
  holder.className = "rg-floating";
  holder.setAttribute("data-side", "right");
  holder.style.position = "static";
  holder.style.alignItems = "center";
  holder.appendChild(btn);
  mount.root.appendChild(holder);
  return root;
}

// ── Sections ──────────────────────────────────────────────────────────────────
function section(title: string, tiles: HTMLElement[]): HTMLElement {
  const grid = el("div", "grid");
  grid.append(...tiles);
  const sec = el("section", "");
  sec.append(el("h2", "", title), grid);
  return sec;
}

function buildFloatingSection(): HTMLElement {
  return section("Floating dialer", [
    launcherTile("1 · Cerrado", "Launcher fijo con tooltip"),
    panelTile("2 · Correo", "Identifica tu cuenta", { auth: "anonymous", state: "uninitialized" }),
    panelTile("3 · Código (OTP)", "6 dígitos, autoavance", {
      auth: "awaiting_code", state: "uninitialized",
      patch: (m) => { m.challenge = { id: "c", maskedEmail: "va***@empresa.com", expiresAt: new Date(Date.now() + 3e5), resendAvailableAt: new Date(Date.now() + 12000) }; },
    }),
    panelTile("4 · Listo", "Contacto + número + caller ID", {
      auth: "authenticated", state: "ready",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; },
    }),
    panelTile("5 · Sonando", "Marcando / Sonando", {
      auth: "authenticated", state: "ringing",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; m.activeCall = activeCall(false, "ringing"); },
    }),
    panelTile("6 · En llamada", "Timer + controles", {
      auth: "authenticated", state: "active",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; m.activeCall = activeCall(true, "active"); },
    }),
    panelTile("7 · Teclado (DTMF)", "Keypad desplegado", {
      auth: "authenticated", state: "active",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; m.activeCall = activeCall(true, "active"); m.keypadOpen = true; },
    }),
    panelTile("8 · Error", "Código incorrecto, accionable", {
      auth: "awaiting_code", state: "uninitialized",
      patch: (m) => {
        m.challenge = { id: "c", maskedEmail: "va***@empresa.com", expiresAt: new Date(Date.now() + 3e5), resendAvailableAt: new Date(Date.now() + 12000) };
        m.banner = { title: strings.errors.INVALID_EMAIL_CODE.title, message: strings.errors.INVALID_EMAIL_CODE.message, action: "none", tone: "error" };
      },
    }),
    panelTile("9 · Finalizada", "Resumen + nueva llamada", {
      auth: "authenticated", state: "ready",
      patch: (m, mock) => { m.contact = CONTACT; m.number = CONTACT.number; mock.emit("ended", { call: { ...activeCall(true, "ended"), state: "ended", durationSeconds: 137, endedAt: new Date() } }); },
    }),
  ]);
}

function buildBarSection(): HTMLElement {
  return section("Dialer Bar", [
    barTile("10 · Correo", "Login inline", { auth: "anonymous", state: "uninitialized" }),
    barTile("11 · Listo", "Número + caller ID + llamar", {
      auth: "authenticated", state: "ready",
      patch: (m) => { m.number = CONTACT.number; },
    }),
    barTile("12 · Sonando", "Contacto + estado + cancelar", {
      auth: "authenticated", state: "ringing",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; m.activeCall = activeCall(false, "ringing"); },
    }),
    barTile("13 · En llamada", "Contacto + timer + controles", {
      auth: "authenticated", state: "active",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; m.activeCall = activeCall(true, "active"); },
    }),
    barTile("14 · Contenedor estrecho (320px)", "Colapsa a lo esencial", {
      auth: "authenticated", state: "active",
      patch: (m) => { m.contact = CONTACT; m.number = CONTACT.number; m.activeCall = activeCall(true, "active"); },
    }, 320),
  ]);
}

// ── Live interactive demo ──────────────────────────────────────────────────────
function buildLiveSection(): HTMLElement {
  const barHost = el("div", "");
  barHost.id = "live-bar";
  const wrap = el("div", "live");
  const barFrame = el("div", "barframe");
  barFrame.style.width = "720px";
  barFrame.style.maxWidth = "100%";
  barFrame.appendChild(barHost);
  wrap.append(
    (() => { const p = el("p", "hint"); p.textContent = "Demo interactiva (simulada, sin backend). Escribe cualquier correo → cualquier código de 6 dígitos → Llamar."; return p; })(),
    barFrame,
    (() => { const p = el("p", "hint"); p.textContent = "El Floating dialer está abajo a la derecha ↘"; return p; })(),
  );
  const sec = el("section", "");
  sec.append(el("h2", "", "Demo en vivo"), wrap);

  // Mount after the DOM is in place.
  queueMicrotask(() => {
    createBar({ dialer: new MockDialer({ mode: "interactive" }) as never, container: barHost, locale: "es", allowHold: true, theme });
    createFloating({ dialer: new MockDialer({ mode: "interactive" }) as never, locale: "es", allowHold: true, side: "right", theme });
  });
  return sec;
}

// ── Boot ────────────────────────────────────────────────────────────────────
function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function themeToggle(): HTMLElement {
  const btn = el("button", "themebtn", "◐  Tema");
  let dark = false;
  btn.onclick = () => {
    dark = !dark;
    document.documentElement.setAttribute("data-demo-theme", dark ? "dark" : "light");
    document.querySelectorAll<HTMLElement>("[data-ringee-root]").forEach((h) => {
      h.setAttribute("data-ringee-scheme", dark ? "dark" : "light");
    });
  };
  return btn;
}

const app = document.getElementById("app")!;
const header = el("header", "hd");
header.append(
  (() => { const h = el("h1", "", "Ringee Dialer SDK — UI"); return h; })(),
  (() => { const p = el("p", "sub", "Floating & Bar · sistema visual compartido · estados completos"); return p; })(),
  themeToggle(),
);
app.append(header, buildFloatingSection(), buildBarSection(), buildLiveSection());
