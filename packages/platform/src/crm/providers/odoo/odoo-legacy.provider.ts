import { Injectable } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { CrmError } from "../../errors";
import { OdooBaseProvider } from "./odoo.base-provider";
import {
  OdooValidationError,
  type OdooValidationReason,
  mapToValidationReason,
} from "./odoo.errors";
import { OdooRpcClient } from "./odoo.rpc-client";
import type { OdooApiMode, OdooCredentialPayload } from "./odoo.types";

@Injectable()
export class OdooLegacyProvider extends OdooBaseProvider {
  readonly type: CrmProviderType = "odoo_14_18";
  readonly mode: OdooApiMode = "rpc";

  private readonly rpc = new OdooRpcClient();

  /**
   * Odoo 14–18 authenticates once via `common.login()` to retrieve a uid
   * and then reuses `(db, uid, apiKey)` as the credential triple on every
   * `execute_kw()` call. We cache the uid on the credential payload so
   * callers within the same request don't re-auth.
   */
  protected async authenticate(creds: OdooCredentialPayload): Promise<number> {
    const uid = await this.rpc.authenticate(creds);
    creds.uid = uid;
    return uid;
  }

  protected callModel<T = unknown>(
    creds: OdooCredentialPayload,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const uid = creds.uid;
    if (!uid) {
      throw new CrmError(
        "AUTH_REVOKED",
        false,
        "odoo session not authenticated (internal bug)",
      );
    }
    return this.rpc.executeKw<T>(creds, uid, model, method, args, kwargs);
  }

  /**
   * Called by the connection-creation controller. Runs a series of light
   * probes against the Odoo server and returns a structured result
   * whose `reason` maps one-to-one to UI error strings.
   */
  async validateConnection(creds: OdooCredentialPayload): Promise<
    | {
        ok: true;
        uid: number;
        serverVersion: string | null;
        serverSeries: string | null;
        capabilities: { supportsContactWrite: boolean; supportsTasks: boolean };
      }
    | { ok: false; reason: OdooValidationReason; message: string }
  > {
    try {
      // 1) Base URL reachability + version (also tells us the series).
      const version = await this.rpc.version(creds.baseUrl);
      if (!version) {
        throw new OdooValidationError(
          "invalid_base_url",
          "odoo server did not respond",
        );
      }

      const series = version.server_serie ?? null;
      if (series) {
        const major = Number(series.split(".")[0] || "0");
        if (major >= 19) {
          throw new OdooValidationError(
            "api_mode_not_available",
            `Odoo ${series} detected — use the Odoo 19+ integration instead`,
          );
        }
        if (major > 0 && major < 14) {
          throw new OdooValidationError(
            "unsupported_version",
            `Odoo ${series} is older than 14 and is not supported`,
          );
        }
      }

      // 2) Authenticate (validates login + apiKey + database).
      const uid = await this.rpc.authenticate(creds);
      if (!uid) {
        throw new OdooValidationError(
          "invalid_credentials",
          "login, password/api key or database rejected",
        );
      }

      // 3) Prove read access with a real operation. `check_access_rights`
      //    inspects ir.model.access rules only and raises on setups where
      //    the user effectively can read via record rules — so we issue
      //    an actual `search_count` which is the authoritative test.
      try {
        await this.rpc.executeKw<number>(
          creds,
          uid,
          "res.partner",
          "search_count",
          [[]],
          { limit: 1 },
        );
      } catch (err) {
        throw new OdooValidationError(
          "partner_access_denied",
          "this api key cannot read res.partner",
          err,
        );
      }

      // 4) Write + activity access are non-fatal: we store them as
      //    capability flags so the connection still succeeds with reduced
      //    functionality (e.g. read-only CRM, no task sync).
      const supportsContactWrite = await this.probeAccess(
        creds,
        uid,
        "res.partner",
        "write",
      );
      const supportsTasks = await this.probeAccess(
        creds,
        uid,
        "mail.activity",
        "create",
      );

      return {
        ok: true,
        uid,
        serverVersion: version.server_version ?? null,
        serverSeries: series,
        capabilities: { supportsContactWrite, supportsTasks },
      };
    } catch (err) {
      if (err instanceof OdooValidationError) {
        return { ok: false, reason: err.reason, message: err.message };
      }
      return {
        ok: false,
        reason: mapToValidationReason(err),
        message: errorMessage(err),
      };
    }
  }

  private async probeAccess(
    creds: OdooCredentialPayload,
    uid: number,
    model: string,
    operation: "read" | "write" | "create" | "unlink",
  ): Promise<boolean> {
    try {
      await this.rpc.executeKw<boolean>(
        creds,
        uid,
        model,
        "check_access_rights",
        [operation],
        { raise_exception: true },
      );
      return true;
    } catch {
      return false;
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
