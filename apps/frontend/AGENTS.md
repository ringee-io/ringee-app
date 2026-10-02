# apps/frontend — Next.js dashboard rules

Next.js 15 App Router, React 19, feature-based layout under `src/features/<domain>/`.
Shared UI, hooks and the API client live in `@ringee/frontend-shared`.

## Where code goes

- A feature owns its own `components/`, `hooks/`, `store/`, `types/` under
  `src/features/<domain>/`. Do not scatter a feature across the tree.
- Anything reused by two or more features moves to `@ringee/frontend-shared`.
- Server-only packages (`@ringee/services`, `@ringee/database`,
  `@ringee/platform`, `@ringee/configuration`) must never be imported here —
  ESLint blocks it (`ARCH-003`). Talk to the backend over `/api`.

## Data fetching

Use the existing clients — do not hand-roll `fetch` with an auth header.

- Client components: `useApi()` (`@ringee/frontend-shared/hooks/use.api`) — wraps
  `ApiClient` with the Clerk token and the Ringee device-id header.
- Server components / route handlers: `apiServer` (`lib/api.server`).
- The device-id header is what lets the API tell "same device re-dialing" from
  "second device" for the one-call-at-a-time rule. Do not strip it.
- Errors surface as `ApiError` with `status` and `data`. Handle `402`
  (out of credit) and `409` (already on a call) explicitly on dial surfaces.
- `ClerkProvider` wraps only the authenticated route groups
  (`ClerkAppProvider`); the root `<Toaster />` sits outside it. Content
  rendered through `toast.custom` must not call a Clerk hook — `useApi()`
  included — or the whole app crashes the moment the toast shows. Build the
  client in the dashboard tree and pass it in (`useIncomingCallToasts`).

## Business logic

Pricing, credit math, eligibility, call-state transitions and authorization
decisions are **server** concerns. The frontend renders what the API returns.
If you need a number the API does not send, add it to the API response.

## Permissions

`useOrgRole()` is the single source for role-based UI: `canAccessAdminFeatures`
is true for freelancers (no org) and `org:admin`. Gate admin page bodies with
`RoleGuard`, and hide nav items with `hiddenForMember`.

These are **cosmetic**. The server enforces the same rule with `@OrgAdminOnly()`.
Never treat a hidden control as a security boundary, and never add an admin
capability to the UI without the matching server guard.

## UI conventions

- Components are Radix primitives + Tailwind 4 via
  `@ringee/frontend-shared/components/ui`. Check there before writing a new one.
- Forms: React Hook Form + Zod, using the `components/forms/form-*` wrappers.
- Tables: `useDataTable` + the `config/data-table` conventions.
- Every list view needs all three states — loading, empty, error. Reuse the
  existing skeletons rather than inventing a spinner.
- Copy goes through `next-intl` (`useTranslations`), not string literals.

## Telephony in the browser

WebRTC lives in `src/features/calls`, `src/features/dialer` and
`src/features/dialer-session`. `@telnyx/webrtc` may be touched only there. Prefer
the shared engine and state map in `@ringee/dialer-core` over new ad-hoc handling
of Telnyx notification objects.

**An inbound call is presented because the server said it is ours.** Every
dashboard registers with the same WebRTC credential, so the provider offers
every inbound leg to every browser (`DEBT-020`). `call.inbound.ringing` on the
per-user realtime channel is what names the recipient — a ring group included —
and `inbound-offers.store` is where it lands. Do not reintroduce a client-side
decision about whose call a leg is: the workspace's number list cannot express
a ring group, and answering is claimed server-side
(`POST /api/inbound-calls/:callControlId/claim`) before the media leg is
touched. The socket is mounted **once**, in `AccountLockdownProvider`; a second
`useUserEvents` is a second socket and a duplicate device in the backoffice.

**Only the call on screen has a wrap-up.** For the same reason most legs that
end in a browser are not its call: somebody else's leg on the shared
credential, one answered on another tab or device, one declined or missed.
`useHangupListener` opens the post-call phase only for the leg that is
`activeCall` (placed or answered here); any other ending only leaves the queue.

**An answered inbound call is identified by its offer, not by its leg.** On an
inbound leg the SDK's `destinationNumber`, `callerNumber` and `callerName` are
the side that was called — our number, or the per-user credential a transfer
rang; the caller is `remoteCallerNumber`. A transferred leg is one the server
dialed, not the call's own, so the Ringee call is not looked up from the leg's
session. On answer, `IncomingCall` writes the offer's `callId`, caller number
and contact into the call store; the call screen and the post-call outcome read
them from there.

**A manual call starts through `useDial`** (`features/calls/hooks/use.dial.ts`),
wherever it is started from — keypad, contact, callback, recent call, call
detail. It dials in place (the active-call modal opens over the current page),
refuses a second dial while one is starting or live, and asks the one shared
DNC confirmation (`confirmDncCall`). Do not call `useCall().handleCall` from a
new surface, and do not route a "call" button through the call page.

The caller ID is the user's choice in the numbers store, which only the
dialer's number selector used to load — so a call from any other surface went
out from the shared public number. `useDial` loads the numbers
(`ensureNumbersLoaded`) before it dials, `handleCall` reads the selection at
dial time, and a call that will go out from the public number is announced
first (`confirmPublicNumberCall`, which the user can silence per browser). The
campaign dialer never uses the public number: its caller ID is resolved
server-side.

**A live call is ended by the hang-up button or by the person on the other end,
and by nothing else.** That includes a dialog's corner close: the active-call
modal's `onClose` is the host's hang-up, so its dialogs render
`showCloseButton={false}`. No other control may call `hangup()` — not a disposition,
not a shortcut, not a timer. On a leg the server dialed
(`controlledInboundLegs`), the hang-up button also asks the server to end the
caller (`POST /api/inbound-calls/legs/:callControlId/hangup`): the caller is on
another leg the server bridged, which the browser's own hangup reaches only
through the provider. In the campaign dialer the outcome buttons are live
during the call so the agent can choose while they talk; the choice is saved
when the call ends, and saving it is what advances the session to the next lead.
An outcome that still needs input (a callback without its date) leaves the
session waiting for the agent, which is deliberate.

The campaign workspace places and follows its leg in exactly one place,
`useDialerCallEngine` (mounted by `AgentWorkspace`), tracked by the leg's own
call id in `dialer-call.store`. Do not add a second listener that maps "any
outbound call" onto the attempt — a second leg's hangup used to clear the live
call. A leg that ends before the provider acknowledged it (`trying`) never
reached the server: report it through `POST /dialer/abandon`, or the agent is
left `dialing` (`CMP-013`).
