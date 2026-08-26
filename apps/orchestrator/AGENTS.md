# apps/orchestrator — Temporal worker rules

Runs the Temporal Worker: event-driven workflows started by the backend, plus the
periodic Schedules (drains, retry/callback/reminder pollers). Activities delegate
to `@ringee/services` through a NestJS application context.

## The three files, and what each may import

| File | Runs in | Import rule |
|---|---|---|
| `src/temporal/workflows.ts` | Temporal's deterministic V8 sandbox | `@temporalio/workflow` only. Everything else **type-only** — enforced by ESLint `ARCH-004`. |
| `src/temporal/activities.ts` | Normal Node | Anything. This is where real work belongs. |
| `packages/platform/src/temporal/contracts.ts` | Both | **Zero imports**, ever. |

A runtime import in `workflows.ts` breaks the worker at startup, not at review
time. Workflow code must also be deterministic: no `Date.now()`, no `Math.random()`,
no direct I/O.

## Adding a workflow

1. Add the name to `WORKFLOW_NAMES` in `contracts.ts`, plus its input interface.
2. Export a function from `workflows.ts` whose **name matches the value exactly** —
   `main.ts` asserts this on boot.
3. Implement the work as an activity in `activities.ts`, delegating to a service.
4. Start it from the backend via `OrchestratorService`, never by importing the
   workflow function.

## Schedules

`src/temporal/schedules.ts` owns every periodic job. Cadence is a cost decision,
not a detail: on a self-hosted cluster each tick writes workflow history, so the
drains deliberately run at 60s instead of the 5s of the old `setInterval`
pollers. Read the comment above `SCHEDULES` before tightening any interval.

Schedules use the SKIP overlap policy plus a catch-up window — that is what
replaces in-flight guards and makes missed ticks recover after downtime. Every
scheduled workflow must therefore be safe to run twice.

## Retries

`proxyActivities` retry policies are chosen per class of work (recording,
transcription, periodic, intelligence, bulk). An activity that can be retried
must be idempotent — credits, calls and outbound webhooks especially. Pick the
existing proxy that matches your workload instead of adding a new one.

## Not here

The dialer poll loop is deliberately **not** in this process; it runs in the
backend because lead assignment is pushed over in-process SSE. See
`DialerOrchestrationService.startPolling()`.
