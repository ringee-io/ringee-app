import { Global, Module, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { ApolloProvider } from "./providers/apollo/apollo.provider";
import { ProspeoProvider } from "./providers/prospeo/prospeo.provider";
import { EnrichmentProviderRegistry } from "./registry";

@Global()
@Module({
  providers: [
    EnrichmentProviderRegistry,
    {
      provide: ProspeoProvider,
      useFactory: () =>
        new ProspeoProvider({
          apiBaseUrl: apiConfiguration.PROSPEO_API_BASE_URL,
        }),
    },
    {
      provide: ApolloProvider,
      useFactory: () =>
        new ApolloProvider({
          apiBaseUrl: apiConfiguration.APOLLO_API_BASE_URL,
        }),
    },
  ],
  exports: [EnrichmentProviderRegistry, ProspeoProvider, ApolloProvider],
})
export class EnrichmentModule implements OnModuleInit {
  constructor(
    private readonly registry: EnrichmentProviderRegistry,
    private readonly prospeo: ProspeoProvider,
    private readonly apollo: ApolloProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.prospeo);
    this.registry.register(this.apollo);
  }
}
