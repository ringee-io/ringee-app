# Ringee Browser Extension

Detect phone numbers on any web page and call them with the **real Ringee
dialer** over WebRTC — without leaving the tab. This is not a shortcut, an
iframe, or a bridge to the web app: it bundles Ringee's own packages and reuses
the exact same dialer engine and Active Call Modal as `apps/frontend`.

> Manifest V3 · Chrome & Edge (Chromium ≥ 116)

---

## How it shares code with the web app (no duplication)

The extension does **not** contain its own dialer or its own call modal. It
consumes the same monorepo packages the web app does:

| Concern                                                                                                                           | Shared package                                      | Used by                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Telnyx client, place/mute/hold/hangup/DTMF, call-state mapping, DTMF tones, phone detect/normalize, call store, message contracts | [`@ringee/dialer-core`](../../packages/dialer-core) | web app **and** extension offscreen/side panel |
| The Active Call Modal + post-call (outcome/notes) UI                                                                              | [`@ringee/dialer-ui`](../../packages/dialer-ui)     | web app **and** extension side panel           |

- **One dialer engine.** `createTelnyxClient` / `placeCall` / `muteCall` /
  `holdCall` / `hangupCall` / `sendDtmf` live only in
  `@ringee/dialer-core/engine`. The web app calls them from a React hook; the
  extension calls them from the **offscreen document**. There is no second
  Telnyx/WebRTC implementation.
- **One Active Call Modal.** `ActiveCallModal` and `PostCallView` live only in
  `@ringee/dialer-ui`. `apps/frontend`'s `active.call.modal.tsx` /
  `post-call.view.tsx` are thin re-exports of it. The side panel mounts the
  same component. Host differences (the web app's transcription / contact
  timeline / in-call booking panels) are injected through a `DialerProvider`
  (data client + slots), so the modal renders rich in the app and compact in
  the side panel **from one source**. Improve the modal once → both update.

Because the same packages are shared as source, any change to the dialer or the
modal is reflected in both surfaces automatically.

---

## Architecture (Manifest V3)

```
 page ──pill click──▶ content script ─DIAL_REQUEST─▶ background (service worker)
                                                        │  ▲
                                          prepare-call  │  │ CALL_EVENT
                                          (backend)     ▼  │
 side panel ◀──CALL_SNAPSHOT── background ──START_CALL─▶ offscreen document
   │  shared ActiveCallModal      ▲   │                    (WebRTC + audio)
   └──CALL_COMMAND────────────────┘   └──CALL_COMMAND──────▶
```

- **content script** (`src/content/detector.ts`) — finds phone numbers on the
  allowlisted priority domains using `@ringee/dialer-core/phone` and drops a
  "Call with Ringee" pill. Touches nothing privileged; emits a typed
  `DIAL_REQUEST` only.
- **service worker** (`src/background/service-worker.ts`) — the coordinator
  only: holds the Clerk session, opens the side panel, owns the offscreen
  document lifecycle, and asks the **backend** to prepare each call. **No
  WebRTC here.**
- **offscreen document** (`src/offscreen/offscreen.ts`) — the WebRTC engine.
  MV3 kills the service worker and it has no DOM/mic/audio, so the live call +
  audio live here, using the shared `@ringee/dialer-core` engine. Survives the
  side panel being closed.
- **side panel** (`src/sidepanel/`) — a container that mounts the shared
  `ActiveCallModal`; a remote control driven by `CALL_SNAPSHOT`, sending
  `CALL_COMMAND` for mute/hold/hangup/DTMF. Not a new call UI.

WebRTC is intentionally **never** in the service worker (MV3 lifecycle/audio
constraints).

---

## Backend: who decides what

The extension makes **no** business decisions. `POST /api/extension/prepare-call`
(see `apps/backend/.../extension.controller.ts`) does it all server-side:

1. validates the user (Clerk guard)
2. resolves the active workspace (personal vs organization)
3. checks credits → `INSUFFICIENT_CREDITS`
4. checks DNC → `DNC_BLOCKED`
5. resolves the caller ID (verified caller ID → purchased number → configured
   public line) → `NO_CALLER_ID`
6. finds/creates the contact and records the page origin
7. mints ephemeral Telnyx WebRTC credentials

Caller IDs and credentials are **always** returned from the backend — never
hardcoded in the extension.

---

## Development

### 1. Install & configure

```bash
pnpm install                       # from the repo root
cp apps/browser-extension/.env.example apps/browser-extension/.env
```

Fill in `apps/browser-extension/.env`:

| Var                          | Meaning                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Same Clerk instance as the web app** (so the session syncs). |
| `VITE_CLERK_SYNC_HOST`       | The web app origin, e.g. `https://www.ringee.io`.              |
| `VITE_RINGEE_API_URL`        | Backend base incl. `/api`, e.g. `https://api.ringee.io/api`.   |
| `VITE_DEFAULT_REGION`        | Default region for numbers without a country code (e.g. `US`). |

### 2. Build

**For loading unpacked, use the production build** — it's a standalone `dist/`
with no external dependency:

