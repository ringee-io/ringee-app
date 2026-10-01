import { hostname, platform, release, arch } from "node:os";
import { Command } from "commander";
import {
  AGENT_VERSION,
  DEFAULT_BACKEND_URL,
  RingeeAccount,
  RingeeAuthClient,
  RingeeAuthError,
  normalizeBackendUrl,
} from "@ringee-io/agent";
import { canOpenBrowser, openBrowser } from "../browser.js";
import { CLI_USER_AGENT, getClient, resolveConfig, run } from "../client.js";
import {
  credentialsPath,
  deleteSavedLogin,
  displayPath,
  readSavedLogin,
  writeSavedLogin,
} from "../credentials.js";
import {
  c,
  fail,
  heading,
  icon,
  json,
  kv,
  line,
  ok,
  spinner,
  wantsJson,
  warn,
} from "../ui.js";

const KEY_PATTERN = /^ringee_sk_[0-9a-f]{64}$/;

/** `ringee_sk_a1b2c3d4…` — enough to recognize a key, never enough to use it. */
export function maskKey(key: string): string {
  return key.startsWith("ringee_sk_") ? `${key.slice(0, 18)}…` : "set (hidden)";
}

/** Login targets the same backend the rest of the CLI would use. */
function backendUrl(opts: { backendUrl?: string }): string {
  return normalizeBackendUrl(
    opts.backendUrl || process.env.RINGEE_BACKEND_URL || DEFAULT_BACKEND_URL,
  );
}

/** Env vars that would override a saved login (see resolveConfig). */
function overridingEnv(): string | null {
  if (process.env.RINGEE_MCP_URL) return "RINGEE_MCP_URL";
  if (process.env.RINGEE_BACKEND_URL && process.env.RINGEE_USER_ID) {
    return "RINGEE_USER_ID";
  }
  if (process.env.RINGEE_API_KEY) return "RINGEE_API_KEY";
  return null;
}

/** Human output goes to stderr under --json so stdout stays parseable. */
function say(text = ""): void {
  if (wantsJson()) process.stderr.write(`${text}\n`);
  else line(text);
}

function describeWorkspace(account: RingeeAccount): string {
  const w = account.workspace;
  return w.type === "personal"
    ? "Personal"
    : `${w.name} ${c.gray("(organization)")}`;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", reject);
  });
}

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description("Authorize this terminal in your browser and save an API key")
    .option(
      "--with-token",
      "read an API key from stdin instead of using the browser (CI, scripts)",
    )
    .option("--no-browser", "print the login URL instead of opening it")
    .option(
      "--backend-url <url>",
      `Ringee API origin (default: $RINGEE_BACKEND_URL or ${DEFAULT_BACKEND_URL})`,
    )
    .addHelpText(
      "after",
      `\nExamples:\n` +
        `  ${c.dim("ringee login")}\n` +
        `  ${c.dim("ringee login --no-browser          # over SSH: open the URL on any device")}\n` +
        `  ${c.dim("echo $RINGEE_KEY | ringee login --with-token")}`,
    )
    .action((opts) =>
      run(async () => {
        const base = backendUrl(opts);
        const auth = new RingeeAuthClient(base, CLI_USER_AGENT);
        const previous = readSavedLogin();

        let apiKey: string;
        let account: RingeeAccount;
        let keyPrefix: string;

        if (opts.withToken) {
          if (process.stdin.isTTY) {
            throw new Error(
              "--with-token reads the key from stdin: echo $RINGEE_KEY | ringee login --with-token",
            );
          }
          apiKey = await readStdin();
          if (!KEY_PATTERN.test(apiKey)) {
            throw new Error(
              "That does not look like a Ringee API key (ringee_sk_…). Create one in Settings → Connectors.",
            );
          }
          const who = await auth.whoami(apiKey);
          account = who;
          keyPrefix = who.key.prefix;
        } else {
          const result = await browserLogin(auth, opts.browser !== false);
          apiKey = result.apiKey;
          account = result;
          keyPrefix = result.keyPrefix;
        }

        const path = writeSavedLogin({
          apiKey,
          backendUrl: base,
          keyPrefix,
          account,
          savedAt: new Date().toISOString(),
        });

        // A re-login replaces the old key; revoke it so it does not linger.
        if (previous && previous.apiKey !== apiKey) {
          await new RingeeAuthClient(
            previous.backendUrl || base,
            CLI_USER_AGENT,
          )
            .logout(previous.apiKey)
            .catch(() => undefined);
        }

        if (wantsJson()) {
          json({ ...account, keyPrefix, credentialsPath: path });
        } else {
          line("");
          ok(
            `Logged in as ${c.bold(account.user.email ?? account.user.name ?? "your account")}`,
          );
          kv("workspace", describeWorkspace(account));
          kv(
            "api key",
            `${keyPrefix}… ${c.gray(`saved to ${displayPath(path)}`)}`,
          );
          line("");
          line(
            `${c.dim("Next:")} ringee contacts search acme   ${c.dim("·")}   ringee workspace list`,
          );
        }

        const env = overridingEnv();
        if (env) {
          say("");
          warn(
            `${env} is set in your environment and takes precedence over this login. Unset it to use the saved credentials.`,
          );
        }
      }),
    );

  program
    .command("logout")
    .description("Revoke this terminal's API key and delete the saved login")
    .action(() =>
      run(async () => {
        const saved = readSavedLogin();
        if (!saved) {
          if (wantsJson()) return json({ loggedOut: false });
          warn("You're not logged in on this terminal.");
          const env = overridingEnv();
          if (env)
            say(
              c.dim(
                `  (${env} is set in your environment — unset it to disconnect.)`,
              ),
            );
          return;
        }

        let revoked = true;
        try {
          await new RingeeAuthClient(
            saved.backendUrl || DEFAULT_BACKEND_URL,
            CLI_USER_AGENT,
          ).logout(saved.apiKey);
        } catch (err) {
          // Already revoked elsewhere is still a successful logout.
          revoked = err instanceof RingeeAuthError && err.status === 401;
        }
        deleteSavedLogin();

        if (wantsJson()) return json({ loggedOut: true, revoked });
        ok("Logged out. Removed the saved login from this terminal.");
        if (!revoked) {
          warn(
            "Could not reach Ringee to revoke the key. Revoke it in Settings → Connectors → API keys.",
          );
        }
      }),
    );

  program
    .command("whoami")
    .description(
      "Show the account, workspace and credential this terminal uses",
    )
    .action(() =>
      run(async () => {
        const cfg = resolveConfig();
        if (!cfg.apiKey || cfg.source === "env:RINGEE_USER_ID") {
          // Legacy capability URL: there is no key to ask the server about.
          if (wantsJson()) {
            return json({
              auth: "legacy-url",
              mcpUrl: cfg.mcpUrl,
              userId: cfg.userId ?? null,
            });
          }
          heading("Ringee connection");
          kv("auth", "legacy MCP URL (no API key)");
          kv("source", cfg.source);
          kv("userId", cfg.userId);
          line("");
          line(
            c.dim("Run `ringee login` to switch to API-key authentication."),
          );
          return;
        }

        const who = await new RingeeAuthClient(
          cfg.backendUrl || new URL(cfg.mcpUrl).origin,
          CLI_USER_AGENT,
        ).whoami(cfg.apiKey);
        if (wantsJson()) return json({ ...who, source: cfg.source });

        heading(who.user.email ?? who.user.name ?? "Ringee account");
        kv("name", who.user.name);
        kv("workspace", describeWorkspace(who));
        kv("api key", `${who.key.prefix}… ${c.gray(`(${who.key.name})`)}`);
        kv(
          "source",
          cfg.source === "login" ? displayPath(credentialsPath()) : cfg.source,
        );
      }),
    );

  const workspace = program
    .command("workspace")
    .description("List or switch the workspace (Personal or an organization)");

  workspace
    .command("list", { isDefault: true })
    .description("List your workspaces; the active one is marked")
    .action(() =>
      run(async () => {
        const res = await getClient().listWorkspaces();
        if (wantsJson()) return json(res);
        heading("Workspaces");
        res.workspaces.forEach((w) => {
          const marker = w.active ? icon.ok : " ";
          const label = w.active ? c.bold(w.name) : w.name;
          const role = w.role ? c.gray(` ${w.role.replace(/^org:/, "")}`) : "";
          line(`${marker} ${label}${role}  ${c.gray(w.id)}`);
        });
        line("");
        line(c.dim("Switch with: ringee workspace use <id|name|personal>"));
      }),
    );

  workspace
    .command("use <workspace>")
    .description("Switch to 'personal', an organization id or its exact name")
    .action((target: string) =>
      run(async () => {
        const res = await getClient().switchWorkspace({ workspaceId: target });
        if (wantsJson()) return json(res);
        const active = res.workspaces.find((w) => w.active);
        ok(`Now working in ${c.bold(active?.name ?? res.active)}.`);
      }),
    );
}

