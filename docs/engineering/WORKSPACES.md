# Workspaces, authentication and authorization

Rules: `WRK-001`..`WRK-007`, `AUTH-001`..`AUTH-003` in
[BUSINESS_RULES.md](BUSINESS_RULES.md).

## The tenancy model

Ringee serves two shapes of customer with one schema:

- **Freelancer** — a `User` with no active organization. Their rows have
  `userId = <them>` and `organizationId = null`.
- **Organization** — a `User` acting inside an org. Rows carry
  `organizationId = <org>`; `userId` records _who_ did it.

There is no third shape. `OwnershipContext { userId, organizationId? }` collapses
both into one predicate.

```ts
// controller
const ctx = createOwnershipContext(user);      // user comes from @CurrentUser()

// repository
where: buildOwnershipFilter(ctx)
//  org      → { organizationId }
//  personal → { userId, organizationId: null }

// on create
data: { ...buildOwnershipData(ctx) }
```

The asymmetry is deliberate: an org query does **not** also filter by `userId`,
because org data belongs to the org. A personal query **must** pin
`organizationId: null`, or it would pick up the same user's org rows.

## Identity resolution

```
Clerk session cookie / JWT
      │
      ▼
clerkMiddleware()            (main.ts)
      │
      ▼
ClerkAuthGuard  (global APP_GUARD)
      ├── getAuth(request) → userId, orgId, orgRole
      ├── blocked-account check                   → 403
      ├── org lookup by Clerk id → request.clerkOrgId (Ringee UUID)
      └── request.resolveRingeeUser = () => …
      │
      ▼
@CurrentUser()  → { id (Ringee UUID), activeOrgId, activeOrgRole, … }
```

Two details worth knowing before touching this:

- `request.clerkOrgId` holds the **Ringee** organization UUID, not the Clerk id,
  despite the name.
- The Ringee user id lives in Clerk `privateMetadata.userId`. Clerk can redirect
  a new user before the `user.created` webhook creates the local row, so the
  guard repairs that race on first request and de-duplicates concurrent syncs
  through `pendingUserSyncs`.

## Roles

Clerk roles: `org:admin`, `org:member`. Freelancers have no role and are
unrestricted (`WRK-004`).

| Layer                            | Mechanism                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Server, admin features           | `@OrgAdminOnly()` / `OrgAdminGuard`, with `@AllowOrgMember()` to re-open a read handler on an admin-only controller |
| Server, Ringee staff             | `@SuperAdminOnly()` / `SuperAdminGuard` (verified-email allowlist)                                                  |
| Server, member data scoping      | `resolveMemberFilter(user, memberId)`                                                                               |
| Server, analytics scoping        | `createDashboardContext(user, { scope, filterMemberId, … })`                                                        |
| Client, navigation & page bodies | `useOrgRole()`, `RoleGuard`, `hiddenForMember`                                                                      |

The client mirror exists so members do not see doors they cannot open. It is not
the lock (`WRK-005`).

### Dashboard scoping

`DashboardContext` extends the ownership context with `isOrgAdmin`, `scope`
(`personal` | `organization`), `filterMemberId`, plus date/campaign/outcome
filters. `scope: "personal"` forces `userId`-only filtering even for an admin.
Only an admin may set `filterMemberId`; `getAgentPerformance` returns `[]`
outright for a non-admin.

## Non-Clerk identities

Not every caller is a dashboard user. Each has its own boundary, and each must
still resolve to an `OwnershipContext`:

| Caller                  | Proves identity with                                         | Resolves to                              |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| Dialer SDK agent        | bearer SDK session + `Origin`, re-validated live per request | the agent's user + integration workspace |
| Magic-link dialer       | opaque token, matched by SHA-256 hash                        | the session's workspace                  |
| Custom Integration      | `cik_live_…` API key (hashed, constant-time)                 | the integration's workspace              |
| MCP client              | the workspace UUID embedded in the connector URL             | that user or organization                |
| Telnyx / Stripe / Clerk | request signature over the raw body                          | the owning workspace of the subject row  |

The MCP case is a capability-URL model: possession of the URL is the credential.
See [SECURITY.md](SECURITY.md).

## Checklist for a new workspace-scoped endpoint

1. Take `@CurrentUser() user: CurrentUserData`, build `createOwnershipContext`.
2. Pass the context down; never pass a raw `userId` from the request body.
3. In the service, load the resource and verify its workspace before acting
   (`WRK-002`).
4. For list endpoints exposing other members' data, apply `resolveMemberFilter`.
5. If it is an admin capability, add `@OrgAdminOnly()` **and** hide it in the UI.
6. If it must be `@Public()`, give it its own proof of authorization (`AUTH-002`).