```bash
pnpm --filter browser-extension build
```

> ⚠️ `pnpm --filter browser-extension dev` runs a **Vite HMR dev server** and
> writes a `dist/` whose pages load from `http://localhost:5173`. That `dist/`
> only works **while the dev server is running** — if you load it (or the server
> stops), every extension page fails with `ERR_FAILED`. Use `dev` only for
> active development with the server up; otherwise always use `build`.

### 3. Load it in Chrome / Edge

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select `apps/browser-extension/dist`.
4. Pin the Ringee icon. Clicking it opens the side panel.

(Edge is identical at `edge://extensions`.)

### 4. Authenticate (first run)

1. Open the side panel — if signed out, a Clerk sign-in is shown.
2. Sign in with the same account as the web app. The session is shared via
   `syncHost`, so once you're signed into `app.ringee.io` the panel picks it up.
3. The active workspace follows your Clerk session (personal or organization).

---

## Testing the flows manually

**Click-to-call (pill):** open a profile/CRM page on a priority domain
(LinkedIn, Apollo, Attio, HubSpot, Salesforce, Pipedrive, Google Sheets). A
green "Call with Ringee" pill appears next to detected numbers. Click it → the
side panel opens and the shared Active Call Modal starts the call.

**Context menu (any page):** select a phone number on **any** page, right-click
→ **Call "…" with Ringee**. Works without a host-permission grant (uses the
selected text only).

**Manual dial:** open the side panel and type a number in the idle launcher.

**A real call** (needs valid `.env` + a signed-in account with credits and a
caller ID): start any of the above. You should hear ringback, the modal shows
`Connecting… → Connected` with a live timer, and mute/hold/keypad work. Hang up
→ the post-call view lets you pick an outcome and add notes; **Save & Close**
writes to Ringee (`POST /api/meetings/call-outcome`) and the call lands in your
history.

### Automated tests

```bash
pnpm --filter @ringee/dialer-core test   # phone detect/normalize, message validation,
                                         # state mapping, shared call attribution
pnpm --filter browser-extension test     # prepare-call flow, error states, message validation
```

---

## Production build

```bash
pnpm --filter browser-extension build
```

Output is an unpacked MV3 extension in `apps/browser-extension/dist/` — load it
unpacked, or zip `dist/` for the Chrome Web Store / Edge Add-ons.

---

## Troubleshooting

- **Side panel shows "This site can't be reached / ERR_FAILED"** — almost always
  a **dev build loaded without the dev server**. The `dev` task writes a `dist/`
  that imports from `http://localhost:5173`; if you load that as unpacked, the
  pages fail. Fix: stop the dev server, run `pnpm --filter browser-extension
build` (standalone), then click the reload ↻ icon in `chrome://extensions`.
  (Both HTML pages are built as explicit Vite inputs because this CRX beta
  otherwise emits a dev-mode loader for manifest HTML during `vite build`.)
- **Panel loads but is blank / Clerk error** — `apps/browser-extension/.env` is
  missing or `VITE_CLERK_PUBLISHABLE_KEY` isn't set. Fill it in and rebuild
  (Vite inlines `VITE_*` at build time).
- **After any rebuild, reload the extension** in `chrome://extensions` for the
  new `dist/` to take effect.

## Permissions & why

| Permission                                                  | Why                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `offscreen`                                                 | Host the WebRTC engine + audio (never in the service worker).         |
| `sidePanel`                                                 | Mount the shared Active Call Modal.                                   |
| `storage`                                                   | Settings + cached call snapshot.                                      |
| `contextMenus`                                              | Right-click "Call with Ringee" on selected text.                      |
| `cookies`                                                   | Clerk `syncHost` session sharing with the web app.                    |
| `host_permissions`: `api.ringee.io`, `app.ringee.io`, Clerk | Reach the Ringee API + Clerk.                                         |
| `optional_host_permissions`: `https://*/*`                  | Opt-in number detection on additional sites (not granted by default). |

**We deliberately avoid `<all_urls>` content scripts.** Detection runs only on a
small allowlist of priority CRM/prospecting domains; everywhere else uses the
right-click menu or manual dial. No emails, inboxes, messages, or full tables
are ever read — only the selected/detected number, the page URL/title, and a
nearby name when reasonable.

---

## Privacy / data captured from a page

Only on a clear user action (pill click / right-click), and limited to:
the detected or selected **number**, the current **URL** and page **title**, and
a nearby **name/company** when it's reasonable and safe. This origin is saved to
the contact's timeline by the backend.

---

## Resource cleanup

When a call ends (or the user closes the post-call view), the service worker
closes the offscreen document, which disconnects the Telnyx client and releases
the microphone. No mic stays hot and no WebRTC context lingers when idle.

---

## Note on the `files/` folder

`files/` contains an earlier prototype kept as reference (it is excluded from the
pnpm workspace). The shipping app at the package root reuses its good ideas
(content-script detection, offscreen-WebRTC, typed messages) but fixes the
issues: it is not standalone, does not duplicate the dialer or modal, never
hardcodes a caller ID or credentials, and routes every decision through the
backend.
