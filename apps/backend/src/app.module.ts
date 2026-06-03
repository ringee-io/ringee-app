import { Module, OnApplicationBootstrap } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "@ringee/database";
import { ApiModule } from "./api/api.module";
import { ServicesModule, DialerOrchestrationService } from "@ringee/services";
import { McpModule } from "./mcp/mcp.module";
import { RedisModule } from "@ringee/platform";
import { APP_GUARD } from "@nestjs/core";
import { ClerkAuthGuard } from "./clerk.auth.guard";
import { TriggerLoopModule } from "./triggerloop/triggerloop.module";

@Module({
  imports: [
    DatabaseModule,
    ApiModule,
    ServicesModule,
    McpModule,
    RedisModule,
    TriggerLoopModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(
    private readonly dialerOrchestration: DialerOrchestrationService,
  ) {}

  /**
   * Start the dialer poll loop here (and only here). It must run in the same
   * process as the SSE endpoint so lead assignments reach agents; the worker
   * process must NOT poll (see DialerOrchestrationService.startPolling).
   */
  onApplicationBootstrap(): void {
    this.dialerOrchestration.startPolling();
  }
}
