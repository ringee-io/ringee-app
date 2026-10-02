import { randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
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

/**
 * Create the config dir owner-only (0700), or check that an existing one can
 * hold a secret: not a symlink and, on POSIX, owned by this user and writable
 * by no one else. An unsafe dir is refused, never re-permissioned.
 */
export function ensureConfigDir(): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const unsafe = unsafeDirReason(dir);
  if (unsafe) {
    throw new Error(
      `Refusing to save credentials in ${displayPath(dir)}: ${unsafe}. Fix that, or point RINGEE_CONFIG_DIR at a private directory.`,
    );
  }
}

function unsafeDirReason(dir: string): string | null {
  const st = lstatSync(dir);
  if (st.isSymbolicLink()) return "it is a symlink";
  // POSIX only: Windows has no uid, and its mode bits do not reflect ACLs.
  const uid = process.getuid?.();
  if (uid === undefined) return null;
  if (st.uid !== uid) return "it belongs to another user";
  if (st.mode & 0o022) return "other users can write to it";
  return null;
}

/**
 * The key is a secret: it goes into a fresh 0600 file that is then renamed
 * over credentials.json, so it is never written through a symlink or into an
 * existing file, and a crash cannot leave half a file behind.
 */
export function writeSavedLogin(login: SavedLogin): string {
  ensureConfigDir();
  const path = credentialsPath();
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    // "wx" adds O_EXCL: fails instead of opening anything that already exists.
    writeFileSync(tmp, `${JSON.stringify(login, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
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
