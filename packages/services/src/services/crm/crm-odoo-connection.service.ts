import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { CrmConnection } from "@ringee/database";
import {
  CrmProviderRegistry,
  OdooJson2Provider,
  OdooLegacyProvider,
  OwnershipContext,
  serializeOdooCredentials,
  validateCredentialInput,
  type OdooCredentialInput,
  type OdooValidationReason,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

export type OdooConnectInput = OdooCredentialInput & {
  provider: "odoo_14_18" | "odoo_19_plus";
};

export type OdooConnectResult =
  | {
      ok: true;
      connection: {
        id: string;
        provider: "odoo_14_18" | "odoo_19_plus";
        accountName: string | null;
      };
    }
  | {
      ok: false;
      reason: OdooValidationReason;
      message: string;
      field?: keyof OdooCredentialInput;
    };

@Injectable()
export class CrmOdooConnectionService {
  private readonly logger = new Logger(CrmOdooConnectionService.name);

  constructor(
    @Inject(CrmConnectionService)
    private readonly connections: CrmConnectionService,
    @Inject(CrmProviderRegistry)
    private readonly registry: CrmProviderRegistry,
    @Inject(OdooLegacyProvider)
    private readonly odooLegacy: OdooLegacyProvider,
    @Inject(OdooJson2Provider)
    private readonly odooJson2: OdooJson2Provider,
  ) {}

  async connect(
    ctx: OwnershipContext,
    input: OdooConnectInput,
  ): Promise<OdooConnectResult> {
    if (!ctx?.userId) throw new UnauthorizedException();
    if (input.provider !== "odoo_14_18" && input.provider !== "odoo_19_plus") {
      throw new BadRequestException(`unknown odoo provider: ${input.provider}`);
    }

    const loginRequired = input.provider === "odoo_14_18";
    const parsed = validateCredentialInput(input, { loginRequired });
    if (!parsed.ok) {
      return {
        ok: false,
        reason: "invalid_credentials",
        message: parsed.message,
        field: parsed.field,
      };
    }

    // Delegate validation to the provider itself so each flavor owns its
    // probe logic and reason-mapping.
    if (input.provider === "odoo_14_18") {
      const result = await this.odooLegacy.validateConnection(parsed.value);
      if (!result.ok)
        return { ok: false, reason: result.reason, message: result.message };

      const blob = serializeOdooCredentials({
        ...parsed.value,
        uid: result.uid,
      });
      const connection = await this.persist(
        ctx,
        "odoo_14_18",
        parsed.value,
        blob,
        {
          mode: "rpc",
          serverVersion: result.serverVersion,
          serverSeries: result.serverSeries,
        },
        result.capabilities,
      );
      return {
        ok: true,
        connection: {
          id: connection.id,
          provider: "odoo_14_18",
          accountName: connection.externalAccountName ?? null,
        },
      };
    }

    const result = await this.odooJson2.validateConnection(parsed.value);
    if (!result.ok)
      return { ok: false, reason: result.reason, message: result.message };

    const blob = serializeOdooCredentials(parsed.value);
    const connection = await this.persist(
      ctx,
      "odoo_19_plus",
      parsed.value,
      blob,
      {
        mode: "json2",
        serverVersion: result.serverVersion,
        serverSeries: result.serverSeries,
      },
      result.capabilities,
    );
    return {
      ok: true,
      connection: {
        id: connection.id,
        provider: "odoo_19_plus",
        accountName: connection.externalAccountName ?? null,
      },
    };
  }

  private async persist(
    ctx: OwnershipContext,
    provider: "odoo_14_18" | "odoo_19_plus",
    parsed: { baseUrl: string; database: string },
    credentialBlob: string,
    metadata: Record<string, unknown>,
    capabilities: { supportsContactWrite: boolean; supportsTasks: boolean },
  ): Promise<CrmConnection> {
    // Stable externalAccountId so re-saving the same URL+DB idempotently
    // replaces the existing connection (and rotates the api key).
    const externalAccountId = `${parsed.baseUrl}#${parsed.database}`;
    return this.connections.upsertFromCredentials(ctx, provider, {
      credentialBlob,
      externalAccountId,
      externalAccountName: parsed.database,
      providerMetadata: metadata,
      capabilities: {
        supportsCompanies: true,
        supportsTasks: capabilities.supportsTasks,
        supportsLists: false,
        supportsRecordingUrl: true,
        supportsTranscript: true,
        supportsCallObject: false,
        supportsContactWrite: capabilities.supportsContactWrite,
      },
    });
  }
}
