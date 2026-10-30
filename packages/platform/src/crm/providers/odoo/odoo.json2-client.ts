import { Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { CrmError } from "../../errors";
import {
  ResponseTooLargeError,
  requestPublic,
} from "../../../net/public-network";
import { ODOO_MAX_RESPONSE_BYTES } from "./odoo.rpc-client";
import { classifyOdooError } from "./odoo.errors";
import type { OdooCredentialPayload } from "./odoo.types";

/**
 * Client for Odoo 19+'s external JSON-2 API.
 *
 * JSON-2 is a modern, documented REST-ish surface that speaks JSON over
 * `/json/2/<model>/<method>` and authenticates with a single header
 * pair: `X-Odoo-Database: <db>` and `Authorization: Bearer <api-key>`.
 * Login/email is only needed for workflows that require owner mapping
 * (e.g. when setting `user_id` on a lead to a named user). For pure
 * read/write to `res.partner` or `crm.lead` the API key alone is
 * sufficient.
 *
 * The contract is intentionally very close to `execute_kw`, so we expose
 * a matching `call()` method that higher layers share across providers
 * via `OdooJson2Provider`.
 */
export class OdooJson2Client {
  private readonly logger = new Logger(OdooJson2Client.name);
  private readonly timeoutMs = 20_000;

  async version(
    baseUrl: string,
  ): Promise<{ server_version?: string; server_serie?: string } | null> {
    try {
      return await this.raw<{ server_version?: string; server_serie?: string }>(
        baseUrl,
        "GET",
        "/json/2/version",
        {},
        {},
        null,
      );
    } catch {
      return null;
    }
  }

  async call<T = unknown>(
    creds: OdooCredentialPayload,
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    return this.raw<T>(
      creds.baseUrl,
      "POST",
      `/json/2/${encodeURIComponent(model)}/${encodeURIComponent(method)}`,
      this.authHeaders(creds),
      { args, kwargs },
      null,
    );
  }

  /**
   * Probe endpoint used during validateConnection(). On a 404 here we
   * conclude the server does not expose the JSON-2 surface (i.e. Odoo
   * < 19, or 19+ with the endpoint disabled).
   */
  async probe(
    creds: OdooCredentialPayload,
  ): Promise<{ available: boolean; status: number }> {
    try {
      await this.raw<unknown>(
        creds.baseUrl,
        "POST",
        `/json/2/res.users/search_count`,
        this.authHeaders(creds),
        { args: [[]] },
        null,
      );
      return { available: true, status: 200 };
    } catch (err) {
      if (err instanceof CrmError) {
        const details = err.providerDetails as { status?: number } | undefined;
        const status =
          typeof details?.status === "number"
            ? details.status
            : err.code === "NOT_FOUND"
              ? 404
              : 500;
        return { available: err.code !== "NOT_FOUND", status };
      }
      return { available: false, status: 0 };
    }
  }

  private authHeaders(creds: OdooCredentialPayload): Record<string, string> {
    return {
      Authorization: `Bearer ${creds.apiKey}`,
      "X-Odoo-Database": creds.database,
    };
  }

  private async raw<T>(
    baseUrl: string,
    method: "GET" | "POST",
    path: string,
    headers: Record<string, string>,
    body: unknown,
    _signal: AbortSignal | null,
  ): Promise<T> {
    let res: Response;
    try {
      // The customer's server, so the request goes through Ringee's network
      // policy: no private addresses, no redirects, a bounded body.
      res = await requestPublic(new URL(`${baseUrl}${path}`), {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "ringee/1.0 odoo-json2",
          ...headers,
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        timeoutMs: this.timeoutMs,
        maxBodyBytes: ODOO_MAX_RESPONSE_BYTES,
        allowPrivateNetwork: apiConfiguration.OUTBOUND_ALLOW_PRIVATE_NETWORK,
      });
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === "AbortError" || name === "TimeoutError") {
        throw new CrmError(
          "TRANSIENT",
          true,
          `odoo json-2 timeout after ${this.timeoutMs}ms`,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new CrmError(
        "TRANSIENT",
        true,
        `odoo json-2 network error: ${msg}`,
      );
    }

    let parsed: unknown = undefined;
    try {
      const text = await res.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    } catch (err) {
      if (err instanceof ResponseTooLargeError) {
        throw new CrmError("TRANSIENT", false, `odoo json-2 ${err.message}`);
      }
      parsed = undefined;
    }

    if (!res.ok) {
      // Preserve HTTP status on classified error so probe() can
      // distinguish 404 (api not available) from 401 (bad creds).
      const err = classifyOdooError(res.status, parsed);
      (err.providerDetails as Record<string, unknown>) = {
        ...((err.providerDetails as Record<string, unknown> | null) ?? {}),
        status: res.status,
      };
      throw err;
    }

    if (parsed && typeof parsed === "object" && "error" in parsed) {
      throw classifyOdooError(200, parsed);
    }
    if (parsed && typeof parsed === "object" && "result" in parsed) {
      return (parsed as { result: T }).result;
    }
    return parsed as T;
  }
}
