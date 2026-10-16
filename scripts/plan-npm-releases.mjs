// Lists the packages whose package.json version is not on npm yet — the ones
// `.github/workflows/npm-publish.yml` publishes. Comparing against the registry
// rather than the previous commit keeps releases idempotent: a version bump
// merged to main publishes once, a re-run publishes nothing, and a publish that
// failed is retried by the next run.
//
//   node scripts/plan-npm-releases.mjs packages/dialer-sdk apps/agent-cli
//
// In GitHub Actions the plan is also written to $GITHUB_OUTPUT as `packages`,
// the JSON the publish job uses as its matrix.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REGISTRY = "https://registry.npmjs.org";

const directories = process.argv.slice(2);
if (directories.length === 0) {
  throw new Error(
    "Usage: node scripts/plan-npm-releases.mjs <package directory>...",
  );
}

const report = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);
  }
};

const releases = [];
for (const directory of directories) {
  const manifest = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  );
  if (manifest.private) {
    throw new Error(`${directory} is private and cannot be published`);
  }
  const { name, version } = manifest;

  // `write=true` is what npm itself sends before a publish: it skips the CDN
  // cache, so a version published a minute ago already counts.
  const response = await fetch(
    `${REGISTRY}/${encodeURIComponent(name)}?write=true`,
  );
  // Trusted publishing cannot create a package: a new one needs its first
  // version published by hand before it can be released from here.
  if (!response.ok) {
    throw new Error(`${name}: the registry answered ${response.status}`);
  }
  const { versions } = await response.json();

  if (Object.hasOwn(versions, version)) {
    report(`\`${name}@${version}\` is already on npm — nothing to publish.`);
    continue;
  }

  // npm refuses a prerelease without an explicit dist-tag. A stable version
  // keeps npm's default `latest`, which npm also refuses to move backwards.
  const tag = version.split("+")[0].includes("-") ? "next" : "";
  // A file-name-safe form of the name, for the build artifact.
  const slug = name.replace(/^@/, "").replaceAll("/", "-");
  releases.push({ directory, name, version, tag, slug });
  report(
    `\`${name}@${version}\` is not on npm yet — it will be published` +
      (tag ? ` under the \`${tag}\` tag.` : "."),
  );
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `packages=${JSON.stringify(releases)}\n`,
  );
}
