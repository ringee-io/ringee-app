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
