import { apiConfiguration } from "@ringee/configuration";
import { CrmError } from "../../errors";
import { isPrivateHost } from "../../../net/public-network";
import type { CrmCredentials } from "../../types";
import type { OdooCredentialPayload } from "./odoo.types";

/**
 * Odoo connections are credential-based rather than OAuth. To reuse the
 * existing `CrmConnection.accessTokenCiphertext` column without a schema
 * change, we encrypt the full credential blob (base URL, database, login,
 * API key, optional uid cache) as the "access token" and leave the
 * refresh token column empty.
 */

export type OdooCredentialInput = {
  baseUrl: string;
  database: string;
  /** Optional for odoo_19_plus — required for odoo_14_18. */
  login?: string;
  apiKey: string;
};

export type OdooCredentialValidation =
  | { ok: true; value: OdooCredentialPayload }
  | { ok: false; field: keyof OdooCredentialInput; message: string };

export function validateCredentialInput(
  input: OdooCredentialInput,
  opts: { loginRequired: boolean },
): OdooCredentialValidation {
  const baseUrl = (input.baseUrl ?? "").trim();
  if (!baseUrl) {
    return { ok: false, field: "baseUrl", message: "baseUrl is required" };
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return {
      ok: false,
      field: "baseUrl",
      message: "baseUrl is not a valid URL",
    };
  }
  // The server is the customer's choice but the request is Ringee's: a plain
  // http(s) origin (optionally with a path), on a public address.
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return {
      ok: false,
      field: "baseUrl",
      message: "baseUrl must be a plain http(s) address",
    };
  }
  if (
    !apiConfiguration.OUTBOUND_ALLOW_PRIVATE_NETWORK &&
    isPrivateHost(parsed.hostname)
  ) {
    return {
      ok: false,
      field: "baseUrl",
      message: "baseUrl must be a public address",
    };
  }

  const database = (input.database ?? "").trim();
  if (!database) {
    return { ok: false, field: "database", message: "database is required" };
  }

  const apiKey = (input.apiKey ?? "").trim();
  if (!apiKey) {
    return { ok: false, field: "apiKey", message: "apiKey is required" };
  }

  const login = (input.login ?? "").trim();
  if (opts.loginRequired && !login) {
    return { ok: false, field: "login", message: "login is required" };
  }

  return {
    ok: true,
    value: {
      baseUrl: normalizeBaseUrl(baseUrl),
      database,
      login,
      apiKey,
      uid: null,
    },
  };
}

export function serializeOdooCredentials(p: OdooCredentialPayload): string {
  return JSON.stringify({ v: 1, ...p });
}

export function parseOdooCredentials(
  creds: CrmCredentials,
): OdooCredentialPayload {
  try {
    const parsed = JSON.parse(
      creds.accessToken,
    ) as Partial<OdooCredentialPayload> & {
      v?: number;
    };
    if (!parsed.baseUrl || !parsed.database || !parsed.apiKey) {
      throw new Error("incomplete odoo credentials");
    }
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl),
      database: parsed.database,
      login: parsed.login ?? "",
      apiKey: parsed.apiKey,
      uid: typeof parsed.uid === "number" ? parsed.uid : null,
    };
  } catch (err) {
    throw new CrmError(
      "VALIDATION",
      false,
      err instanceof Error ? err.message : "corrupt odoo credentials",
    );
  }
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
