# apps/backend — API layer rules

NestJS REST API. Global prefix `/api`, raw body enabled, `ClerkAuthGuard`
registered as `APP_GUARD` in `app.module.ts`.

## Controllers stay thin

Authenticate → build the ownership context → delegate to `@ringee/services` →
shape the response. No business logic, no Prisma queries, no provider calls.

```ts
@Get()
async list(@CurrentUser() user: CurrentUserData) {
  return this.someService.list(createOwnershipContext(user));
}
```

Some controllers inject repositories directly. That is existing debt, not a
pattern — see `docs/engineering/ARCHITECTURE_DEBT.md`. Do not add more.

## Authorization

Every route is authenticated by default. The layers, in order:

| Need | Use |
|---|---|
| Any signed-in user | nothing — the global guard covers it |
| Org admins only (freelancers unrestricted) | `@OrgAdminOnly()`; `@AllowOrgMember()` to re-open one handler |
| Ringee staff | `@SuperAdminOnly()` (email allowlist) |
| Dialer SDK agent | `@Public()` + `SdkSessionGuard` |
| Unauthenticated | `@Public()` — and prove authorization another way |

`@Public()` removes the only authentication on a route. Every public route must
carry its own proof: a verified provider signature, a hashed magic-link token, an
SDK session, or an API key. Never add `@Public()` for convenience.

`resolveMemberFilter(user, memberId)` is the canonical rule for member-scoped
list endpoints: an org member is always forced to their own `userId`, regardless
of the `memberId` they ask for.

## Webhooks

Verify the signature **before** anything else and fail closed:

- Telnyx (`call`, `messaging`, `desk-phone`) — `TelnyxWebhookVerifier` over
  `req.rawBody`, Ed25519 + timestamp tolerance.
- Stripe — `stripeService.validateWebhook(req.rawBody, signature, secret)`.
- Clerk — raw body registered in `main.ts` for `/webhooks/clerk`.
- Custom Integrations inbound — HMAC via `packages/platform/src/custom-integrations`.

Never reconstruct the signed payload from the parsed body when `rawBody` is
available. Handlers must be replay-safe: the same event delivered twice must not
charge, dial, or emit twice.

## CORS and origins

`main.ts` holds a static credentialed allowlist; `sdkCors` handles the dynamic,
non-credentialed SDK preflight and is registered first. Add SDK origins through
the integration's `allowedOrigins`, not by widening the static list.

## Long-running work

The API process does not do slow work inline. Start a Temporal workflow via
`OrchestratorService`. The one deliberate exception is
`DialerOrchestrationService.startPolling()`, which must run in this process
because lead assignment is pushed over in-process SSE — see the comment in
`app.module.ts` before touching it.
