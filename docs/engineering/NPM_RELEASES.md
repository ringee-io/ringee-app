# npm releases

Two packages built from this repository are published to npm:

| Package              | Directory             | Consumers                                                     |
| -------------------- | --------------------- | ------------------------------------------------------------- |
| `@ringee/dialer-sdk` | `packages/dialer-sdk` | CRMs installing it from npm or loading it from unpkg/jsDelivr |
| `ringee` (the CLI)   | `apps/agent-cli`      | Users' terminals and agent harnesses                          |

Both are released by `.github/workflows/npm-publish.yml`. Nobody publishes them
from a laptop.

## Releasing

Bump `version` in the package's `package.json` and merge to `main`. That is the
whole process.

- On every push to `main`, `scripts/plan-npm-releases.mjs` compares each version
  with the registry. A version that is not on npm yet is published; one that is
  gets skipped. The comparison is against npm, not against the previous commit,
  so re-running a run publishes nothing twice and a publish that failed is
  retried by re-running its job.
- A prerelease (`0.2.0-beta.1`) goes out under the `next` dist-tag. A stable
  version gets `latest`, and npm refuses a stable version lower than one already
  published — a backport has to be published by hand with an explicit `--tag`.
- **CLI:** `ringee --version`, its User-Agent and the client version it sends
  over MCP all read `apps/agent-cli/package.json`; the version lives nowhere
  else.
- **SDK:** pages that load the unversioned `https://unpkg.com/@ringee/dialer-sdk`
  receive the new `latest` as soon as unpkg's cache expires. Merging a version
  bump releases it to every one of those CRMs at once.

## How a release runs

For each package that is due, the **build** job:

1. Typechecks and tests the package and the workspace packages it bundles
   (`@ringee/dialer-core` into the SDK, `@ringee-io/agent` into the CLI).
2. Builds it, then runs `pnpm pack`, which rewrites `workspace:` versions.
3. Runs `scripts/verify-npm-tarball.mjs`, which installs that tarball into an
   empty project with npm and requires that it installs from the public
   registry alone, that every file the manifest points at is in it, that every
   `exports` entry point loads through `import` (and `require` where offered),
   and that every binary prints the package version for `--version`.
4. Uploads the tarball as a workflow artifact.

The **publish** job then downloads that tarball and runs `npm publish` on it.
It is the only job that can obtain publish rights, and it runs no code from
this repository or its dependencies: the build job executes hundreds of
third-party packages (install scripts, build tools, tests), and none of them can
mint an npm token. If one package's build fails, the other package still
publishes. After fixing a failed publish (for example, a missing trusted
publisher), **Re-run failed jobs** publishes the tarball that was already
verified.

Step 3 exists because `@ringee/dialer-sdk@0.1.1` was published with
`"@ringee/dialer-core": "workspace:*"` in `dependencies`, and
`npm install @ringee/dialer-sdk` fails with `EUNSUPPORTEDPROTOCOL`. A workspace
package that a published package bundles belongs in `devDependencies`.

## Authentication: trusted publishing

There is no npm token in this repository. The publish job asks GitHub for an
OIDC token (`id-token: write`) and npm exchanges it for a short-lived token that
can publish only that package. This needs npm 11.5.1 or later; Node 22 bundles
npm 10, so the job upgrades it. Because the repository is public, npm also
attaches a provenance attestation, which only succeeds when the package's
`repository.url` matches `github.com/ringee-io/ringee-app`.

One-time setup on npmjs.com, for each package: on its **Settings** page, under
**Trusted publishing**, choose **GitHub Actions** and enter

- Organization or user: `ringee-io`
- Repository: `ringee-app`
- Workflow filename: `npm-publish.yml`
- Environment name: `npm`
- Allowed actions: **`npm publish`**. A configuration created since 2026-09-03
  allows only `npm stage publish` (each release waits for a maintainer's 2FA
  approval) unless this is checked, and the workflow runs `npm publish`.

The same from a terminal logged in to npm with 2FA:

```bash
npm trust github <package> --file npm-publish.yml --repo ringee-io/ringee-app --env npm --allow-publish
```

A new configuration expires unless it completes a publish within 2 days, and an
expired one can only be deleted and created again. Set a package up when a
version bump for it is about to merge, not ahead of time.

In GitHub, **Settings → Environments → `npm` → Deployment branches and tags**,
allow `main` only, so a workflow started from another branch cannot publish.
After the first publish through the workflow, set the package's **Settings →
Publishing access** to "Require two-factor authentication and disallow tokens";
trusted publishing is not affected.

Renaming the workflow file or the environment breaks publishing until the
trusted publisher is updated to match.

## Adding a package

Add its directory to the plan command in the workflow, and its `package.json`
to the plan job's sparse checkout. Publish its first version by hand — trusted
publishing cannot create a package — then configure its trusted publisher.
