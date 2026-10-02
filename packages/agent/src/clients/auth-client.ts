import { normalizeBackendUrl } from "../config.js";

/** Who a key acts as, and where — the backend's account summary. */
export interface RingeeAccount {
  user: { email: string | null; name: string | null };
  workspace: { id: string; type: "personal" | "organization"; name: string };
}

export interface RingeeWhoami extends RingeeAccount {
  key: {
    id: string;
    name: string;
    prefix: string;
    source: "dashboard" | "cli";
    createdAt: string;
  };
}

/** RFC 8628 §3.2 device authorization response (camel-cased). */
export interface DeviceLoginStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceLoginResult extends RingeeAccount {
  apiKey: string;
  keyPrefix: string;
}

export type DeviceLoginFailure = "access_denied" | "expired_token";

export class RingeeAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RingeeAuthError";
  }
}

/**
 * REST client for the account endpoints the CLI needs around the MCP:
 * `ringee login` (device authorization), `whoami` and `logout`.
 * Like the rest of this package it holds no business rules.
 */
export class RingeeAuthClient {
  private readonly base: string;

  constructor(
    backendUrl: string,
    private readonly userAgent = "ringee-agent",
  ) {
    this.base = `${normalizeBackendUrl(backendUrl)}/api`;
  }

  startDeviceLogin(device: {
    deviceName?: string;
    platform?: string;
    clientVersion?: string;
  }): Promise<DeviceLoginStart> {
    return this.request<DeviceLoginStart>("POST", "/cli/auth/device", {
      body: device,
    });
  }

  /**
   * Poll until the user approves or denies in the browser, the code expires,
   * or `signal` aborts. Honors the server's `interval` and `slow_down`.
   */
  async waitForDeviceLogin(
    start: DeviceLoginStart,
    signal?: AbortSignal,
  ): Promise<DeviceLoginResult> {
    let intervalMs = Math.max(1, start.interval) * 1000;
    const deadline = Date.now() + start.expiresIn * 1000;

    while (Date.now() < deadline) {
      await sleep(intervalMs, signal);
      try {
        return await this.request<DeviceLoginResult>(
          "POST",
          "/cli/auth/token",
          {
            body: { deviceCode: start.deviceCode },
          },
        );
      } catch (err) {
        if (!(err instanceof RingeeAuthError)) throw err;
        switch (err.code) {
          case "authorization_pending":
            continue;
          case "slow_down":
            intervalMs += 2000;
            continue;
          case "access_denied":
            throw new RingeeAuthError(
              "Login was denied in the browser.",
              err.status,
              "access_denied",
            );
          case "expired_token":
            throw new RingeeAuthError(
              "The login code expired. Run `ringee login` again.",
              err.status,
              "expired_token",
            );
          default:
            // A transient network or server error should not end the login.
            if (err.status === undefined || err.status >= 500) continue;
            throw err;
        }
      }
    }
    throw new RingeeAuthError(
      "The login code expired. Run `ringee login` again.",
      undefined,
      "expired_token",
    );
  }

  whoami(apiKey: string): Promise<RingeeWhoami> {
    return this.request<RingeeWhoami>("GET", "/cli/auth/whoami", { apiKey });
  }

  /** Revoke the key on the server (the key revokes itself). */
  async logout(apiKey: string): Promise<void> {
    await this.request<void>("POST", "/cli/auth/logout", { apiKey });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; apiKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (err) {
      throw new RingeeAuthError(
        `Could not reach Ringee at ${this.base} (${(err as Error).message}).`,
      );
    }

    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const payload = (data ?? {}) as { error?: unknown; message?: unknown };
      const code =
        typeof payload.error === "string" ? payload.error : undefined;
      const message = Array.isArray(payload.message)
        ? payload.message.join(", ")
        : typeof payload.message === "string"
          ? payload.message
          : (code ?? `Ringee API responded ${res.status}`);
      throw new RingeeAuthError(message, res.status, code);
    }
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new RingeeAuthError("Login cancelled."));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new RingeeAuthError("Login cancelled."));
      },
      { once: true },
    );
  });
}
