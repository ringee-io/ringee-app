# AGENTS.md

This file provides guidance to AI agents who are working on the code in this repository.

## Context

This repository contains an app built with the Attio App SDK.

### What is the App SDK?

The App SDK is a set of components and functionality to build apps that are embedded directly in the Attio CRM platform.

#### App SDK capabilities

- Use React to render components provided by the `attio/client` package.
- Run server-side code and make API calls to external services using `.server.ts` files.
- Store API tokens using the connections system.
- Receive incoming requests from third-party services via webhooks.
- Subscribe to events e.g. connection.added
- Manage form rendering, validation and submission with `useForm()`.
- Manage data fetching and async caching with `useAsyncCache()` and `useQuery()`.

## Architecture

### File and folder structure

| Path                      | Description                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.ts`              | The main entrypoint to the app                                                                                                                                                                                                                                                                                                                      |
| `src/attio`               | Code interacting with the [Attio API](https://docs.attio.com/rest-api/overview)                                                                                                                                                                                                                                                                     |
| `src/call-recording`      | Call recording text actions for [transcripts](https://docs.attio.com/sdk/entry-points/call-recording-transcript-text-selection-action), [call insights](https://docs.attio.com/sdk/entry-points/call-recording-insight-text-selection-action) and [summaries](https://docs.attio.com/sdk/entry-points/call-recording-summary-text-selection-action) |
| `src/components`          | React components                                                                                                                                                                                                                                                                                                                                    |
| `src/events`              | .event.ts files used to implement event handlers e.g. connection.added.event.ts                                                                                                                                                                                                                                                                     |
| `src/graphql`             | GraphQL queries for the [Attio GraphQL schema](https://docs.attio.com/sdk/graphql/graphql)                                                                                                                                                                                                                                                          |
| `src/record/actions`      | [Record actions](https://docs.attio.com/sdk/actions/record-action)                                                                                                                                                                                                                                                                                  |
| `src/record/bulk-actions` | [Bulk record actions](https://docs.attio.com/sdk/entry-points/bulk-record-action)                                                                                                                                                                                                                                                                   |
| `src/record/widgets`      | [Record widgets](https://docs.attio.com/sdk/entry-points/record-widget)                                                                                                                                                                                                                                                                             |
| `src/webhooks`            | .webhook.ts files used to implement webhook handlers                                                                                                                                                                                                                                                                                                |
| `src/utils`               | Shared utility functions                                                                                                                                                                                                                                                                                                                            |

## Environment

Code for the app may run either in a client-side or server-side context.

### Client-side code

Client-side code runs in the browser. However, it runs inside a safe sandbox, using a custom JS runtime. This means that:

- You MUST NOT render HTML tags directly e.g. `<div>Hello</div>`. Instead, you MUST only use components provided by the App SDK.
- You MUST NOT use custom styles or CSS. Only use the pre-styled components provided by the App SDK.
- You MUST NOT try to read the DOM directly.
- Some browser APIs may not be available.
- `fetch` calls are not allowed. You MUST NOT call `fetch` directly and should instead use `fetch` via server-side functions.

Files which render React components MUST use the `.tsx` extension.

### Server-side code

Server-side code runs in files ending in:

- `.server.ts`
- `.webhook.ts`
- `.event.ts`

Code that any of the above files import will also run in a server-side environment.

Server-side code DOES NOT run in Node.js but instead in a custom JS runtime. While many Node.js APIs are supported, some are not and you may need to factor this into your decision to use certain packages.

## Using the Attio App SDK

Attio provides three packages to help you build apps:

1. `attio/client` - for client-side imports
2. `attio/server` - for server-side imports
3. `attio` - for shared/environment-agnostic imports

IMPORTANT: Before importing from these packages, you MUST always check one of the following to confirm that your import is correct:

1. Existing examples in the codebase
2. TypeScript type definitions and JSDoc strings for the package
3. The Attio SDK documentation

If you are unsure about an import, always check explicitly and do not guess.

## Coding guidelines

- You SHOULD use Zod to validate data from public APIs.
- You SHOULD only include properties in Zod schemas that we explicitly need
- You SHOULD use try/catch around calls to .json()
- You SHOULD use console.error to capture information about unexpected errors.
- You MUST NOT log sensitive information such as email addresses or passwords.
- You MUST handle API errors gracefully. Do not throw an error within a React component, but instead return a clear fallback UI.
- You SHOULD prefer named arguments over positional arguments when using 3 or more arguments.
- You MUST NOT use `any` when typing your code. Type errors MUST be fixed properly as usage of `any` is a likely source of bugs.

## Validation

- You MUST validate all your changes using the commands provided in package.json.
- Validate types: `npm run build`
- Validate formatting: `npm run format:check`
- Run and fix lint rules: `npm run lint:fix`
