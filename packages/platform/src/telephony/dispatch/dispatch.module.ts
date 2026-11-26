import { Global, Module } from "@nestjs/common";
import {
  DispatchRuntime,
  ProviderDispatchService,
} from "./provider-dispatch.service";
import {
  DispatchRedisConnection,
  PROVIDER_DISPATCH_REDIS,
} from "./dispatch-redis";

/**
 * Global because the Telnyx client (platform) and the services that declare what
 * a call is (services) both need the one instance: a second one would keep its
 * own breaker, counters and settings cache.
 */
@Global()
@Module({
  providers: [
    DispatchRedisConnection,
    {
      provide: PROVIDER_DISPATCH_REDIS,
      useFactory: (connection: DispatchRedisConnection) => connection.redis,
      inject: [DispatchRedisConnection],
    },
    DispatchRuntime,
    ProviderDispatchService,
  ],
  exports: [DispatchRuntime, ProviderDispatchService],
})
export class DispatchModule {}
