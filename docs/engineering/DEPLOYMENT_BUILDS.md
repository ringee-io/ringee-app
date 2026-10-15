# Service deployment builds

The API and Temporal worker use the service Dockerfiles with the repository root
as their build context. Each image contains the app's compiled output, production
dependencies and Prisma runtime assets. TypeScript already compiles shared source
into each app's `dist`; building the shared packages separately repeats that work.

The Dockerfiles copy the app manifest, the four shared package manifests, root
dependency configuration and Prisma schema before installing dependencies:

```bash
pnpm --filter backend... install --frozen-lockfile --prefer-offline
pnpm --filter @ringee/orchestrator... install --frozen-lockfile --prefer-offline
```

Each command belongs to its respective service's Dockerfile. This separates
dependency installation from application source in the Docker cache, so source
changes reuse that layer. Prisma schema changes invalidate the layer because
installation generates the Prisma client. `pnpm fetch` is deliberately omitted:
the repository's pnpm version fetched the entire lockfile even with a service
filter.

The build then compiles only the app. Before `pnpm deploy --prod`, it removes only
`@ringee/database`'s `scripts.postinstall` from the manifest inside the build image:
the client has already been generated, and pnpm treats the deployed workspace as
a file dependency whose postinstall would otherwise be blocked. This leaves the
repository manifest and the existing dependency build permissions unchanged.

`scripts/prepare-service-runtime.mjs` adds the compiled output and copies the
builder's generated Prisma client and Linux engine into every deployed Prisma
client installation. Compiled workspace imports continue resolving through the
app's `node_modules`. Package-local links beneath `dist/packages` can load
different identities of `@nestjs/core` and break Nest dependency injection.

Prisma's CLI is a production dependency of `@ringee/database` because the API's
Docker Compose startup runs migrations. The helper prepares its schema,
migrations and CLI dependency link under `/app/packages/database`, outside
`dist`. The final image excludes the frontend, unrelated apps, TypeScript build
tools and the monorepo's development dependencies.

Both stages use Node 22 on Debian Bookworm slim with OpenSSL and CA certificates.
The Temporal worker needs glibc; using the same Linux base for building and
running also preserves compatibility with Prisma's generated engine and other
native dependencies.

## Railway activation

Upload or merge the Dockerfile changes before activating them in Railway. For
each existing service, open Settings and configure:

| Setting         | Api                                            | Orchestrator                                             |
| --------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Root Directory  | `/`                                            | `/`                                                      |
| Builder         | Dockerfile                                     | Dockerfile                                               |
| Dockerfile Path | `apps/backend/Dockerfile.compose`              | `apps/orchestrator/Dockerfile.compose`                   |
| Build Command   | Empty; the Dockerfile owns compilation         | Empty; the Dockerfile owns compilation                   |
| Start Command   | `node apps/backend/dist/apps/backend/src/main` | `node apps/orchestrator/dist/apps/orchestrator/src/main` |

Set the custom Dockerfile path in the service's Variables as
`RAILWAY_DOCKERFILE_PATH=apps/backend/Dockerfile.compose` for Api or
`RAILWAY_DOCKERFILE_PATH=apps/orchestrator/Dockerfile.compose` for Orchestrator.

Keep the root at `/`: both services need shared packages and the root lockfile. A
Dockerfile named `Dockerfile.compose` is not selected automatically. Preserve the
current Node start command and verify the next deployment's effective builder
and Dockerfile path before comparing timings.

Set Watch Paths to the following shared patterns plus `/apps/backend/**` for Api
or `/apps/orchestrator/**` for Orchestrator:

```text
/packages/services/**
/packages/platform/**
/packages/database/**
/packages/configuration/**
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
/.npmrc
/tsconfig*.json
/.dockerignore
/scripts/prepare-service-runtime.mjs
```

Frontend-only source changes therefore do not rebuild either backend service;
changes to the shared lockfile still do.

Railway's start commands invoke Node directly, preserving the existing Railpack
startup. The API start command overrides its Docker Compose command, which runs
Prisma migrations first. Compose invokes the installed CLI directly:

```bash
node packages/database/node_modules/prisma/build/index.js migrate deploy --schema packages/database/prisma/schema.prisma
```

The Dockerfile then uses `exec node` to start the API. This preserves the effect
of `db:deploy` while avoiding a Corepack or pnpm download at startup as the `node`
user. Do not add migration pre-deploy commands to Railway as part of this build
optimization; preserve the project's existing migration process.

These settings use the existing Railway services; no new infrastructure
configuration is required. See [Dockerfile builds](https://docs.railway.com/builds/dockerfiles)
and [shared monorepos](https://docs.railway.com/deployments/monorepo).

## Validation and measurement

Build each image from the repository root:

```bash
docker build --platform linux/amd64 -f apps/backend/Dockerfile.compose -t ringee-backend:build-check .
docker build --platform linux/amd64 -f apps/orchestrator/Dockerfile.compose -t ringee-orchestrator:build-check .
```

Measure a cold build and a second build after changing only app source. Record
dependency install, app build, runtime copy, image export, push, deployment
startup and total elapsed time separately. Confirm the second build reuses its
dependency layer, inspect the final image size, and verify that Prisma and native
dependencies load from the packaged runtime.

The old Railway logs showed a 14m08s API build and a 17m52s worker build. Compilation
took 33s and 2m38s respectively; copying dependencies took 3m52s and 4m18s, and
exporting the images took another 3m11s and 3m41s. A later API deployment reused
dependency installation, compiled in 1m07s, then spent 8m15s copying `node_modules`
after an approximately ten-minute gap in the logs.

pnpm's dependency cache helps installation. Smaller runtime images also reduce
copying, exporting and transferring the result, which remain necessary even when
installation is cached. Five minutes is a useful target for warm deployments,
but it must be measured after activation: Railway's queueing, image export,
registry transfer and provisioning can affect elapsed time independently of
TypeScript compilation.

## Local verification

Both production images built successfully for Linux amd64. On the Mac's Docker
image listing, the older images occupied 3.44 GB each; the optimized API occupied
1.06 GB and the worker 1.39 GB. The application runtime directories themselves
occupied 567 MiB and 806 MiB respectively.

With the dependency layer cached, forcing compilation and packaging again took
4m11s for the API and 4m38s for the worker. The two builds ran concurrently under
amd64 emulation on an arm64 Mac. This measures local image construction; it does
not include Railway queueing, registry transfer or provisioning. The first
Railway deployment remains the measurement for the end-to-end target.

Checks ran with container networking disabled: all 2,753 literal imports in 683
API JavaScript files and 2,187 imports in 553 worker files resolved; Prisma clients,
Linux query engines and bcrypt loaded; Nest dependency tokens retained the same
identity; the Prisma CLI started; and Temporal's worker loaded and bundled its
workflows successfully. Neither image includes the Nest CLI or Next.js.
