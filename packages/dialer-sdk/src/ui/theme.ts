/**
 * Theme tokens exposed as CSS custom properties. Integrators override any of
 * the public `--ringee-*` variables (via the `theme` option or by setting them
 * on an ancestor — custom properties inherit through the shadow boundary).
 *
 * The default palette is Ringee's brand emerald on a neutral surface, with a
 * hand-tuned dark variant. Every default pair clears WCAG AA for body text.
 */

export type ColorScheme = "light" | "dark" | "auto";

/** Public, documented theme knobs. All optional; unset falls back to defaults. */
export interface RingeeTheme {
  primary?: string;
  primaryHover?: string;
  onPrimary?: string;
  background?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
  border?: string;
  danger?: string;
  success?: string;
  warning?: string;
  radius?: string;
  shadow?: string;
  fontFamily?: string;
  /** Force a color scheme; defaults to `auto` (follows the OS). */
  colorScheme?: ColorScheme;
}

const VAR: Record<keyof Omit<RingeeTheme, "colorScheme">, string> = {
  primary: "--ringee-primary",
  primaryHover: "--ringee-primary-hover",
  onPrimary: "--ringee-on-primary",
  background: "--ringee-background",
  surface: "--ringee-surface",
  text: "--ringee-text",
  textMuted: "--ringee-text-muted",
  border: "--ringee-border",
  danger: "--ringee-danger",
  success: "--ringee-success",
  warning: "--ringee-warning",
  radius: "--ringee-radius",
  shadow: "--ringee-shadow",
  fontFamily: "--ringee-font-family",
};

/**
 * Default values live in the stylesheet (`:host` for light, the dark block for
 * `prefers-color-scheme: dark`). This only writes the *overrides* an integrator
 * passed, as inline custom properties on the host, so it never fights the
 * scheme-aware defaults for tokens the integrator didn't touch.
 */
export function applyTheme(host: HTMLElement, theme: RingeeTheme = {}): void {
  for (const key of Object.keys(VAR) as (keyof typeof VAR)[]) {
    const value = theme[key];
    if (value != null && value !== "") host.style.setProperty(VAR[key], value);
    else host.style.removeProperty(VAR[key]);
  }
  const scheme = theme.colorScheme ?? "auto";
  host.setAttribute("data-ringee-scheme", scheme);
  // `color-scheme` keeps native controls (scrollbars, autofill) on-theme.
  host.style.colorScheme =
    scheme === "auto" ? "light dark" : scheme;
}
