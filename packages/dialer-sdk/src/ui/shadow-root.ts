/**
 * Creates the isolated Shadow DOM host every surface renders into. The
 * stylesheet is adopted once (constructable stylesheet when available, a
 * `<style>` fallback otherwise) and theme overrides are written to the host.
 */
import { STYLES } from "./styles";
import { applyTheme, type RingeeTheme } from "./theme";

export interface ShadowMount {
  host: HTMLElement;
  root: ShadowRoot;
  setTheme(theme: RingeeTheme): void;
  destroy(): void;
}

let sharedSheet: CSSStyleSheet | null = null;

function styleSheet(): CSSStyleSheet | null {
  if (typeof CSSStyleSheet === "undefined") return null;
  try {
    if (!sharedSheet) {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(STYLES);
    }
    return sharedSheet;
  } catch {
    return null;
  }
}

export function createShadowMount(
  parent: HTMLElement,
  theme: RingeeTheme = {},
): ShadowMount {
  const host = document.createElement("div");
  host.setAttribute("data-ringee-root", "");
  const root = host.attachShadow({ mode: "open" });

  const sheet = styleSheet();
  if (sheet && "adoptedStyleSheets" in root) {
    root.adoptedStyleSheets = [sheet];
  } else {
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);
  }

  applyTheme(host, theme);
  parent.appendChild(host);

  return {
    host,
    root,
    setTheme: (t) => applyTheme(host, t),
    destroy: () => host.remove(),
  };
}
