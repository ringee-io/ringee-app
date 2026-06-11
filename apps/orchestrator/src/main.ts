import "dotenv/config";
import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NativeConnection, Worker } from "@temporalio/worker";
import { apiConfiguration } from "@ringee/configuration";
import { TemporalClientService, WORKFLOW_NAMES } from "@ringee/platform";
import { OrchestratorModule } from "./orchestrator.module";
import { createActivities } from "./temporal/activities";
import { ensureSchedules } from "./temporal/schedules";
// Safe to import here: main.ts is NOT part of the deterministic workflow
// bundle — only workflowsPath below is.
import * as workflows from "./temporal/workflows";

const logger = new Logger("Orchestrator");

/** Fail fast if contracts.ts and workflows.ts ever drift apart. */
function assertWorkflowsMatchContracts() {
  for (const name of Object.values(WORKFLOW_NAMES)) {
    if (typeof (workflows as Record<string, unknown>)[name] !== "function") {
      throw new Error(
        `Workflow "${name}" is declared in WORKFLOW_NAMES (contracts.ts) but not exported from workflows.ts`,
      );
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(OrchestratorModule);
  app.enableShutdownHooks();

  assertWorkflowsMatchContracts();

  const taskQueue = apiConfiguration.TEMPORAL_TASK_QUEUE;
  const connection = await NativeConnection.connect({
    address: apiConfiguration.TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    namespace: apiConfiguration.TEMPORAL_NAMESPACE,
    taskQueue,
    workflowsPath: require.resolve("./temporal/workflows"),
    activities: createActivities(app),
    shutdownGraceTime: "30s",
  });

  // Converge the periodic schedules (replaces the old setInterval pollers).
  const client = await app.get(TemporalClientService).getClient();
  await ensureSchedules(client, taskQueue);

  // The Temporal SDK runtime already traps SIGINT/SIGTERM and starts a
  // graceful shutdown; this handler just logs and is a no-op if the worker is
  // already draining/stopped.
  const shutdown = (signal: string) => {
    logger.log(`${signal} received — shutting down Temporal worker...`);
    try {
      worker.shutdown();
    } catch {
      // Already shutting down (the SDK's own signal handler got there first).
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.log(
    `Temporal worker polling task queue "${taskQueue}" at ${apiConfiguration.TEMPORAL_ADDRESS} (namespace: ${apiConfiguration.TEMPORAL_NAMESPACE})`,
  );

  try {
    // Resolves once shutdown() drains in-flight activities.
    await worker.run();
  } finally {
    await connection.close();
    await app.close();
  }

  logger.log("Orchestrator stopped");
}

bootstrap().catch((err) => {
  logger.error("Orchestrator failed to start", err);
  process.exit(1);
});
