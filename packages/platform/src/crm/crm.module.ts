import { Global, Module, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { AttioProvider } from "./providers/attio/attio.provider";
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
    OdooLegacyProvider,
    OdooJson2Provider,
  ],
  exports: [
    CrmProviderRegistry,
    AttioProvider,
    OdooLegacyProvider,
    OdooJson2Provider,
  ],
})
export class CrmModule implements OnModuleInit {
  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly attio: AttioProvider,
    private readonly odooLegacy: OdooLegacyProvider,
    private readonly odooJson2: OdooJson2Provider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.attio);
    this.registry.register(this.odooLegacy);
    this.registry.register(this.odooJson2);
  }
}
