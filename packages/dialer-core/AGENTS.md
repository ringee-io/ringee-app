# packages/dialer-core — browser call engine rules

Framework-free, browser-side calling primitives shared by the web dashboard, the
Chrome extension, the Dialer SDK and `@ringee/dialer-ui`. No React, no NestJS, no
server packages (ESLint `ARCH-003`).

## Canonical here — do not reimplement elsewhere

- `phone/normalize.ts` — `normalize`, `isValidPhoneNumber`, `formatForDisplay`,
  `countryCallingCode`. libphonenumber-backed E.164 handling for anything a user
  types or a page yields. `countryCallingCode` exists because tap-to-dial keypads
  produce local digits: prefixing a bare `+` is only correct by accident in NANP.
- `phone/detect.ts` — finding dialable numbers in page text.
- `engine/state-map.ts` — Telnyx call state → Ringee call state. This mapping is
  the normalization boundary; consumers switch on Ringee states, not Telnyx ones.
- `engine/telnyx-engine.ts` — the **single** monorepo importer of `@telnyx/webrtc`
  outside the frontend's own call features and the SDK adapter.
- `contracts/` — cross-context message shapes. `store/call-store.ts` — call state.
- `dtmf/tones.ts` — tone generation.

`normalizePhoneE164` in `packages/platform/src/crm/phone.ts` is the server-side
counterpart, for CRM matching. Both are libphonenumber-backed and agree; the
server one additionally keeps a lenient fallback for the unparseable values CRM
records hold. Two exist because they run in different places — **do not add a
third**, and pick the one matching your runtime.

## Rules

- Keep this package pure and testable: every module here has a `*.test.ts` next
  to it (`pnpm --filter @ringee/dialer-core run test`). Add tests with changes.
- New Telnyx event handling goes in the engine and is mapped to a Ringee state.
  Do not leak a raw `INotification` past the engine boundary.
- Anything exported from here reaches the published SDK. Treat exports as public
  API — see `packages/dialer-sdk/AGENTS.md`.
