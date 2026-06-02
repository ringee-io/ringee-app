/**
 * Tiny zero-dependency terminal styling + formatting helpers.
 * Honors NO_COLOR and non-TTY output.
 */
const enabled =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const wrap = (open: number, close: number) => (s: string) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

export const icon = {
  ok: c.green("✓"),
  err: c.red("✗"),
  warn: c.yellow("!"),
  info: c.cyan("›"),
  bullet: c.gray("•"),
  arrow: c.gray("→"),
};

export function heading(text: string): void {
  process.stdout.write(`\n${c.bold(text)}\n`);
}

export function line(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function ok(text: string): void {
  line(`${icon.ok} ${text}`);
}

export function info(text: string): void {
  line(`${icon.info} ${c.dim(text)}`);
}

export function warn(text: string): void {
  line(`${icon.warn} ${c.yellow(text)}`);
}

export function fail(text: string): void {
  process.stderr.write(`${icon.err} ${c.red(text)}\n`);
}

export function kv(key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  line(`  ${c.gray(key.padEnd(14))} ${formatValue(value)}`);
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? c.green("yes") : c.gray("no");
  }
  return String(value);
}

/** Sensitivity tag, color-coded, for previews of risky actions. */
export function sensitivityTag(
  level: "read" | "write" | "sensitive" | "destructive",
): string {
  switch (level) {
    case "read":
      return c.gray("[read]");
    case "write":
      return c.blue("[write]");
    case "sensitive":
      return c.yellow("[sensitive]");
    case "destructive":
      return c.red("[destructive]");
  }
}

export function json(value: unknown): void {
  line(JSON.stringify(value, null, 2));
}

/** Resolve the global --json flag set on the root command. */
export function wantsJson(): boolean {
  return process.argv.includes("--json");
}
