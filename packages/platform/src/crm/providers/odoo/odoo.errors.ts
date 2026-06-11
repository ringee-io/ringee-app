import { CrmError } from "../../errors";

/**
 * Application-level error reasons surfaced to the frontend when
 * validateConnection fails. These map one-to-one to the reasons documented
 * in the integration UI so the user sees something actionable.
 */
export type OdooValidationReason =
  | "invalid_credentials"
  | "database_not_found"
  | "invalid_base_url"
  | "unsupported_version"
  | "api_mode_not_available"
  | "crm_module_missing"
  | "insufficient_permissions"
  | "partner_access_denied"
  | "activity_access_denied"
  | "unknown_odoo_error";

export class OdooValidationError extends Error {
  readonly name = "OdooValidationError";
  constructor(
    readonly reason: OdooValidationReason,
    message?: string,
    readonly cause?: unknown,
  ) {
    super(message ?? reason);
  }
}

type OdooLikeBody = {
  error?: {
    code?: number;
    message?: string;
    data?: {
      name?: string;
      message?: string;
      arguments?: unknown[];
      debug?: string;
    };
  };
};

/**
 * Classify a transport error from Odoo. Odoo RPC and JSON-2 both return
 * HTTP 200 with a JSON body whose `error` field carries the real error —
 * status-based classification is a last resort.
 */
export function classifyOdooError(status: number, body: unknown): CrmError {
  const b = (body ?? {}) as OdooLikeBody;
  const name = b.error?.data?.name ?? "";
  const msg = b.error?.data?.message ?? b.error?.message ?? "";

  // Access-related exceptions from Odoo server.
  if (
    name.includes("AccessDenied") ||
    name.includes("AccessError") ||
    /access denied|session expired|login/i.test(msg)
  ) {
    // On Odoo, "session expired" or bad login is not really an OAuth-style
    // expiry — we surface it as AUTH_REVOKED because re-auth requires the
    // user to verify credentials again.
    return new CrmError(
      "AUTH_REVOKED",
      false,
      msg || "odoo access denied",
      undefined,
      body,
    );
  }
  if (name.includes("UserError") || name.includes("ValidationError")) {
    return new CrmError(
      "VALIDATION",
      false,
      msg || "odoo validation error",
      undefined,
      body,
    );
  }
  if (name.includes("MissingError")) {
    return new CrmError(
      "NOT_FOUND",
      false,
      msg || "odoo record missing",
      undefined,
      body,
    );
  }

  if (status === 401 || status === 403) {
    return new CrmError(
      "AUTH_REVOKED",
      false,
      msg || `odoo http ${status}`,
      undefined,
      body,
    );
  }
  if (status === 404)
    return new CrmError(
      "NOT_FOUND",
      false,
      msg || "odoo not found",
      undefined,
      body,
    );
  if (status === 429)
    return new CrmError(
      "RATE_LIMITED",
      true,
      msg || "odoo rate limited",
      undefined,
      body,
    );
  if (status >= 500)
    return new CrmError(
      "TRANSIENT",
      true,
      msg || `odoo server ${status}`,
      undefined,
      body,
    );
  if (msg) return new CrmError("UNKNOWN", false, msg, undefined, body);
  return new CrmError("UNKNOWN", false, `odoo http ${status}`, undefined, body);
}

/**
 * Extracts the human-readable portion of an Odoo error — either from a
 * CrmError's preserved body, a plain Error message, or the raw value.
 */
export function describeOdooError(err: unknown): string {
  if (err instanceof CrmError) {
    const body = err.providerDetails as OdooLikeBody | undefined;
    const serverMsg = body?.error?.data?.message ?? body?.error?.message;
    if (serverMsg) return serverMsg;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Map a classified CrmError or low-level error into a validation reason
 * the UI can display when validating a connection.
 */
export function mapToValidationReason(err: unknown): OdooValidationReason {
  if (err instanceof OdooValidationError) return err.reason;

  if (err instanceof CrmError) {
    const providerBody = err.providerDetails as OdooLikeBody | undefined;
    const name = providerBody?.error?.data?.name ?? "";
    const message = (err.message ?? "").toLowerCase();

    if (err.code === "AUTH_REVOKED" || err.code === "AUTH_EXPIRED") {
      if (message.includes("database") || message.includes("db ")) {
        return "database_not_found";
      }
      return "invalid_credentials";
    }
    if (err.code === "NOT_FOUND") return "database_not_found";
    if (err.code === "VALIDATION" && name.includes("UserError")) {
      if (/module.+not installed|crm/i.test(message))
        return "crm_module_missing";
      return "unknown_odoo_error";
    }
    if (err.code === "TRANSIENT") return "invalid_base_url";
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (/network|enotfound|fetch failed|dns|econnrefused/i.test(msg)) {
    return "invalid_base_url";
  }
  return "unknown_odoo_error";
}
