# Ringee Dialer SDK

Browser SDK for embedding Ringee outbound calling in a CRM, back office, or web
application.

The package supports three integration modes:

1. **Floating:** a floating launcher that opens a complete dialer panel.
2. **Bar:** an inline dialer rendered inside an element on your page.
3. **Headless:** a UI-free engine for building a fully custom experience.

The included UIs have no React dependency. They render inside an isolated Shadow
DOM, work with JavaScript, TypeScript, or any framework, support English and
Spanish, and can be themed. The SDK encapsulates WebRTC and Telnyx, so the host
application never manages Telnyx credentials or provider-specific objects.

> This is a browser-only package. Do not initialize it in Node.js, a Server
> Component, an API route, or any SSR process.

## Contents

- [Choose an integration](#choose-an-integration)
- [Requirements](#requirements)
- [Create a publishable key](#create-a-publishable-key)
- [Install](#install)
- [Option 1: Floating](#option-1-floating)
- [Option 2: Inline Bar](#option-2-inline-bar)
- [Option 3: Headless](#option-3-headless)
- [React and Next.js](#react-and-nextjs)
- [CRM contacts](#crm-contacts)
- [Customization](#customization)
- [API reference](#api-reference)
- [How it works](#how-it-works)
- [Security](#security)
- [Self-hosting and local development](#self-hosting-and-local-development)
- [Troubleshooting](#troubleshooting)

## Choose an integration

| Mode             | Best for                                  | Initialization | UI                        |
| ---------------- | ----------------------------------------- | -------------- | ------------------------- |
| Floating via CDN | Quick setup or pages without a build step | Automatic      | Floating launcher + panel |
| Floating via npm | SPAs and bundled applications             | Automatic      | Floating launcher + panel |
| Bar via CDN/npm  | Toolbars, sidebars, and contact records   | Automatic      | Inline dialer             |
| Headless         | Fully custom design and state handling    | Manual         | None                      |

Start with **Floating** for the fastest implementation. Choose **Bar** when the
host already has a dedicated area for calling. Choose **Headless** only when you
need complete control over every screen, form, state, and message.

### Not included in this release

- There is no public Ringee URL that can be dropped directly into
  `<iframe src="...">`.
- There is no automatic `data-ringee-key` / `data-ringee-mode` loader.
- There is no separate React wrapper package. The browser SDK can be mounted
  from React with `useEffect`, as shown below.

You can run the SDK inside an iframe created by your application, but your code
must load and control the package inside that document. The iframe needs an
allowed origin, microphone permission, and storage access. This release does
not provide a ready-made `postMessage` bridge.

## Requirements

Before embedding the dialer, you need:

- an active Ringee Custom Integration;
- a `pk_live_...` publishable key scoped to the CRM origin;
- a Ringee agent with access to the integration workspace;
- at least one caller ID available to that agent or workspace;
- enough credit and permission to place calls;
- HTTPS in production, which browsers require for microphone access;
- a modern browser with WebRTC and `navigator.mediaDevices`.

Destination numbers must use **E.164** format, for example `+13055550198`,
`+34911234567`, or `+18095550123`.

## Create a publishable key

The recommended flow uses the Ringee dashboard. Custom Integrations are
available to organization admins and personal accounts with administrative
access.

### 1. Open Custom Integrations

1. Sign in to Ringee.
2. Open **Integrations** from the sidebar. The direct route is
   `/dashboard/settings/integrations`.
3. Select the **Custom Integrations** tab.

### 2. Create or open an integration

- If you do not have one yet, click **New custom integration**, enter a name
  such as `My CRM`, and click **Create**.
- If one already exists, open its card with **Configure**.

When a Custom Integration is created, Ringee also displays a `cik_live_...` API
key and a webhook signing secret. Those credentials belong to the private API
and webhook system. **They are not Dialer SDK keys and must never be placed in
frontend code.**

### 3. Add allowed origins

Inside the integration:

1. Open **Settings**.
2. Find **Dialer SDK · Publishable keys**.
3. Under **Allowed origins**, enter the complete origin that will load the SDK,
   such as `https://crm.example.com`.
4. Click **Add** and repeat for every environment. For the local live
   playground, use **localhost:5173 (playground)**.

The **This dashboard** shortcut adds the origin of the currently open Ringee
dashboard. Use it only if the SDK will run from that same origin. An external
CRM must add the CRM origin instead.

An origin contains only the scheme, host, and optional port. Do not include a
path, query string, credentials, or fragment.

Example production and local origins:

```text
https://crm.example.com
http://localhost:5173
```

### 4. Generate and copy the key

1. Review the allowed origin list.
2. Click **Generate publishable key**.
3. Copy the `pk_live_...` value shown under **Publishable key**.
4. Pass it to the SDK as the frontend `key` option.

The dashboard shows the generated value so you can copy it immediately. A
publishable key is browser-safe, but keep it in your project configuration so
it is not lost. Generate a new key if you lose it or need a different origin
list.

### Exact origin matching

Origins are matched exactly:

- `https://crm.example.com` does not allow `http://crm.example.com`;
- `https://crm.example.com` does not allow `https://app.crm.example.com`;
- `http://localhost:5173` does not allow `http://localhost:3000`;
- paths, query strings, credentials, fragments, and wildcards are rejected.

Every scheme, host, and port combination must be added explicitly. Existing
publishable keys are not edited; generate a new key for a new origin list.

### Key types

| Key            | Used by                         | Safe in frontend? |
| -------------- | ------------------------------- | ----------------- |
| `pk_live_...`  | Dialer SDK                      | Yes               |
| `cik_live_...` | Private Custom Integrations API | **No**            |

A publishable key identifies an installation and its allowed origins. It does
not identify or authenticate an agent. Ringee verifies agent identity with a
one-time code sent to the agent's email.

Rotating the `cik_live_...` secret revokes every publishable key associated with
the integration. Disabling the integration also invalidates them.

### Administrative API alternative

For automation or self-hosting, an authenticated admin client can perform the
same operation as the dashboard:

```http
POST /api/integrations/custom/<integrationId>/publishable-keys
Authorization: Bearer <admin-session>
Content-Type: application/json

{
  "allowedOrigins": [
    "https://crm.example.com",
    "http://localhost:5173"
  ]
}
```

Response:

```json
{
  "publishableKey": "pk_live_xxxxx",
  "integrationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "apiKeyPrefix": "cik_live_a1b2c3d4",
  "allowedOrigins": ["https://crm.example.com", "http://localhost:5173"]
}
```

## Install

```bash
npm install @ringee/dialer-sdk
```

You can also use `pnpm add` or `yarn add`.

## Option 1: Floating

Floating mounts a launcher in the page corner. The panel handles agent sign-in,
caller ID selection, number entry, and in-call controls.

### CDN: one script, no build step

```html
<script src="https://unpkg.com/@ringee/dialer-sdk"></script>
<script>
  const ringee = Ringee.mount({
    key: "pk_live_xxxxx",
    locale: "en",
    side: "right",
  });
</script>
```

`Ringee.mount(options)` is an alias for `Ringee.createFloating(options)`.

Pin a version in production to avoid receiving an unexpected release during a
host application deployment:

```html
<script src="https://unpkg.com/@ringee/dialer-sdk@0.1.0/dist/ringee.global.js"></script>
```

### npm

```ts
import { createFloating } from "@ringee/dialer-sdk/ui";

const ringee = createFloating({
  key: "pk_live_xxxxx",
  agentEmail: currentUser.email,
  locale: "en",
  side: "right",
  defaultOpen: false,
  rememberOpen: true,
  allowHold: true,
});
```

The UI calls `initialize()` automatically. `agentEmail` only prefills the email
field; Ringee always requires the agent to prove access to that email through
OTP.

### Control it from the CRM

```ts
ringee.open();
ringee.close();
ringee.toggle();

ringee.setContact({
  name: "Morgan Reed",
  number: "+13055550142",
  externalContactId: "crm-contact-294",
});

ringee.startCall({
  to: "+13055550142",
  name: "Morgan Reed",
  externalContactId: "crm-contact-294",
});
```

`startCall()` can be invoked before session restoration finishes. The UI keeps
the requested call and places it once it reaches `ready`. If the agent is not
authenticated, the OTP flow appears first.

## Option 2: Inline Bar

Bar renders the dialer inside a container. It adapts to the available width and
does not create a floating launcher.

### CDN

```html
<div id="ringee-bar"></div>

<script src="https://unpkg.com/@ringee/dialer-sdk"></script>
<script>
  const ringeeBar = Ringee.createBar({
    key: "pk_live_xxxxx",
    container: "#ringee-bar",
    locale: "en",
  });

  ringeeBar.setContact({
    name: "Avery Stone",
    number: "+14155550142",
    externalContactId: "contact-802",
  });
</script>
```

### npm

```ts
import { createBar } from "@ringee/dialer-sdk/ui";

const ringeeBar = createBar({
  key: "pk_live_xxxxx",
  container: document.getElementById("ringee-bar")!,
  agentEmail: currentUser.email,
  locale: "en",
});
```

`container` accepts an `HTMLElement`, an id (`"ringee-bar"`), or a CSS selector
(`"#sidebar .dialer"`). The SDK throws if the element does not exist when
`createBar()` is called.

## Option 3: Headless

Headless exposes authentication, calls, devices, and events without rendering
any UI. The host must build the screens and react to every state.

```ts
import { RingeeDialer, RingeeError } from "@ringee/dialer-sdk";

const dialer = new RingeeDialer({
  key: "pk_live_xxxxx",
  debug: false,
});

// Subscribe before initialize() so the first state changes are not missed.
dialer.on("authStateChanged", ({ state }) => renderAuthState(state));
dialer.on("stateChanged", ({ state }) => renderCallState(state));
dialer.on("authRequired", () => showEmailForm());
dialer.on("ready", () => enableDialButton());
dialer.on("answered", ({ call }) => startTimer(call.answeredAt));
dialer.on("ended", ({ call }) => showSummary(call));
dialer.on("failed", ({ error }) => showError(error.code, error.message));

try {
  await dialer.initialize();
} catch (error) {
  if (error instanceof RingeeError) {
    showError(error.code, error.message);
  }
}
```

`initialize()` may resolve with an authenticated or anonymous agent:

- if a valid session exists in `sessionStorage`, the SDK restores it and emits
  `signedIn` and `ready`;
- otherwise it emits `authRequired` and waits for the OTP flow.

### Email OTP

```ts
const challenge = await dialer.requestEmailCode("agent@company.com");

const agent = await dialer.verifyEmailCode({
  challengeId: challenge.id,
  code: "184279",
});

console.log("Signed in as", agent.email);
```

Resend a code with:

```ts
const nextChallenge = await dialer.resendEmailCode(challenge.id);
```

Use `challenge.resendAvailableAt` to control the resend button and
`challenge.expiresAt` to display expiration.

### Place and control a call

```ts
const call = await dialer.call({
  to: "+13055550198",
  callerIdId: selectedCallerId,
  externalContactId: "crm-contact-294",
});

dialer.mute();
dialer.unmute();
await dialer.hold();
await dialer.resume();
dialer.sendDigits("123#");
await dialer.hangup();
```

Only one call can be active per instance or agent. Ringee uses Web Locks to
reduce simultaneous calls across tabs and validates the restriction again on
the server.

### Sign out and clean up

```ts
await dialer.signOut(); // removes the persisted agent session
await dialer.destroy(); // disconnects WebRTC and releases browser resources
```

`signOut()` and `destroy()` serve different purposes. Destroying the instance
does not sign out the stored session; signing out removes the token.

## React and Next.js

Mount the SDK after the DOM exists and destroy it when the component unmounts.
In Next.js, a dynamic import inside `useEffect` prevents the browser package
from running during SSR.

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { FloatingController } from "@ringee/dialer-sdk/ui";

export function RingeeDialer({ email }: { email: string }) {
  const controller = useRef<FloatingController | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import("@ringee/dialer-sdk/ui").then(({ createFloating }) => {
      if (cancelled) return;

      controller.current = createFloating({
        key: process.env.NEXT_PUBLIC_RINGEE_KEY!,
        agentEmail: email,
        locale: "en",
      });
    });

    return () => {
      cancelled = true;
      const current = controller.current;
      controller.current = null;
      if (!current) return;

      current.destroy();
      void current.dialer.destroy();
    };
  }, [email]);

  return null;
}
```

For Bar, render the container before creating the controller:

```tsx
export function RingeeBar() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    let mounted = true;
    let cleanup: (() => void) | undefined;

    void import("@ringee/dialer-sdk/ui").then(({ createBar }) => {
      if (!mounted || !container.current) return;

      const bar = createBar({
        key: process.env.NEXT_PUBLIC_RINGEE_KEY!,
        container: container.current,
      });

      cleanup = () => {
        bar.destroy();
        void bar.dialer.destroy();
      };
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  return <div ref={container} />;
}
```

## CRM contacts

Attach the contact currently displayed by the host application:

```ts
ringee.setContact({
  name: "Morgan Reed",
  number: "+13055550142",
  imageUrl: "https://crm.example.com/avatars/294.png",
  externalContactId: "crm-contact-294",
});
```

| Field               | Purpose                          |
| ------------------- | -------------------------------- |
| `name`              | Visual label in the included UI  |
| `number`            | Prefills the destination         |
| `imageUrl`          | Visual avatar in the included UI |
| `contactId`         | Native Ringee contact UUID       |
| `externalContactId` | Contact id in the integrated CRM |

Use `contactId` when you already know the internal Ringee UUID. Use
`externalContactId` when the Custom Integration maps a CRM id to a Ringee
contact. You do not need both.

To prefill only a number:

```ts
ringee.prefill("+13055550142");
```

## Customization

### Language

English is the default. Spanish remains available explicitly:

```ts
createFloating({
  key: "pk_live_xxxxx",
  locale: "en", // default; use "es" for Spanish
});
```

### Copy overrides

`strings` replaces individual labels on top of the selected language:

```ts
createBar({
  key: "pk_live_xxxxx",
  container: "#ringee-bar",
  strings: {
    callButton: "Call prospect",
    numberLabel: "Prospect phone number",
  },
});
```

The included UIs translate backend error codes into actionable messages.
Headless applications decide how those errors are displayed.

### Theme

```ts
const ringee = createFloating({
  key: "pk_live_xxxxx",
  theme: {
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    onPrimary: "#ffffff",
    radius: "14px",
    fontFamily: "Inter, sans-serif",
    colorScheme: "auto",
  },
});

ringee.setTheme({
  primary: "#0f766e",
  colorScheme: "dark",
});
```

`colorScheme` accepts `"auto"`, `"light"`, or `"dark"`. Theme fields include:

- `primary`, `primaryHover`, `onPrimary`;
- `background`, `surface`, `text`, `textMuted`, `border`;
- `danger`, `success`, `warning`;
- `radius`, `shadow`, `fontFamily`;
- `colorScheme`.

The same values are available as CSS custom properties:

```css
#crm-shell {
  --ringee-primary: #4f46e5;
  --ringee-primary-hover: #4338ca;
  --ringee-on-primary: #ffffff;
  --ringee-background: #ffffff;
  --ringee-surface: #f8fafc;
  --ringee-text: #0f172a;
  --ringee-text-muted: #64748b;
  --ringee-border: #e2e8f0;
  --ringee-danger: #dc2626;
  --ringee-success: #16a34a;
  --ringee-warning: #d97706;
  --ringee-radius: 14px;
  --ringee-shadow: 0 20px 50px rgb(15 23 42 / 18%);
  --ringee-font-family: Inter, sans-serif;
}
```

## API reference

### Common UI options

| Option          | Type               | Default                 | Description                                   |
| --------------- | ------------------ | ----------------------- | --------------------------------------------- |
| `key`           | `string`           | required                | `pk_live_...` publishable key                 |
| `apiUrl`        | `string`           | `https://api.ringee.io` | API base URL without `/api`                   |
| `agentEmail`    | `string`           | —                       | Prefills UI email; does not authenticate      |
| `debug`         | `boolean`          | `false`                 | Enables verbose engine logs                   |
| `dialer`        | `RingeeDialer`     | —                       | Reuses a headless instance                    |
| `theme`         | `RingeeTheme`      | Ringee theme            | Overrides visual tokens                       |
| `locale`        | `string`           | `"en"`                  | `en` or `es`                                  |
| `strings`       | `Partial<Strings>` | —                       | Overrides individual labels                   |
| `allowHold`     | `boolean`          | `false`                 | Shows Hold/Resume controls                    |
| `workspaceName` | `string`           | —                       | Workspace label in the footer                 |
| `onError`       | `(error) => void`  | —                       | Receives typed errors also rendered by the UI |

Floating adds:

| Option         | Type                | Default         | Description                     |
| -------------- | ------------------- | --------------- | ------------------------------- |
| `side`         | `"left" \| "right"` | `"right"`       | Launcher side                   |
| `defaultOpen`  | `boolean`           | `false`         | Opens the initial panel         |
| `rememberOpen` | `boolean`           | `true`          | Remembers open state in the tab |
| `container`    | `HTMLElement`       | `document.body` | Shadow DOM parent               |

Bar requires `container: HTMLElement | string`.

### UI controllers

| Method/property       | Floating | Bar | Description                      |
| --------------------- | :------: | :-: | -------------------------------- |
| `dialer`              |   Yes    | Yes | Underlying headless instance     |
| `open()`              |   Yes    |  —  | Opens the panel                  |
| `close()`             |   Yes    |  —  | Closes the panel                 |
| `toggle()`            |   Yes    |  —  | Toggles the panel                |
| `startCall(input)`    |   Yes    |  —  | Opens and queues/starts a call   |
| `setContact(contact)` |   Yes    | Yes | Attaches the current contact     |
| `prefill(number)`     |   Yes    | Yes | Prefills the number              |
| `setTheme(theme)`     |   Yes    | Yes | Updates the theme                |
| `on(event, handler)`  |   Yes    | Yes | Subscribes to a headless event   |
| `destroy()`           |   Yes    | Yes | Removes the UI and its listeners |

`controller.destroy()` removes the visual surface but does not automatically
destroy the headless instance. To release WebRTC, audio, and the call lock:

```ts
controller.destroy();
await controller.dialer.destroy();
```

If you supplied a shared `dialer`, destroy it only after every consumer has
finished using it.

### `RingeeDialer` methods

| Method                         | Result                    | Purpose                                     |
| ------------------------------ | ------------------------- | ------------------------------------------- |
| `initialize()`                 | `Promise<void>`           | Validates installation and restores session |
| `destroy()`                    | `Promise<void>`           | Disconnects and releases resources          |
| `requestEmailCode(email)`      | `Promise<EmailChallenge>` | Starts email OTP                            |
| `verifyEmailCode(input)`       | `Promise<RingeeAgent>`    | Verifies OTP                                |
| `resendEmailCode(challengeId)` | `Promise<EmailChallenge>` | Resends OTP                                 |
| `signOut()`                    | `Promise<void>`           | Signs out the agent                         |
| `getAuthState()`               | `AuthState`               | Current auth state                          |
| `getAgent()`                   | `RingeeAgent \| null`     | Authenticated agent                         |
| `getCallerIds()`               | `RingeeCallerId[]`        | Allowed caller IDs                          |
| `call(input)`                  | `Promise<RingeeCall>`     | Authorizes and starts a call                |
| `hangup()`                     | `Promise<void>`           | Ends the call                               |
| `mute()` / `unmute()`          | `void`                    | Controls microphone state                   |
| `hold()` / `resume()`          | `Promise<void>`           | Controls hold state                         |
| `sendDigits(digits)`           | `void`                    | Sends DTMF                                  |
| `getState()`                   | `DialerState`             | Current dialer state                        |
| `getActiveCall()`              | `RingeeCall \| null`      | Active call snapshot                        |
| `getInputDevices()`            | `Promise<AudioDevice[]>`  | Lists microphones                           |
| `getOutputDevices()`           | `Promise<AudioDevice[]>`  | Lists output devices                        |
| `setInputDevice(id)`           | `Promise<void>`           | Stores and validates preferred input        |
| `setOutputDevice(id)`          | `Promise<void>`           | Selects output where supported              |
| `on(event, handler)`           | `() => void`              | Subscribes and returns unsubscribe          |

### Authentication states

```text
checking -> anonymous -> sending_code -> awaiting_code -> verifying
                                                     -> authenticated
                                                     -> error
authenticated -> expired | signed_out
```

`AuthState` values: `checking`, `anonymous`, `sending_code`, `awaiting_code`,
`verifying`, `authenticated`, `expired`, `signed_out`, and `error`.

### Call states

```text
uninitialized -> initializing -> ready -> dialing -> ringing -> active
                                      -> error                 -> held
active | held -> reconnecting -> active
active | held -> ending -> ended -> ready
```

`DialerState` values: `uninitialized`, `initializing`, `ready`, `connecting`,
`dialing`, `ringing`, `active`, `held`, `reconnecting`, `ending`, `ended`, and
`error`.

The exact sequence may skip states depending on the browser, network, or remote
destination. Do not assume every state always fires.

### Events

Every subscription returns an unsubscribe function:

```ts
const off = dialer.on("stateChanged", ({ state }) => {
  console.log(state);
});

off();
```

| Event              | Payload           | Emitted when                                  |
| ------------------ | ----------------- | --------------------------------------------- |
| `ready`            | `{}`              | Agent and WebRTC are ready                    |
| `authStateChanged` | `{ state }`       | Authentication changes                        |
| `authRequired`     | `{}`              | OTP is required                               |
| `codeSent`         | `{ challenge }`   | Code is sent or resent                        |
| `signedIn`         | `{ agent }`       | Agent is authenticated                        |
| `signedOut`        | `{}`              | Session is signed out                         |
| `sessionExpired`   | `{}`              | Session expires                               |
| `stateChanged`     | `{ state }`       | Call state changes                            |
| `dialing`          | `{ call }`        | Dialing starts                                |
| `ringing`          | `{ call }`        | Destination rings                             |
| `answered`         | `{ call }`        | Call is answered                              |
| `held`             | `{ call }`        | Call is held                                  |
| `resumed`          | `{ call }`        | Call resumes                                  |
| `muted`            | `{ call }`        | Microphone is muted                           |
| `unmuted`          | `{ call }`        | Microphone is unmuted                         |
| `ended`            | `{ call }`        | Call ends normally                            |
| `failed`           | `{ call, error }` | Authorization or call fails                   |
| `tokenExpiring`    | `{}`              | Reserved for proactive credential renewal     |
| `microphoneDenied` | `{}`              | Reserved; currently use `error`/`failed` code |
| `deviceChanged`    | `{}`              | Audio selection changes                       |
| `error`            | `{ error }`       | A typed general error occurs                  |

### Errors

Rejected promises use `RingeeError`:

```ts
import { RingeeError } from "@ringee/dialer-sdk";

try {
  await dialer.call({ to: "+13055550198" });
} catch (error) {
  if (error instanceof RingeeError) {
    console.log(error.code);
    console.log(error.message);
    console.log(error.retryable);
  }
}
```

Common codes:

- installation: `INVALID_PUBLISHABLE_KEY`, `DOMAIN_NOT_ALLOWED`,
  `INTEGRATION_DISABLED`;
- authentication: `INVALID_EMAIL`, `INVALID_EMAIL_CODE`,
  `EMAIL_CHALLENGE_EXPIRED`, `EMAIL_CODE_ATTEMPTS_EXCEEDED`, `AUTH_REQUIRED`,
  `SESSION_EXPIRED`;
- permissions: `AGENT_NOT_ALLOWED`, `AGENT_NOT_IN_WORKSPACE`, `USER_BLOCKED`,
  `CALLING_DISABLED`;
- calls: `INVALID_PHONE_NUMBER`, `NO_CALLER_ID`, `CALLER_ID_NOT_ALLOWED`,
  `INSUFFICIENT_CREDIT`, `DNC_BLOCKED`, `CALL_ALREADY_ACTIVE`,
  `NO_ACTIVE_CALL`, `CALL_FAILED`;
- browser/network: `MICROPHONE_DENIED`, `NO_AUDIO_DEVICE`,
  `AUDIO_PLAYBACK_BLOCKED`, `TELNYX_CONNECTION_FAILED`, `NETWORK_ERROR`,
  `TIMEOUT`.

`retryable` is true for known transient errors such as rate limits, timeouts,
network failures, and Telnyx connection failures. Do not automatically retry
permission, credit, DNC, or authentication errors.

## How it works

### During initialization

1. The SDK reads `window.location.origin`.
2. It sends the publishable key and origin to Ringee.
3. The backend validates the signature, active integration, and exact origin.
4. The SDK checks for an agent session in `sessionStorage`.
5. If present, Ringee revalidates it and returns a new WebRTC credential.
6. Otherwise, the SDK requests email OTP authentication.

### During agent authentication

1. The agent enters an email address.
2. Ringee sends a one-time code without revealing whether the email exists.
3. The agent verifies the code.
4. The backend validates workspace membership and calling permissions.
5. The browser receives a Ringee session and temporary WebRTC credentials.
6. The SDK connects the calling engine and emits `ready`.

### During a call

1. The SDK validates E.164 locally.
2. It acquires a lock to prevent another tab from starting a call.
3. The backend validates the session, caller ID, credit, DNC, blocks, and
   contact.
4. Ringee creates the call record and returns a signed correlation token.
5. The browser requests microphone permission.
6. The SDK starts the WebRTC call and maps provider states to Ringee states.
7. On completion, it releases audio and the lock, calculates duration, and
   emits `ended` or `failed`.

The public API never exposes SIP passwords, Telnyx JWTs, or provider-specific
objects to the host application.

### Persistence

The agent session is stored in `sessionStorage` under a key scoped by integration
and origin. It survives reloads in the same tab and is removed when the tab
closes or `signOut()` runs.

WebRTC credentials live only in memory and are minted again on restore. If a
browser blocks `sessionStorage`, the SDK still works but asks for OTP after each
reload.

## Security

Security does not depend on hiding `pk_live_...`. Every call requires:

- a signed publishable key;
- an exact allowed origin;
- an agent verified by email OTP;
- current workspace membership;
- a valid Ringee session;
- server-side permission, caller ID, credit, DNC, and block validation.

Never place `cik_live_...`, SIP credentials, Ringee secrets, webhook secrets,
or admin tokens in frontend code.

### Content Security Policy

A restrictive CSP must allow the Ringee API and the calling WebSocket. Adapt the
remaining values to the host policy:

```text
script-src 'self' https://unpkg.com;
connect-src 'self' https://api.ringee.io wss://rtc.telnyx.com;
media-src 'self' blob:;
```

An npm installation does not need `unpkg.com`. For self-hosting, replace
`https://api.ringee.io` with your API origin. Regional Telnyx configuration may
require an additional WebSocket origin.

### Microphone and iframes

Calls must run in a secure context (`https://` or localhost). If the SDK runs
inside an iframe, the host must grant microphone access:

```html
<iframe src="https://dialer.crm.example.com" allow="microphone"></iframe>
```

The origin in `allowedOrigins` is the origin of the document executing the SDK,
which may differ from the parent page. A sandboxed iframe must also retain the
origin and storage permissions the SDK needs.

## Self-hosting and local development

Pass the API base origin without `/api`:

```ts
const ringee = createFloating({
  key: "pk_live_xxxxx",
  apiUrl: "https://ringee-api.example.com",
});
```

Local example:

```ts
const ringee = createFloating({
  key: "pk_live_xxxxx",
  apiUrl: "http://localhost:3000",
  debug: true,
});
```

Remember that the frontend origin, such as `http://localhost:4200`, must be in
the publishable key. `apiUrl` and the frontend origin are different values.

### Playgrounds

This repository includes:

- `apps/sdk-playground/live`: real Floating, Bar, and Headless modes against a
  real Ringee backend, including OTP, WebRTC, and real calls;
- `apps/sdk-playground/vanilla-headless`: a minimal framework-free headless
  example;
- `apps/sdk-playground/ui-gallery`: visual Floating and Bar states driven by a
  simulated dialer with no network or WebRTC.

Run the complete playground on `http://localhost:5173`:

```bash
node apps/sdk-playground/live/build.mjs --serve
```

Before running it, add `http://localhost:5173` under **Allowed origins** in
**Integrations → Custom Integrations** and generate the publishable key.

Validate the package in the monorepo with:

```bash
pnpm --filter @ringee/dialer-sdk typecheck
pnpm --filter @ringee/dialer-sdk test
pnpm --filter @ringee/dialer-sdk build
```

## Troubleshooting

### `DOMAIN_NOT_ALLOWED`

Compare `window.location.origin` exactly with the origins configured under
**Integrations → Custom Integrations → Configure → Settings → Dialer SDK ·
Publishable keys**. Check the scheme, subdomain, and port. Generate and use a
new publishable key after changing the origin list.

### `INVALID_PUBLISHABLE_KEY`

The key is malformed, the integration was removed, or its secret API key was
rotated. Generate a new publishable key.

### `AUTH_REQUIRED` or OTP appears after every reload

Wait for `ready` before calling. If OTP reappears after each reload, verify that
the browser, iframe, or privacy policy allows `sessionStorage`.

### `MICROPHONE_DENIED`

Serve the page over HTTPS, allow microphone access for the site, and check the
host `Permissions-Policy`. Add `allow="microphone"` to an iframe.

### `AUDIO_PLAYBACK_BLOCKED`

The browser requires a user gesture before playing audio. Start calls from a
real click or tap instead of calling automatically during page load.

### `INVALID_PHONE_NUMBER`

Use E.164: `+`, country code, and number without an extension. Example:
`+13055550198`.

### `CALL_ALREADY_ACTIVE`

A call already exists in the instance or another tab using the same
integration. End it before starting another call.

### The Bar does not appear

The container must exist before `createBar()` runs. Also ensure the host layout
does not collapse the element's width or height.

### The UI disappears but WebRTC remains connected

`controller.destroy()` unmounts the UI. Destroy the engine as well:

```ts
controller.destroy();
await controller.dialer.destroy();
```

## License

MIT
