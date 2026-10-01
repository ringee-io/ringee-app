import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RingeeAccount, StoredRingeeCredentials } from "@ringee-io/agent";

/** What `ringee login` writes to disk. */
export interface SavedLogin extends StoredRingeeCredentials {
  backendUrl: string;
  keyPrefix: string;
  account?: RingeeAccount;
  savedAt: string;
}

/**
 * `$RINGEE_CONFIG_DIR`, else the platform's config dir:
 * `%APPDATA%\ringee` on Windows, `$XDG_CONFIG_HOME/ringee` or
 * `~/.config/ringee` elsewhere.
 */
export function configDir(): string {
  if (process.env.RINGEE_CONFIG_DIR) return process.env.RINGEE_CONFIG_DIR;
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "ringee");
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "ringee");
}

export function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

/** Home-relative path for display (`~/.config/ringee/credentials.json`). */
export function displayPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function readSavedLogin(): SavedLogin | null {
  try {
    const data = JSON.parse(readFileSync(credentialsPath(), "utf8"));
    return data && typeof data.apiKey === "string"
      ? (data as SavedLogin)
      : null;
  } catch {
    return null;
  }
}

/** Written owner-only (0600 file in a 0700 dir): the key is a secret. */
export function writeSavedLogin(login: SavedLogin): string {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = credentialsPath();
  writeFileSync(path, `${JSON.stringify(login, null, 2)}\n`, { mode: 0o600 });
  // `mode` only applies when the file is created; tighten an existing one.
  try {
    chmodSync(path, 0o600);
  } catch {
    /* not supported on this filesystem */
  }
  return path;
}

export function deleteSavedLogin(): boolean {
  try {
    rmSync(credentialsPath());
    return true;
  } catch {
    return false;
  }
}
