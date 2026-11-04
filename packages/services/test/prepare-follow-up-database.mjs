import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

// Test-only bootstrap, never a production migration runner. Start with an empty
// local database; derive the preceding schema and apply the real Stage 1/2 SQL.
const url = new URL(process.env.FOLLOWUP_DATABASE_URL);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/ringee_followup_test"
) {
  throw new Error("Use an empty local ringee_followup_test database");
}
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
};
function run(command, args, input) {
  const result = spawnSync(command, args, { env, input, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}
const sql = (input) =>
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At"], input);
if (
  sql("SELECT count(*) FROM pg_tables WHERE schemaname = 'public';").trim() !==
  "0"
) {
  throw new Error("The test database must be empty");
}
const root = resolve(import.meta.dirname, "../../..");
const prismaDir = join(root, "packages/database/prisma");
const read = (path) => readFileSync(join(prismaDir, path), "utf8");
let schema = read("schema.prisma");
for (const name of [
  "PendingActionFollowUp",
  "PendingActionFollowUpEvent",
  "FollowUpState",
  "FollowUpExecutionMode",
  "FollowUpClosureReason",
]) {
  const block = new RegExp(`(?:model|enum) ${name} \\{[^}]*\\}`, "g");
  if (!block.test(schema)) throw new Error(`Missing schema block ${name}`);
  schema = schema.replace(block, "");
}
schema = schema.replace(/^.*\bPendingActionFollowUp\??\s*.*$/gm, "");
for (const [model, fields] of [
  ["Call", ["outcomeRevision", "outcomeCommitment"]],
  [
    "CallbackTask",
    ["followUpId", "sourceRevision", "objectiveAttempt", "dispatchCommittedAt"],
  ],
]) {
  schema = schema.replace(new RegExp(`model ${model} \\{[^}]*\\}`), (block) =>
    block
      .split("\n")
      .filter(
        (line) =>
          !fields.some((field) => new RegExp(`\\b${field}\\b`).test(line)),
      )
      .join("\n"),
  );
}
schema = schema.replace(/enum CallbackAgentKind \{[^}]*\}/, (block) =>
  block.replace(/^\s*policy\s*$/m, ""),
);
const temp = mkdtempSync(join(tmpdir(), "ringee-followup-schema-"));
try {
  const baseline = join(temp, "schema.prisma");
  writeFileSync(baseline, schema);
  sql(
    run(process.execPath, [
      join(root, "packages/database/node_modules/prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      baseline,
      "--script",
    ]),
  );
  // db push / generated SQL cannot express these partial unique indexes.
  const dnc = read(
    "migrations-pending/20260513000100_dnc_freelancer/migration.sql",
  ).match(/CREATE UNIQUE INDEX[^;]+;/g);
  if (dnc?.length !== 2) throw new Error("DNC prerequisites changed");
  sql(dnc.join("\n"));
  for (const path of [
    "migrations-pending/20261103120000_follow_up_objectives/migration.sql",
    "pending-migrations/20261103120100_follow_up_objectives_callback_indexes.sql",
    "migrations-pending/20261103140000_human_outcome_follow_up/migration.sql",
  ])
    sql(read(path));
  console.log(
    "Disposable follow-up database prepared, including lifecycle checks and DNC indexes.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