/**
 * The device flow, as the terminal sees it. UX choices (see docs/engineering/
 * SECURITY.md → "Agent API keys and CLI login"):
 *  - the one-time code is printed BEFORE the browser opens, so the user can
 *    compare it with the page (the defence against a phished code);
 *  - the browser opens by itself when it can reach the user; over SSH, CI or
 *    with --no-browser the URL is printed to open on any device;
 *  - one spinner line while waiting, Ctrl+C cancels cleanly.
 */
async function browserLogin(auth: RingeeAuthClient, allowBrowser: boolean) {
  const start = await auth.startDeviceLogin({
    deviceName: hostname(),
    platform: `${platform()} ${release()} ${arch()}`,
    clientVersion: `ringee-cli ${AGENT_VERSION}`,
  });

  const autoOpen = allowBrowser && canOpenBrowser();
  say("");
  say(c.bold("Log in to Ringee"));
  say("");
  say(`  Your one-time code:  ${c.bold(c.cyan(start.userCode))}`);
  say("");
  if (autoOpen) {
    say(`  Opening ${c.cyan(start.verificationUriComplete)}`);
    say(
      c.dim(
        "  Check that the browser shows the same code, then click Authorize.",
      ),
    );
  } else {
    say(`  Open this URL on any device and confirm the code:`);
    say(`  ${c.cyan(start.verificationUriComplete)}`);
  }
  say("");

  if (autoOpen && !(await openBrowser(start.verificationUriComplete))) {
    say(c.dim(`  Couldn't open a browser. Open the URL above yourself.`));
    say("");
  }

  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once("SIGINT", onSigint);
  const minutes = Math.round(start.expiresIn / 60);
  const spin = spinner(
    `Waiting for you to authorize this terminal… ${c.dim(`(code expires in ${minutes} min · Ctrl+C to cancel)`)}`,
  );
  try {
    return await auth.waitForDeviceLogin(start, controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      spin.stop();
      fail("Login cancelled.");
      process.exit(130);
    }
    throw err;
  } finally {
    spin.stop();
    process.removeListener("SIGINT", onSigint);
  }
}
