#!/usr/bin/env node
/**
 * Package each Ringee skill as a .zip ready to upload to claude.ai
 * (Settings → Customize → Skills → Upload skill). Each zip contains the skill
 * folder at its root (with SKILL.md inside), as claude.ai requires.
 *
 *   node packages/agent/scripts/package-skills.mjs   # -> packages/agent/dist/skills/*.zip
 *
 * Uses the system `zip` (present on macOS/Linux). Dependency-free.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(packageRoot, "skills");
const outDir = join(packageRoot, "dist", "skills");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const skills = readdirSync(skillsDir).filter((name) =>
  statSync(join(skillsDir, name)).isDirectory(),
);

for (const name of skills) {
  const zipPath = join(outDir, `${name}.zip`);
  // Zip the folder itself (so it sits at the archive root) by running from skillsDir.
  execFileSync("zip", ["-r", "-q", zipPath, name], { cwd: skillsDir });
  console.log(`✓ ${name}.zip`);
}

console.log(`\n${skills.length} skill zip(s) → ${outDir}`);
console.log("Upload each at claude.ai → Settings → Customize → Skills → Upload skill.");
