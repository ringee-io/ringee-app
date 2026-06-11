import { Injectable } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { OdooBaseProvider } from "./odoo.base-provider";
import {
  OdooValidationError,
  type OdooValidationReason,
  describeOdooError,
  mapToValidationReason,
} from "./odoo.errors";
import { OdooJson2Client } from "./odoo.json2-client";
import type { OdooApiMode, OdooCredentialPayload } from "./odoo.types";

@Injectable()
export class OdooJson2Provider extends OdooBaseProvider {
  readonly type: CrmProviderType = "odoo_19_plus";
  readonly mode: OdooApiMode = "json2";

  private readonly client = new OdooJson2Client();

  /**
   * JSON-2 is token-authenticated — every request carries the API key
   * in the `Authorization: Bearer` header and the database in
   * `X-Odoo-Database`. There is no "login step", so `authenticate()` is
   * just a probe to retrieve the uid (for owner-mapping workflows and
   * reuse by base-provider helpers).
   */
  protected async authenticate(creds: OdooCredentialPayload): Promise<number> {
    if (creds.uid && creds.uid > 0) return creds.uid;
    try {
      const uids = await this.client.call<number[]>(
        creds,
        "res.users",
        "search",
        [[["login", "=", creds.login || ""]]],
        { limit: 1 },
      );
      if (uids?.[0]) {
        creds.uid = uids[0];
        return uids[0];
      }
    } catch {
      // login/email wasn't provided or not found — fall through
    }
    // When login isn't provided we use uid=0 as a sentinel; base-provider
    // helpers that need uid (owner lookup) should handle null gracefully.
    creds.uid = 0;
    return 0;
  }

  protected callModel<T = unknown>(
    creds: OdooCredentialPayload,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    return this.client.call<T>(creds, model, method, args, kwargs);
  }

  private async probeWriteAccess(
    creds: OdooCredentialPayload,
  ): Promise<boolean> {
    try {
      await this.client.call(
        creds,
        "res.partner",
        "check_access_rights",
        ["write"],
        { raise_exception: true },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async probeActivityAccess(
    creds: OdooCredentialPayload,
  ): Promise<boolean> {
    try {
      await this.client.call(
        creds,
        "mail.activity",
        "check_access_rights",
        ["create"],
        { raise_exception: true },
      );
      return true;
    } catch {
      return false;
    }
  }

  async validateConnection(creds: OdooCredentialPayload): Promise<
    | {
        ok: true;
        serverVersion: string | null;
        serverSeries: string | null;
        capabilities: { supportsContactWrite: boolean; supportsTasks: boolean };
      }
    | { ok: false; reason: OdooValidationReason; message: string }
  > {
    try {
      // 1) Basic reachability through the JSON-2 version endpoint.
      const version = await this.client.version(creds.baseUrl);
      const series = version?.server_serie ?? null;
      if (series) {
        const major = Number(series.split(".")[0] || "0");
        if (major > 0 && major < 19) {
          throw new OdooValidationError(
            "api_mode_not_available",
            `Odoo ${series} does not expose the JSON-2 API — use the Odoo 14–18 integration instead`,
          );
        }
      }

      // 2) Probe the JSON-2 surface with the user's api key.
      const probe = await this.client.probe(creds);
      if (!probe.available && probe.status === 404) {
        throw new OdooValidationError(
          "api_mode_not_available",
          "this Odoo server does not expose the JSON-2 API (not Odoo 19+?)",
        );
      }
      if (!probe.available && probe.status === 0) {
        throw new OdooValidationError(
          "invalid_base_url",
          "could not reach Odoo server",
        );
      }
      if (!probe.available && (probe.status === 401 || probe.status === 403)) {
        throw new OdooValidationError(
          "invalid_credentials",
          "api key, database or login rejected",
        );
      }

      // 3) Prove read access with a real operation (authoritative test).
      //    If the server returns an error, surface the underlying Odoo
      //    message — "access denied" alone is not enough signal for the
      //    user to act on.
      try {
        await this.client.call(creds, "res.partner", "search_count", [[]]);
      } catch (err) {
        const detail = describeOdooError(err);
        // Some Odoo deployments (especially Odoo Online < 19) respond to
        // /json/2/* with an HTML 404 or a generic "unknown model" error —
        // classify that as api_mode_not_available so the user is told
        // to use the 14–18 integration instead.
        if (
          /json[_ -]?2|unknown (method|model)|not found|no such route/i.test(
            detail,
          )
        ) {
          throw new OdooValidationError(
            "api_mode_not_available",
            `Odoo server did not accept the JSON-2 request — ${detail}`,
            err,
          );
        }
        throw new OdooValidationError(
          "partner_access_denied",
          `Odoo rejected res.partner read — ${detail}`,
          err,
        );
      }

      // 4) Write + activity are non-fatal capability flags — connection
      //    still succeeds if these are missing, just with reduced features.
      const supportsContactWrite = await this.probeWriteAccess(creds);
      const supportsTasks = await this.probeActivityAccess(creds);

      // 5) Confirm CRM module is installed when the user expects leads.
      //    Not fatal: we only warn, because plenty of Odoo setups only
      //    need partner sync.
      try {
        await this.client.call(creds, "crm.lead", "search_count", [[]]);
      } catch (err) {
        // Distinguish "model not found" (module missing) from permission errors.
        const msg = err instanceof Error ? err.message : String(err);
        if (/model.+crm\.lead|does not exist|unknown model/i.test(msg)) {
          throw new OdooValidationError(
            "crm_module_missing",
            "Odoo CRM module is not installed — lead sync will not work",
            err,
          );
        }
      }

      return {
        ok: true,
        serverVersion: version?.server_version ?? null,
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
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
