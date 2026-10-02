import { spawn } from "node:child_process";

/**
 * Whether opening a browser here would reach the person at the keyboard.
 * Over SSH, in CI or a headless Linux box it would not — print the URL instead.
 */
export function canOpenBrowser(): boolean {
  const env = process.env;
  if (env.RINGEE_NO_BROWSER || env.CI) return false;
  if (env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT) return false;
  if (!process.stdout.isTTY) return false;
  if (process.platform === "linux") {
    return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY || env.BROWSER);
  }
  return true;
}

/**
 * The URL comes from the backend. Only http(s) reaches the OS opener, which
 * would just as readily launch a `file:` URL, an app or an option-like value.
 */
function webUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Best effort: resolves false instead of throwing when nothing opened. */
export function openBrowser(url: string): Promise<boolean> {
  const target = webUrl(url);
  if (!target) return Promise.resolve(false);
  // No shell on any platform: on Windows, rundll32 opens the URL without
  // cmd.exe re-parsing `&`, `|` or `^` inside it.
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [target]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", target]]
        : [process.env.BROWSER || "xdg-open", [target]];

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
