#!/usr/bin/env node
/**
 * Copy the Ringee Claude Skills and slash commands into a target `.claude`
 * directory. This powers an "install skills" workflow such as:
 *
 *   node packages/agent/scripts/install-skills.mjs            # -> ./.claude
 *   node packages/agent/scripts/install-skills.mjs ~/myproj   # -> ~/myproj/.claude
 *   RINGEE_SKILLS_TARGET=~/.claude node .../install-skills.mjs # -> ~/.claude
 *
 * It is intentionally dependency-free so it can run via `npx`/`pnpm dlx` once
 * `@ringee-io/agent` is published, e.g. `npx skills add ringee-io/ringee-agent`
 * style tooling can shell out to it.
 */
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const arg = process.argv[2];
const targetBase = resolve(
  process.env.RINGEE_SKILLS_TARGET
    ? // explicit .claude dir
      process.env.RINGEE_SKILLS_TARGET
    : join(arg ? resolve(arg) : process.cwd(), ".claude"),
);

const jobs = [
  { from: join(packageRoot, "skills"), to: join(targetBase, "skills") },
  { from: join(packageRoot, "commands"), to: join(targetBase, "commands") },
];

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    console.warn(`! skipped (missing): ${from}`);
    continue;
  }
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`✓ ${from}  ->  ${to}`);
}

console.log(`\nRingee skills + commands installed into ${targetBase}`);
console.log("Restart Claude Code (or reload skills) to pick them up.");
