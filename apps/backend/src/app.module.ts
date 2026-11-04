import { Module, OnApplicationBootstrap } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "@ringee/database";
import { ApiModule } from "./api/api.module";
import {
  ServicesModule,
  DialerOrchestrationService,
  SSEBridgeService,
} from "@ringee/services";
import { McpModule } from "./mcp/mcp.module";
import { RedisModule } from "@ringee/platform";
import { APP_GUARD } from "@nestjs/core";
import { ClerkAuthGuard } from "./clerk.auth.guard";
import { TriggerLoopModule } from "./triggerloop/triggerloop.module";
import { BackendRealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    DatabaseModule,
    ApiModule,
    ServicesModule,
    McpModule,
    RedisModule,
    BackendRealtimeModule,
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
    private readonly sseBridge: SSEBridgeService,
  ) {}

  /**
   * Relay SSE events between API instances before the first stream opens, then
   * start the dialer poll loop — here and only here: the worker process must
   * NOT poll (see DialerOrchestrationService.startPolling).
   */
  onApplicationBootstrap(): void {
    void this.sseBridge.listen();
    this.dialerOrchestration.startPolling();
  }
}
