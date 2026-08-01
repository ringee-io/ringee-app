/**
 * The complete Ringee dialer stylesheet, scoped to the shadow root. Written as
 * one adopted stylesheet so the host CRM's CSS can neither leak in nor be
 * affected. Public theming is done exclusively through `--ringee-*` custom
 * properties (see theme.ts); everything else derives from them via color-mix.
 *
 * Design language: compact, calm, high-contrast. 4px spacing scale, soft radii,
 * discrete shadows, one accent. Motion is short and purposeful and fully
 * disabled under `prefers-reduced-motion`.
 */
export const STYLES = /* css */ `
:host {
  /* ── Public theme tokens (light defaults) ───────────────────────────── */
  --ringee-primary: #059669;
  --ringee-primary-hover: #047857;
  --ringee-on-primary: #ffffff;
  --ringee-background: #ffffff;
  --ringee-surface: #f5f7f9;
  --ringee-text: #0f172a;
  --ringee-text-muted: #64748b;
  --ringee-border: #e6e9ef;
  --ringee-danger: #dc2626;
  --ringee-success: #059669;
  --ringee-warning: #b45309;
  --ringee-radius: 18px;
  --ringee-shadow: 0 18px 48px -16px rgba(15, 23, 42, .28), 0 2px 8px -2px rgba(15, 23, 42, .12);
  --ringee-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

  /* ── Derived internal tokens ────────────────────────────────────────── */
  --rg-radius-sm: calc(var(--ringee-radius) - 8px);
  --rg-radius-md: calc(var(--ringee-radius) - 4px);
  --rg-focus: color-mix(in srgb, var(--ringee-primary) 55%, transparent);
  --rg-primary-soft: color-mix(in srgb, var(--ringee-primary) 12%, var(--ringee-background));
  --rg-primary-tint: color-mix(in srgb, var(--ringee-primary) 16%, transparent);
  --rg-danger-soft: color-mix(in srgb, var(--ringee-danger) 12%, var(--ringee-background));
  --rg-warning-soft: color-mix(in srgb, var(--ringee-warning) 14%, var(--ringee-background));
  --rg-hover: color-mix(in srgb, var(--ringee-text) 6%, transparent);
  --rg-pressed: color-mix(in srgb, var(--ringee-text) 12%, transparent);
  --rg-elevated: color-mix(in srgb, var(--ringee-text) 3%, var(--ringee-background));
  --rg-ease: cubic-bezier(.2, .8, .2, 1);

  all: initial;
  display: block;
  font-family: var(--ringee-font-family);
  color: var(--ringee-text);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  line-height: 1.45;
}

/* Dark defaults — applied for OS dark unless the integrator forced light. */
@media (prefers-color-scheme: dark) {
  :host([data-ringee-scheme="auto"]) { ${darkTokens()} }
}
:host([data-ringee-scheme="dark"]) { ${darkTokens()} }

*, *::before, *::after { box-sizing: border-box; }
button, input, select, textarea { font: inherit; color: inherit; margin: 0; }
svg { display: block; flex: none; }

/* ────────────────────────────────────────────────────────────────────────
   Surface / card
   ──────────────────────────────────────────────────────────────────────── */
.rg-card {
  display: flex;
  flex-direction: column;
  background: var(--ringee-background);
  border: 1px solid var(--ringee-border);
  border-radius: var(--ringee-radius);
  box-shadow: var(--ringee-shadow);
  overflow: hidden;
  isolation: isolate;
}

.rg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  min-height: 52px;
  border-bottom: 1px solid var(--ringee-border);
  background: var(--ringee-background);
}
.rg-header__brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
.rg-header__word { font-weight: 650; font-size: 14px; letter-spacing: -.01em; }
.rg-header__spacer { flex: 1 1 auto; }
.rg-header__actions { display: flex; align-items: center; gap: 2px; }
.rg-header__status {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--ringee-text-muted); font-weight: 500;
}

.rg-body { padding: 16px; display: flex; flex-direction: column; }

.rg-screen {
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: rg-screen-in .22s var(--rg-ease);
}
.rg-screen__head { display: flex; flex-direction: column; gap: 4px; }
.rg-screen__title { font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
.rg-screen__sub { font-size: 13px; color: var(--ringee-text-muted); }
.rg-screen__sub b { color: var(--ringee-text); font-weight: 600; }

/* ────────────────────────────────────────────────────────────────────────
   Button
   ──────────────────────────────────────────────────────────────────────── */
.rg-btn {
  --_bg: var(--rg-hover);
  --_fg: var(--ringee-text);
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 16px;
  border: 0; border-radius: var(--rg-radius-md);
  background: var(--_bg); color: var(--_fg);
  font-size: 14px; font-weight: 600; letter-spacing: -.005em;
  cursor: pointer; white-space: nowrap;
  transition: background .15s var(--rg-ease), transform .08s var(--rg-ease), box-shadow .15s var(--rg-ease), opacity .15s;
  -webkit-user-select: none; user-select: none;
}
.rg-btn:hover { background: color-mix(in srgb, var(--_bg) 88%, var(--ringee-text)); }
.rg-btn:active { transform: translateY(.5px) scale(.99); }
.rg-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--rg-focus); }
.rg-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.rg-btn--block { width: 100%; }
.rg-btn--lg { height: 46px; font-size: 15px; padding: 0 20px; }

.rg-btn--primary { --_bg: var(--ringee-primary); --_fg: var(--ringee-on-primary); box-shadow: 0 1px 2px rgba(15,23,42,.12); }
.rg-btn--primary:hover { background: var(--ringee-primary-hover); }
.rg-btn--danger { --_bg: var(--ringee-danger); --_fg: #fff; }
.rg-btn--danger:hover { background: color-mix(in srgb, var(--ringee-danger) 88%, #000); }
.rg-btn--secondary { --_bg: var(--rg-elevated); --_fg: var(--ringee-text); box-shadow: inset 0 0 0 1px var(--ringee-border); }
.rg-btn--secondary:hover { background: var(--rg-hover); }
.rg-btn--ghost { --_bg: transparent; --_fg: var(--ringee-text); }
.rg-btn--ghost:hover { background: var(--rg-hover); }

/* ────────────────────────────────────────────────────────────────────────
   Icon button
   ──────────────────────────────────────────────────────────────────────── */
.rg-iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; flex: none;
  border: 0; border-radius: 12px;
  background: transparent; color: var(--ringee-text);
  cursor: pointer;
  transition: background .15s var(--rg-ease), color .15s, transform .08s, box-shadow .15s;
}
.rg-iconbtn:hover { background: var(--rg-hover); }
.rg-iconbtn:active { transform: scale(.94); }
.rg-iconbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--rg-focus); }
.rg-iconbtn:disabled { opacity: .45; cursor: not-allowed; }
.rg-iconbtn[aria-pressed="true"] { background: var(--rg-primary-soft); color: var(--ringee-primary); }
.rg-iconbtn--muted { color: var(--ringee-text-muted); }
@media (pointer: coarse) { .rg-iconbtn { width: 44px; height: 44px; } }

/* ────────────────────────────────────────────────────────────────────────
   Field / input
   ──────────────────────────────────────────────────────────────────────── */
.rg-field { display: flex; flex-direction: column; gap: 6px; }
.rg-label { font-size: 12.5px; font-weight: 600; color: var(--ringee-text-muted); }
.rg-inputwrap {
  display: flex; align-items: center; gap: 8px;
  height: 46px; padding: 0 12px;
  background: var(--ringee-background);
  border: 1px solid var(--ringee-border);
  border-radius: var(--rg-radius-md);
  transition: border-color .15s, box-shadow .15s;
}
.rg-inputwrap:focus-within { border-color: var(--ringee-primary); box-shadow: 0 0 0 3px var(--rg-focus); }
.rg-inputwrap--invalid { border-color: var(--ringee-danger); }
.rg-inputwrap--invalid:focus-within { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ringee-danger) 45%, transparent); }
.rg-inputwrap__icon { color: var(--ringee-text-muted); }
.rg-input {
  flex: 1 1 auto; min-width: 0;
  border: 0; background: transparent; outline: none;
  font-size: 15px; color: var(--ringee-text);
}
.rg-input::placeholder { color: color-mix(in srgb, var(--ringee-text-muted) 80%, transparent); }
.rg-input:-webkit-autofill { -webkit-text-fill-color: var(--ringee-text); transition: background-color 9999s; }
.rg-hint { font-size: 12px; color: var(--ringee-text-muted); display: flex; align-items: center; gap: 5px; }
.rg-hint--error { color: var(--ringee-danger); }

/* ────────────────────────────────────────────────────────────────────────
   OTP
   ──────────────────────────────────────────────────────────────────────── */
.rg-otp { display: flex; gap: 8px; justify-content: space-between; }
.rg-otp__cell {
  flex: 1 1 0; min-width: 0; width: 100%; height: 54px;
  text-align: center; font-size: 22px; font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--ringee-text);
  background: var(--ringee-background);
  border: 1.5px solid var(--ringee-border);
  border-radius: var(--rg-radius-md);
  outline: none; caret-color: var(--ringee-primary);
  transition: border-color .12s, box-shadow .12s, background .12s;
}
.rg-otp__cell:focus { border-color: var(--ringee-primary); box-shadow: 0 0 0 3px var(--rg-focus); }
.rg-otp__cell[data-filled="true"] { border-color: color-mix(in srgb, var(--ringee-primary) 40%, var(--ringee-border)); background: var(--rg-primary-soft); }
.rg-otp--invalid .rg-otp__cell { border-color: var(--ringee-danger); animation: rg-shake .32s var(--rg-ease); }

/* ────────────────────────────────────────────────────────────────────────
   Select / caller id
   ──────────────────────────────────────────────────────────────────────── */
.rg-select {
  position: relative; display: flex; align-items: center; gap: 8px;
  width: 100%; height: 44px; padding: 0 12px;
  background: var(--ringee-background); color: var(--ringee-text);
  border: 1px solid var(--ringee-border); border-radius: var(--rg-radius-md);
  cursor: pointer; text-align: left;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.rg-select:hover { background: var(--rg-elevated); }
.rg-select:focus-visible { outline: none; border-color: var(--ringee-primary); box-shadow: 0 0 0 3px var(--rg-focus); }
.rg-select[aria-expanded="true"] { border-color: var(--ringee-primary); }
.rg-select__label { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.rg-select__cap { font-size: 11px; color: var(--ringee-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.rg-select__val { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg-select__chev { color: var(--ringee-text-muted); transition: transform .18s var(--rg-ease); }
.rg-select[aria-expanded="true"] .rg-select__chev { transform: rotate(180deg); }

.rg-menu {
  position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px);
  background: var(--ringee-background);
  border: 1px solid var(--ringee-border); border-radius: var(--rg-radius-md);
  box-shadow: var(--ringee-shadow); padding: 6px; max-height: 224px; overflow: auto;
  animation: rg-pop .16s var(--rg-ease);
}
.rg-option {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 10px; border: 0; border-radius: 10px; background: transparent;
  color: var(--ringee-text); font-size: 14px; cursor: pointer; text-align: left;
}
.rg-option:hover, .rg-option[data-active="true"] { background: var(--rg-hover); }
.rg-option__num { flex: 1 1 auto; font-variant-numeric: tabular-nums; font-weight: 550; }
.rg-option__check { color: var(--ringee-primary); opacity: 0; }
.rg-option[aria-selected="true"] .rg-option__check { opacity: 1; }

/* ────────────────────────────────────────────────────────────────────────
   Avatar / badge / status dot
   ──────────────────────────────────────────────────────────────────────── */
.rg-avatar {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--rg-primary-soft); color: var(--ringee-primary);
  font-weight: 650; font-size: 15px; overflow: hidden; letter-spacing: .01em;
}
.rg-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rg-avatar--lg { width: 64px; height: 64px; font-size: 24px; }
.rg-avatar--sm { width: 28px; height: 28px; font-size: 12px; }

.rg-badge {
  display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 9px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
  background: var(--rg-hover); color: var(--ringee-text-muted);
}
.rg-badge--brand { background: var(--rg-primary-soft); color: var(--ringee-primary); }
.rg-badge--danger { background: var(--rg-danger-soft); color: var(--ringee-danger); }
.rg-badge--warning { background: var(--rg-warning-soft); color: var(--ringee-warning); }

.rg-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--ringee-text-muted); }
.rg-dot--ready { background: var(--ringee-success); }
.rg-dot--live { background: var(--ringee-success); box-shadow: 0 0 0 0 var(--rg-primary-tint); animation: rg-ping 1.6s var(--rg-ease) infinite; }
.rg-dot--danger { background: var(--ringee-danger); }
.rg-dot--warn { background: var(--ringee-warning); }

/* ────────────────────────────────────────────────────────────────────────
   Spinner
   ──────────────────────────────────────────────────────────────────────── */
.rg-spinner {
  width: 18px; height: 18px; flex: none; border-radius: 50%;
  border: 2.5px solid var(--rg-primary-tint);
  border-top-color: var(--ringee-primary);
  animation: rg-spin .7s linear infinite;
}
.rg-spinner--on-primary { border-color: color-mix(in srgb, var(--ringee-on-primary) 35%, transparent); border-top-color: var(--ringee-on-primary); }
.rg-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 22px 8px; text-align: center; }
.rg-loading .rg-spinner { width: 26px; height: 26px; }
.rg-loading__label { font-size: 13.5px; color: var(--ringee-text-muted); }

/* ────────────────────────────────────────────────────────────────────────
   Inline error / empty state
   ──────────────────────────────────────────────────────────────────────── */
.rg-error {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 11px 12px; border-radius: var(--rg-radius-md);
  background: var(--rg-danger-soft);
  color: color-mix(in srgb, var(--ringee-danger) 82%, var(--ringee-text));
  border: 1px solid color-mix(in srgb, var(--ringee-danger) 22%, transparent);
  animation: rg-screen-in .2s var(--rg-ease);
}
.rg-error--warning { background: var(--rg-warning-soft); color: color-mix(in srgb, var(--ringee-warning) 82%, var(--ringee-text)); border-color: color-mix(in srgb, var(--ringee-warning) 24%, transparent); }
.rg-error__icon { margin-top: 1px; flex: none; }
.rg-error__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rg-error__title { font-size: 13.5px; font-weight: 650; }
.rg-error__msg { font-size: 13px; opacity: .92; }
.rg-error__action { align-self: flex-start; margin-top: 4px; }

.rg-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 20px 12px; color: var(--ringee-text-muted); }

/* ────────────────────────────────────────────────────────────────────────
   Call timer / contact summary / call screens
   ──────────────────────────────────────────────────────────────────────── */
.rg-timer { font-variant-numeric: tabular-nums; font-weight: 650; letter-spacing: .01em; }

.rg-contact { display: flex; align-items: center; gap: 12px; min-width: 0; }
.rg-contact__meta { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.rg-contact__name { font-size: 15px; font-weight: 650; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg-contact__num { font-size: 13px; color: var(--ringee-text-muted); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rg-callstage { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0 4px; text-align: center; }
.rg-callstage__name { font-size: 19px; font-weight: 700; letter-spacing: -.02em; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg-callstage__num { font-size: 14px; color: var(--ringee-text-muted); font-variant-numeric: tabular-nums; }
.rg-callstage__state { display: inline-flex; align-items: center; gap: 7px; margin-top: 4px; font-size: 13.5px; font-weight: 600; color: var(--ringee-text-muted); }
.rg-callstage__state--live { color: var(--ringee-success); }

/* Halo behind the avatar while dialing / ringing */
.rg-halo { position: relative; display: inline-flex; }
.rg-halo::before, .rg-halo::after {
  content: ""; position: absolute; inset: -6px; border-radius: 50%;
  border: 2px solid var(--rg-primary-tint);
  animation: rg-halo 1.8s var(--rg-ease) infinite;
}
.rg-halo::after { animation-delay: .9s; }

/* ────────────────────────────────────────────────────────────────────────
   Call controls
   ──────────────────────────────────────────────────────────────────────── */
.rg-callctl { display: flex; align-items: center; justify-content: center; gap: 10px; }
.rg-ctl {
  display: inline-flex; flex-direction: column; align-items: center; gap: 6px;
  border: 0; background: transparent; cursor: pointer; color: var(--ringee-text);
  font-size: 11px; font-weight: 600;
}
.rg-ctl__btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--rg-elevated); box-shadow: inset 0 0 0 1px var(--ringee-border);
  transition: background .15s var(--rg-ease), color .15s, transform .08s, box-shadow .15s;
}
.rg-ctl:hover .rg-ctl__btn { background: var(--rg-hover); }
.rg-ctl:active .rg-ctl__btn { transform: scale(.93); }
.rg-ctl:focus-visible { outline: none; }
.rg-ctl:focus-visible .rg-ctl__btn { box-shadow: 0 0 0 3px var(--rg-focus), inset 0 0 0 1px var(--ringee-border); }
.rg-ctl[aria-pressed="true"] .rg-ctl__btn { background: var(--ringee-text); color: var(--ringee-background); box-shadow: none; }
.rg-ctl--danger .rg-ctl__btn { width: 60px; height: 60px; background: var(--ringee-danger); color: #fff; box-shadow: 0 8px 22px -8px color-mix(in srgb, var(--ringee-danger) 70%, transparent); }
.rg-ctl--danger:hover .rg-ctl__btn { background: color-mix(in srgb, var(--ringee-danger) 90%, #000); }
.rg-ctl--call .rg-ctl__btn { width: 60px; height: 60px; background: var(--ringee-primary); color: var(--ringee-on-primary); box-shadow: 0 8px 22px -8px color-mix(in srgb, var(--ringee-primary) 70%, transparent); }
.rg-ctl:disabled { opacity: .4; cursor: not-allowed; }

/* ────────────────────────────────────────────────────────────────────────
   Keypad
   ──────────────────────────────────────────────────────────────────────── */
.rg-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.rg-key {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 52px; border: 0; border-radius: 14px;
  background: var(--rg-elevated); box-shadow: inset 0 0 0 1px var(--ringee-border);
  color: var(--ringee-text); cursor: pointer;
  transition: background .12s var(--rg-ease), transform .06s;
}
.rg-key:hover { background: var(--rg-hover); }
.rg-key:active { transform: scale(.95); background: var(--rg-pressed); }
.rg-key:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--rg-focus), inset 0 0 0 1px var(--ringee-border); }
.rg-key__d { font-size: 20px; font-weight: 600; line-height: 1; }
.rg-key__s { font-size: 9px; font-weight: 700; letter-spacing: .12em; color: var(--ringee-text-muted); height: 10px; margin-top: 2px; }

/* Read-out of typed digits above the keypad */
.rg-dialview { display: flex; align-items: center; gap: 8px; }
.rg-dialview__num { flex: 1 1 auto; min-width: 0; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .01em; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg-dialview__num--empty { color: color-mix(in srgb, var(--ringee-text-muted) 70%, transparent); }

/* ────────────────────────────────────────────────────────────────────────
   Agent menu (footer)
   ──────────────────────────────────────────────────────────────────────── */
.rg-agent {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border: 0; border-radius: 12px; background: transparent;
  cursor: pointer; text-align: left; color: var(--ringee-text);
  transition: background .15s;
}
.rg-agent:hover { background: var(--rg-hover); }
.rg-agent:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--rg-focus); }
.rg-agent__meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.rg-agent__name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg-agent__ws { font-size: 12px; color: var(--ringee-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ────────────────────────────────────────────────────────────────────────
   Tooltip
   ──────────────────────────────────────────────────────────────────────── */
.rg-tip {
  position: absolute; z-index: 40; pointer-events: none;
  padding: 5px 9px; border-radius: 8px;
  background: color-mix(in srgb, var(--ringee-text) 92%, transparent);
  color: var(--ringee-background); font-size: 12px; font-weight: 550; white-space: nowrap;
  opacity: 0; transform: translateY(3px); transition: opacity .14s, transform .14s;
}
.rg-tip[data-show="true"] { opacity: 1; transform: none; }

/* ────────────────────────────────────────────────────────────────────────
   Floating: launcher + panel
   ──────────────────────────────────────────────────────────────────────── */
.rg-floating {
  position: fixed; z-index: 2147483000;
  bottom: max(20px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
}
.rg-floating[data-side="right"] { right: max(20px, env(safe-area-inset-right)); align-items: flex-end; }
.rg-floating[data-side="left"] { left: max(20px, env(safe-area-inset-left)); align-items: flex-start; }

.rg-launcher {
  display: inline-flex; align-items: center; justify-content: center;
  width: 58px; height: 58px; border: 0; border-radius: 50%;
  background: var(--ringee-primary); color: var(--ringee-on-primary);
  cursor: pointer; position: relative;
  box-shadow: 0 12px 30px -8px color-mix(in srgb, var(--ringee-primary) 65%, transparent), 0 2px 6px rgba(15,23,42,.18);
  transition: transform .16s var(--rg-ease), box-shadow .16s, background .16s;
}
.rg-launcher:hover { background: var(--ringee-primary-hover); transform: translateY(-1px) scale(1.03); }
.rg-launcher:active { transform: scale(.96); }
.rg-launcher:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--rg-focus), 0 12px 30px -8px color-mix(in srgb, var(--ringee-primary) 60%, transparent); }
.rg-launcher__badge {
  position: absolute; top: -2px; right: -2px;
  min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px;
  background: var(--ringee-danger); color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
  border: 2px solid var(--ringee-background);
}
.rg-launcher--live { animation: rg-live 2.4s var(--rg-ease) infinite; }
.rg-launcher--live::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  box-shadow: 0 0 0 0 var(--rg-primary-tint); animation: rg-ping 1.8s var(--rg-ease) infinite;
}

.rg-panel {
  width: 360px; max-width: calc(100vw - 32px);
  max-height: min(640px, calc(100vh - 120px));
  transform-origin: bottom right;
  animation: rg-panel-in .24s var(--rg-ease);
  overflow: hidden;
}
.rg-floating[data-side="left"] .rg-panel { transform-origin: bottom left; }
.rg-panel .rg-body { overflow: auto; }

/* Mobile: full-screen sheet + backdrop */
.rg-backdrop {
  position: fixed; inset: 0; z-index: 2147482999;
  background: color-mix(in srgb, #0b1220 46%, transparent);
  animation: rg-fade .2s var(--rg-ease); border: 0;
}
@media (max-width: 480px) {
  .rg-floating[data-open="true"] { inset: 0; bottom: 0; right: 0; left: 0; padding: 0; align-items: stretch; }
  .rg-floating[data-open="true"] .rg-launcher { display: none; }
  .rg-panel {
    width: 100%; max-width: 100%; height: 100%; max-height: 100%;
    border-radius: 0; border: 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: rg-sheet-in .26s var(--rg-ease);
  }
}

/* ────────────────────────────────────────────────────────────────────────
   Dialer Bar — width-adaptive via container queries
   ──────────────────────────────────────────────────────────────────────── */
.rg-bar-host { container-type: inline-size; display: block; width: 100%; }
.rg-bar {
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 56px; padding: 8px 12px;
  background: var(--ringee-background);
  border: 1px solid var(--ringee-border); border-radius: var(--rg-radius-md);
  box-shadow: 0 1px 2px rgba(15,23,42,.05);
}
.rg-bar__brand { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.rg-bar__main { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; }
.rg-bar__field { flex: 1 1 auto; min-width: 0; }
.rg-bar__actions { display: flex; align-items: center; gap: 6px; flex: none; }
.rg-bar__sep { width: 1px; align-self: stretch; margin: 6px 2px; background: var(--ringee-border); flex: none; }
.rg-bar .rg-inputwrap { height: 40px; }
.rg-bar .rg-btn { height: 40px; }
.rg-bar .rg-callctl { gap: 8px; }
.rg-bar .rg-ctl__btn { width: 40px; height: 40px; }
.rg-bar .rg-ctl--danger .rg-ctl__btn, .rg-bar .rg-ctl--call .rg-ctl__btn { width: 44px; height: 44px; }
.rg-bar .rg-ctl__label { display: none; }
.rg-bar-collapsible { display: contents; }
.rg-bar-popover {
  position: absolute; z-index: 30; bottom: calc(100% + 8px); right: 0;
  width: 260px; padding: 8px;
  background: var(--ringee-background); border: 1px solid var(--ringee-border);
  border-radius: var(--rg-radius-md); box-shadow: var(--ringee-shadow);
  animation: rg-pop .16s var(--rg-ease);
}
.rg-bar__word { font-weight: 650; font-size: 13px; }

/* Hide the word-mark, then caller-id, as the container narrows. */
@container (max-width: 520px) { .rg-bar__word { display: none; } }
@container (max-width: 440px) { .rg-bar [data-collapse="callerid"] { display: none; } }
@container (max-width: 360px) { .rg-bar [data-collapse="secondary"] { display: none; } }
@container (min-width: 361px) { .rg-bar [data-collapse-menu] { display: none; } }

/* ────────────────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────────────────── */
.rg-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.rg-row { display: flex; align-items: center; gap: 8px; }
.rg-col { display: flex; flex-direction: column; gap: 8px; }
.rg-grow { flex: 1 1 auto; min-width: 0; }
.rg-muted { color: var(--ringee-text-muted); }
.rg-center { text-align: center; }
[hidden] { display: none !important; }

/* ────────────────────────────────────────────────────────────────────────
   Keyframes
   ──────────────────────────────────────────────────────────────────────── */
@keyframes rg-spin { to { transform: rotate(360deg); } }
@keyframes rg-screen-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes rg-panel-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes rg-sheet-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes rg-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rg-pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes rg-shake { 10%, 90% { transform: translateX(-1px); } 30%, 70% { transform: translateX(3px); } 50% { transform: translateX(-3px); } }
@keyframes rg-ping { 0% { box-shadow: 0 0 0 0 var(--rg-primary-tint); } 70%, 100% { box-shadow: 0 0 0 10px transparent; } }
@keyframes rg-live { 0%, 100% { box-shadow: 0 12px 30px -8px color-mix(in srgb, var(--ringee-primary) 65%, transparent); } 50% { box-shadow: 0 12px 34px -6px color-mix(in srgb, var(--ringee-primary) 85%, transparent); } }
@keyframes rg-halo { 0% { opacity: .7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.5); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .rg-dot--live, .rg-launcher--live::after, .rg-halo::before, .rg-halo::after { animation: none; }
  .rg-halo::before, .rg-halo::after { display: none; }
}
`;

/** Dark-mode token overrides, shared by the media query and the forced class. */
function darkTokens(): string {
  return /* css */ `
    --ringee-primary: #34d399;
    --ringee-primary-hover: #6ee7b7;
    --ringee-on-primary: #04231a;
    --ringee-background: #111827;
    --ringee-surface: #0d131f;
    --ringee-text: #f1f5f9;
    --ringee-text-muted: #94a3b8;
    --ringee-border: #273244;
    --ringee-danger: #f87171;
    --ringee-success: #34d399;
    --ringee-warning: #fbbf24;
    --ringee-shadow: 0 20px 52px -18px rgba(0, 0, 0, .66), 0 2px 10px -4px rgba(0, 0, 0, .5);
    --rg-elevated: color-mix(in srgb, #ffffff 5%, var(--ringee-background));
    --rg-hover: color-mix(in srgb, #ffffff 8%, transparent);
    --rg-pressed: color-mix(in srgb, #ffffff 14%, transparent);
  `;
}
