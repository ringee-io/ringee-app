import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Promotion and the rollout gate share this release manifest. The backfill
// requires draining old dialer writers before starting the deployment.
export const REQUIRED_MIGRATIONS = [
  "20261121120000_dialer_assignment_fences",
  "20261121121000_backfill_dialer_assignment_fences",
  "20261123043000_call_attempt_reservation_identity",
  "20261123120000_dialer_stream_callback_fences",
];

export const REQUIRED_COLUMNS = [
  ["AgentSession", "reservedAt", "timestamp without time zone"],
  ["CallAttempt", "sessionStartedAt", "timestamp without time zone"],
  ["CallAttempt", "sessionReservedAt", "timestamp without time zone"],
  ["AgentSession", "eventStreamId", "uuid"],
  ["CallbackTask", "creationKey", "text"],
];
export async function stageRequiredMigrations(sourcePrisma, deployedPrisma) {
  for (const migration of REQUIRED_MIGRATIONS) {
    const destination = join(deployedPrisma, "migrations", migration);
    await mkdir(destination, { recursive: true });
    await cp(
      join(sourcePrisma, "migrations-pending", migration, "migration.sql"),
      join(destination, "migration.sql"),
    );
  }
}
