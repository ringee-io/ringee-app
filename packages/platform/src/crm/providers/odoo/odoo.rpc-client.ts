import { Logger } from "@nestjs/common";
import { CrmError } from "../../errors";
import { classifyOdooError } from "./odoo.errors";
import type { OdooCredentialPayload } from "./odoo.types";

/**
 * Thin wrapper around Odoo's classic RPC endpoints.
 *
 * Odoo 14–18 do not expose a truly "external" JSON-RPC surface; instead
 * they expose the XML-RPC endpoints (`/xmlrpc/2/common`, `/xmlrpc/2/object`)
 * and the JSON-RPC bridge at `/jsonrpc`. We use the JSON-RPC bridge to
 * avoid pulling an XML-RPC dependency — Odoo accepts the same
 * `{service, method, args}` contract over JSON.
 *
 * Auth flow:
 *  1. `service: "common", method: "login"` → returns uid
 *  2. All subsequent calls go through
 *     `service: "object", method: "execute_kw"` with
 *     `[database, uid, apiKey, model, method, args, kwargs]`.
 *
 * An API key (starting Odoo 14) is interchangeable with a password on
 * `login()` / `execute_kw()` — we store it as `apiKey` and never log it.
 */
export class OdooRpcClient {
  private readonly logger = new Logger(OdooRpcClient.name);
  private readonly timeoutMs = 20_000;

  async authenticate(creds: OdooCredentialPayload): Promise<number> {
    if (creds.uid && creds.uid > 0) return creds.uid;
    if (!creds.login) {
      throw new CrmError(
        "VALIDATION",
        false,
        "login is required for Odoo 14–18",
      );
    }
    const uid = await this.jsonRpc<number | false>(creds.baseUrl, {
      service: "common",
      method: "login",
      args: [creds.database, creds.login, creds.apiKey],
    });
    if (!uid) {
      throw new CrmError(
        "AUTH_REVOKED",
        false,
        "invalid Odoo credentials (login failed)",
      );
    }
    return uid;
  }

  async version(baseUrl: string): Promise<{ server_version?: string; server_serie?: string } | null> {
    try {
      return await this.jsonRpc<{
        server_version?: string;
        server_serie?: string;
      }>(baseUrl, {
        service: "common",
        method: "version",
        args: [],
      });
    } catch {
      return null;
    }
  }

  async listDatabases(baseUrl: string): Promise<string[]> {
    // Only available when `list_db` is enabled on the server — we
    // treat a failure as "unknown" rather than an error.
    try {
      return await this.jsonRpc<string[]>(baseUrl, {
        service: "db",
        method: "list",
        args: [],
      });
    } catch {
      return [];
    }
  }

  async executeKw<T = unknown>(
    creds: OdooCredentialPayload,
    uid: number,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    return this.jsonRpc<T>(creds.baseUrl, {
      service: "object",
      method: "execute_kw",
      args: [creds.database, uid, creds.apiKey, model, method, args, kwargs],
    });
  }

  private async jsonRpc<T>(
    baseUrl: string,
    params: { service: string; method: string; args: unknown[] },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params,
      id: Math.floor(Math.random() * 1_000_000),
    };

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/jsonrpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "ringee/1.0 odoo-rpc",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      const name = (err as { name?: string }).name;
      if (name === "AbortError") {
        throw new CrmError("TRANSIENT", true, `odoo timeout after ${this.timeoutMs}ms`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new CrmError("TRANSIENT", true, `odoo network error: ${msg}`);
    }
    clearTimeout(timer);

    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }

    if (!res.ok) throw classifyOdooError(res.status, body);

    const envelope = (body ?? {}) as { result?: unknown; error?: unknown };
    if (envelope.error) throw classifyOdooError(200, body);
    return envelope.result as T;
  }
}
