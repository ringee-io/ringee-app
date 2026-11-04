import { createClient } from "@keyv/redis";
import { Logger } from "@nestjs/common";

const defaultLogger = new Logger("RedisClient");

/** The part of a Nest logger this module writes to. */
export interface RedisClientLogger {
  error(message: string): void;
}

/**
 * Create and connect the process-wide Redis client.
 *
 * node-redis reports a dropped connection as an `error` event, and Node turns
 * an `error` event nobody listens to into an uncaught exception. Without the
 * listener below, a Redis restart, failover or maintenance window kills every
 * API and worker process at once instead of letting the client reconnect.
 */
export async function connectRedisClient(
  url: string | undefined,
  logger: RedisClientLogger = defaultLogger,
) {
  const client = createClient({ url });
  client.on("error", (error: unknown) => {
    logger.error(
      `Redis connection error (reconnecting): ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  await client.connect();
  return client;
}
