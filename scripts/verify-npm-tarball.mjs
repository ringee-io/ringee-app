// Installs a packed npm tarball into an empty project, the way a consumer
// would, and fails unless it works there. It is the last check in
// `.github/workflows/npm-publish.yml` before the tarball is published:
//
// - it installs from the public registry alone, so no `workspace:` protocol or
//   unpublished workspace package leaked into `dependencies`;
// - every file the manifest points at (`main`, `types`, `exports`, `bin`,
//   `unpkg`, …) is in the tarball;
// - every entry point in `exports` loads through `import`, and through
//   `require` where it offers one;
// - every binary prints the version being published for `--version`.
//
//   node scripts/verify-npm-tarball.mjs path/to/package.tgz
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [tarballArgument, ...extraArguments] = process.argv.slice(2);
if (!tarballArgument || extraArguments.length > 0) {
  throw new Error("Usage: node scripts/verify-npm-tarball.mjs <package.tgz>");
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const project = mkdtempSync(join(tmpdir(), "verify-npm-tarball-"));
const run = (command, args) =>
  execFileSync(command, args, { cwd: project, encoding: "utf8" }).trim();

try {
  writeFileSync(join(project, "package.json"), '{ "private": true }\n');
  execFileSync(
    "npm",
    [
      "install",
      resolve(tarballArgument),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: project, stdio: "inherit" },
  );

  const [name] = Object.keys(
    readJson(join(project, "package.json")).dependencies,
  );
  const root = join(project, "node_modules", name);
  const manifest = readJson(join(root, "package.json"));

  const referenced = new Set();
  const collect = (value) => {
    if (typeof value === "string") referenced.add(value);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };
  collect([
    manifest.main,
    manifest.module,
    manifest.types,
    manifest.typings,
    manifest.unpkg,
    manifest.jsdelivr,
    manifest.exports,
    manifest.bin,
  ]);
  const files = [...referenced].filter((file) => !file.includes("*"));
  const missing = files.filter((file) => !existsSync(join(root, file)));
  if (missing.length > 0) {
    throw new Error(
      `${name} points at files the tarball lacks: ${missing.join(", ")}`,
    );
  }

  const { exports } = manifest;
  const subpaths =
    exports && typeof exports === "object" && !Array.isArray(exports)
      ? Object.entries(exports).filter(([key]) => key.startsWith("."))
      : [];
  if (subpaths.length === 0 && (exports ?? manifest.main)) {
    subpaths.push([".", exports ?? manifest.main]);
  }
  let entryPoints = 0;
  for (const [subpath, target] of subpaths) {
    if (subpath.includes("*") || subpath.endsWith(".json")) continue;
    const specifier = JSON.stringify(
      subpath === "." ? name : `${name}/${subpath.slice(2)}`,
    );
    run("node", [
      "--input-type=module",
      "--eval",
      `await import(${specifier})`,
    ]);
    if (target && typeof target === "object" && "require" in target) {
      run("node", ["--eval", `require(${specifier})`]);
    }
    entryPoints += 1;
  }

  const bins =
    typeof manifest.bin === "string"
      ? { [name.split("/").pop()]: manifest.bin }
      : (manifest.bin ?? {});
  for (const bin of Object.keys(bins)) {
    const printed = run(join(project, "node_modules", ".bin", bin), [
      "--version",
    ]);
    if (printed !== manifest.version) {
      throw new Error(
        `\`${bin} --version\` prints "${printed}" but the package is ${manifest.version}`,
      );
    }
  }

  console.log(
    `${name}@${manifest.version} installs from npm: ${files.length} referenced files present, ` +
      `${entryPoints} entry points load, ${Object.keys(bins).length} binaries report the version.`,
  );
} finally {
  rmSync(project, { recursive: true, force: true });
}
