# apps/hubspot — HubSpot developer project

The Ringee app's definition in HubSpot, kept as a HubSpot developer project
(platform `2026.03`). It is configuration HubSpot builds the app from, not
code Ringee runs: the OAuth client and the CRM sync live in
`packages/platform/src/crm/providers/hubspot/`.

| Path                                    | What it is                                                     |
| --------------------------------------- | -------------------------------------------------------------- |
| `hsproject.json`                        | Project name, platform version and source directory            |
| `src/app/app-hsmeta.json`               | The app: OAuth redirect URLs, scopes, listing and support data |
| `src/app/webhooks/webhooks-hsmeta.json` | Webhook subscriptions — HubSpot's generated examples, inactive |

## Rules

- **Never change a `uid`** (`Ringee_app`, `Ringee_webhooks`). HubSpot matches
  components across builds by uid: a new one uploads as a new app with a new
  client ID and secret, and existing installs stay on the old app.
- `requiredScopes` and `optionalScopes` must equal `HUBSPOT_OAUTH_SCOPES` and
  `HUBSPOT_OAUTH_OPTIONAL_SCOPES` in `@ringee/configuration`. HubSpot rejects
  an install URL whose scopes differ from the app's.
- Each `redirectUrls` entry is `${BACKEND_URL}/api/crm/hubspot/oauth/callback`
  for one environment.
- Ringee has no HubSpot webhook endpoint yet. Activating a subscription needs
  one first, and it must verify HubSpot's signature before anything else
  (`apps/backend/AGENTS.md`).
- `hubspot.config.yml` holds the account's personal access key. It lives
  outside the repository and is never committed.

## Commands

Run from this directory with the HubSpot CLI (`hs`), authenticated to the
account that owns the app:

```bash
hs project validate   # check the configuration without uploading
hs project upload     # upload a new build of the app to HubSpot
```

`hs project upload` changes the live app — its scopes, redirect URLs and
listing — so it is a release step, not a local check.
