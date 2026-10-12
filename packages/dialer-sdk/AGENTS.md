# packages/dialer-sdk — published SDK rules

`@ringee/dialer-sdk` is **published** and loaded from unpkg/jsDelivr by third-party
pages. Its surface is a public contract with users you cannot grep for.

- Treat every export in `dist/index.d.ts` and `dist/ui/index.d.ts` as public.
  Additive changes are safe; renames, removals and changed option shapes are
  breaking and need a version bump in `package.json`.
- The build is `tsup` and bundles `@ringee/dialer-core` (and `@telnyx/webrtc`)
  into the shipped artifact. A change in dialer-core is a change in this SDK.
- `src/telnyx/telnyx-adapter.ts` is the only Telnyx-aware layer. Everything above
  it speaks Ringee's public vocabulary.
- Authentication is the publishable key (`pk_live_…`) plus server-side origin,
  OTP and membership checks. The publishable key is **not** a secret; never put
  the integration secret (`cik_live_…`) into anything shipped to a browser.
- Backend counterparts live in `apps/backend/src/api/sdk` and
  `packages/services/src/services/sdk`. A change on one side needs the other.
- Run `pnpm --filter @ringee/dialer-sdk run test` and `run typecheck` before
  finishing. `apps/sdk-playground` exercises the real bundle.
