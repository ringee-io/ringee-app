import { Global, Module, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { AttioProvider } from "./providers/attio/attio.provider";
import { GoHighLevelProvider } from "./providers/gohighlevel/gohighlevel.provider";
import { HubSpotProvider } from "./providers/hubspot/hubspot.provider";
import { OdooJson2Provider } from "./providers/odoo/odoo-json2.provider";
import { OdooLegacyProvider } from "./providers/odoo/odoo-legacy.provider";
import { CrmProviderRegistry } from "./registry";

@Global()
@Module({
  providers: [
    CrmProviderRegistry,
    {
      provide: AttioProvider,
      useFactory: () =>
        new AttioProvider({
          clientId: apiConfiguration.ATTIO_OAUTH_CLIENT_ID ?? "",
          clientSecret: apiConfiguration.ATTIO_OAUTH_CLIENT_SECRET ?? "",
          apiBaseUrl:
            apiConfiguration.ATTIO_API_BASE_URL ?? "https://api.attio.com",
          authorizeUrl:
            apiConfiguration.ATTIO_OAUTH_AUTHORIZE_URL ??
            "https://app.attio.com/authorize",
          tokenUrl:
            apiConfiguration.ATTIO_OAUTH_TOKEN_URL ??
            "https://app.attio.com/oauth/token",
        }),
    },
    {
      provide: HubSpotProvider,
      useFactory: () =>
        new HubSpotProvider({
          clientId: apiConfiguration.HUBSPOT_OAUTH_CLIENT_ID ?? "",
          clientSecret: apiConfiguration.HUBSPOT_OAUTH_CLIENT_SECRET ?? "",
          apiBaseUrl:
            apiConfiguration.HUBSPOT_API_BASE_URL ?? "https://api.hubapi.com",
          authorizeUrl:
            apiConfiguration.HUBSPOT_OAUTH_AUTHORIZE_URL ??
            "https://app.hubspot.com/oauth/authorize",
          tokenUrl:
            apiConfiguration.HUBSPOT_OAUTH_TOKEN_URL ??
            "https://api.hubapi.com/oauth/v1/token",
          scopes: parseScopes(apiConfiguration.HUBSPOT_OAUTH_SCOPES, [
            "crm.objects.contacts.read",
            "crm.objects.contacts.write",
            "crm.objects.companies.read",
            "crm.objects.companies.write",
            "crm.objects.owners.read",
            "crm.objects.calls.write",
            "crm.objects.notes.write",
            "crm.objects.tasks.write",
            "crm.objects.meetings.write",
          ]),
        }),
    },
    {
      provide: GoHighLevelProvider,
      useFactory: () =>
        new GoHighLevelProvider({
          clientId: apiConfiguration.GOHIGHLEVEL_OAUTH_CLIENT_ID ?? "",
          clientSecret: apiConfiguration.GOHIGHLEVEL_OAUTH_CLIENT_SECRET ?? "",
          versionId: apiConfiguration.GOHIGHLEVEL_OAUTH_VERSION_ID,
          apiBaseUrl:
            apiConfiguration.GOHIGHLEVEL_API_BASE_URL ??
            "https://services.leadconnectorhq.com",
          authorizeUrl:
            apiConfiguration.GOHIGHLEVEL_OAUTH_AUTHORIZE_URL ??
            "https://marketplace.gohighlevel.com/v2/oauth/chooselocation",
          tokenUrl:
            apiConfiguration.GOHIGHLEVEL_OAUTH_TOKEN_URL ??
            "https://services.leadconnectorhq.com/oauth/token",
          scopes: parseScopes(apiConfiguration.GOHIGHLEVEL_OAUTH_SCOPES, [
            "contacts.readonly",
            "contacts.write",
            "locations.readonly",
            "users.readonly",
          ]),
        }),
    },
    OdooLegacyProvider,
    OdooJson2Provider,
  ],
  exports: [
    CrmProviderRegistry,
    AttioProvider,
    HubSpotProvider,
    GoHighLevelProvider,
    OdooLegacyProvider,
    OdooJson2Provider,
  ],
})
export class CrmModule implements OnModuleInit {
  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly attio: AttioProvider,
    private readonly hubspot: HubSpotProvider,
    private readonly gohighlevel: GoHighLevelProvider,
    private readonly odooLegacy: OdooLegacyProvider,
    private readonly odooJson2: OdooJson2Provider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.attio);
    this.registry.register(this.hubspot);
    this.registry.register(this.gohighlevel);
    this.registry.register(this.odooLegacy);
    this.registry.register(this.odooJson2);
  }
}

function parseScopes(
  configured: string | undefined,
  defaults: string[],
): string[] {
  const scopes = configured?.split(/[\s,]+/).filter(Boolean);
  return scopes && scopes.length > 0 ? scopes : defaults;
}
