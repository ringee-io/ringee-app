import { Global, Module, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { AttioProvider } from "./providers/attio/attio.provider";
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
          apiBaseUrl: apiConfiguration.ATTIO_API_BASE_URL ?? "https://api.attio.com",
          authorizeUrl:
            apiConfiguration.ATTIO_OAUTH_AUTHORIZE_URL ?? "https://app.attio.com/authorize",
          tokenUrl:
            apiConfiguration.ATTIO_OAUTH_TOKEN_URL ?? "https://app.attio.com/oauth/token",
        }),
    },
  ],
  exports: [CrmProviderRegistry, AttioProvider],
})
export class CrmModule implements OnModuleInit {
  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly attio: AttioProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.attio);
  }
}
