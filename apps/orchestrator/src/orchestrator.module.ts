import { Module } from "@nestjs/common";
import {
  RedisModule,
  TelephonyModule,
  TemporalModule,
  UploadModule,
} from "@ringee/platform";
import { ServicesModule } from "@ringee/services";
import { DatabaseModule } from "@ringee/database";

/**
 * DI container for the Temporal worker process. No HTTP server — main.ts
 * creates an application context, resolves the services that back the
 * Temporal activities, and runs the worker loop.
 */
@Module({
  imports: [
    DatabaseModule,
    UploadModule,
    ServicesModule,
    TelephonyModule,
    RedisModule,
    TemporalModule,
  ],
})
export class OrchestratorModule {}
