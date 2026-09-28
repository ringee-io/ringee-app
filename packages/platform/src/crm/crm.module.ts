import { Global, Module, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { AttioProvider } from "./providers/attio/attio.provider";
import { HubSpotProvider } from "./providers/hubspot/hubspot.provider";
import { OdooJson2Provider } from "./providers/odoo/odoo-json2.provider";
import { OdooLegacyProvider } from "./providers/odoo/odoo-legacy.provider";
import { CrmProviderRegistry } from "./registry";

/** Scope lists are configured space-separated, as HubSpot's install URL takes them. */
function splitScopes(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

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
          apiBaseUrl: apiConfiguration.HUBSPOT_API_BASE_URL,
          authorizeUrl: apiConfiguration.HUBSPOT_OAUTH_AUTHORIZE_URL,
          scopes: splitScopes(apiConfiguration.HUBSPOT_OAUTH_SCOPES),
          optionalScopes: splitScopes(
            apiConfiguration.HUBSPOT_OAUTH_OPTIONAL_SCOPES,
          ),
        }),
    },
    OdooLegacyProvider,
    OdooJson2Provider,
  ],
  exports: [
    CrmProviderRegistry,
    AttioProvider,
    HubSpotProvider,
    OdooLegacyProvider,
    OdooJson2Provider,
  ],
})
export class CrmModule implements OnModuleInit {
  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly attio: AttioProvider,
    private readonly hubspot: HubSpotProvider,
    private readonly odooLegacy: OdooLegacyProvider,
    private readonly odooJson2: OdooJson2Provider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.attio);
    this.registry.register(this.hubspot);
    this.registry.register(this.odooLegacy);
    this.registry.register(this.odooJson2);
  }
}
