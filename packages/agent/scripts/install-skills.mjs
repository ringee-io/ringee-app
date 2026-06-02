#!/usr/bin/env node
/**
 * Copy the Ringee Claude Skills into a target `.claude/skills` directory.
 *
 *   node packages/agent/scripts/install-skills.mjs            # -> ./.claude/skills
 *   node packages/agent/scripts/install-skills.mjs ~/myproj   # -> ~/myproj/.claude/skills
 *   RINGEE_SKILLS_TARGET=~/.claude node .../install-skills.mjs # -> ~/.claude/skills
 *
 * Skills create `/skill-name` slash commands in Claude Code AND on claude.ai
 * (where you upload them — see `package-skills.mjs`). Dependency-free so it can
 * run via `npx`/`pnpm dlx`.
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
    ? process.env.RINGEE_SKILLS_TARGET
    : join(arg ? resolve(arg) : process.cwd(), ".claude"),
);

const from = join(packageRoot, "skills");
const to = join(targetBase, "skills");

if (!existsSync(from)) {
  console.error(`! missing skills directory: ${from}`);
  process.exit(1);
}
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`✓ ${from}  ->  ${to}`);
console.log("Restart Claude Code (or reload skills) to pick them up.");
