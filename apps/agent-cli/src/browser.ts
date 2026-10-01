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

/** Best effort: resolves false instead of throwing when nothing opened. */
export function openBrowser(url: string): Promise<boolean> {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', url.replace(/&/g, "^&")]]
        : [process.env.BROWSER || "xdg-open", [url]];

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
